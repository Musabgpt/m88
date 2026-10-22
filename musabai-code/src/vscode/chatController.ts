import { randomBytes } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import * as vscode from 'vscode';
import { AgentSession } from '../core/agent/agent';
import type { EditorState } from '../core/agent/prompts';
import { CheckpointStore } from '../core/checkpoints';
import { type ApprovalRequest, type ApprovalResult, NodeHost } from '../core/host';
import { type Mention, resolveMentions } from '../core/mentions';
import { complete, extractCodeBlock } from '../core/oneshot';
import { allowPrefix } from '../core/policy';
import { AUTO_MODEL_ID } from '../core/providers/catalog';
import type { AgentEvent } from '../core/tools/types';
import { newId } from '../core/util';
import { readMemory } from '../core/memory';
import { environmentProvider, rulesProvider } from '../core/workspace';
import {
  type ApprovalView,
  type ChatEvent,
  type ChatView,
  type ChangeFile,
  type HostMessage,
  type MentionChip,
  type ModelOption,
  type UiMessage,
  type ViewMessage,
  type ViewState,
  reduceChat,
} from '../webview/shared/protocol';
import { ChatStore, type StoredChat } from './chatStore';
import { chatModel, disabledTools, get, language, modes, policy, set } from './config';
import { t } from './l10n';
import { problemsText, searchMentions } from './mentionSearch';
import type { ReviewController } from './review';
import type { Services } from './services';
import type { TerminalAssist } from './terminalAssist';

interface LiveChat {
  stored: StoredChat;
  session: AgentSession;
  checkpoints: CheckpointStore;
  controller?: AbortController;
  assistantId?: string;
  saveTimer?: NodeJS.Timeout;
}

const ALWAYS_KEY = 'musabai.alwaysAllowed';
// When a turn runs out of its step budget, the agent is told to carry on instead of stopping for the user to click.
const CONTINUE_PROMPT = 'Continue working toward the goal. Keep going until the task is fully done and verified; do not stop to ask whether to continue.';

function view(chat: StoredChat): ChatView {
  return { id: chat.id, title: chat.title, messages: chat.messages };
}

export class ChatController implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewId = 'musabai.chat';
  private view?: vscode.WebviewView;
  private ready = false;
  private queue: HostMessage[] = [];
  private readonly store: ChatStore;
  private readonly live = new Map<string, LiveChat>();
  private activeId = '';
  private readonly approvals = new Map<string, { resolve: (a: ApprovalResult) => void; chatId: string; messageId: string; key?: string }>();
  private pendingText?: { chatId: string; messageId: string; event: AgentEvent & { type: 'text' | 'reasoning' } };
  private flushTimer?: NodeJS.Timeout;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly messageEmitter = new vscode.EventEmitter<HostMessage>();
  /** Fires every host→view message so an external surface (the phone link) can mirror the chat live. */
  readonly onDidPost = this.messageEmitter.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly services: Services,
    private readonly review: ReviewController,
    private readonly terminals: TerminalAssist,
  ) {
    this.store = new ChatStore(context.storageUri ?? context.globalStorageUri, context.storageUri ? context.workspaceState : context.globalState);
    this.disposables.push(
      review.onDidChangePending(() => void this.postChanges()),
      services.onDidChangeModels(() => void this.postState()),
      services.onDidChangeWorkspace(() => {
        for (const live of this.live.values()) live.controller?.abort();
        this.live.clear();
        void this.postInit();
      }),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('musabai')) void this.postState();
      }),
      vscode.workspace.onDidGrantWorkspaceTrust(() => void this.postState()),
    );
  }

  // ---- webview plumbing -------------------------------------------------------------------------

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    this.ready = false;
    const dist = vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview');
    webviewView.webview.options = { enableScripts: true, localResourceRoots: [dist, vscode.Uri.joinPath(this.context.extensionUri, 'media')] };
    webviewView.webview.html = this.html(webviewView.webview, dist);
    this.disposables.push(
      webviewView.webview.onDidReceiveMessage((m: ViewMessage) => void this.handle(m).catch((e: Error) => this.services.log.error(`chat: ${e.stack || e.message}`))),
      webviewView.onDidDispose(() => {
        this.view = undefined;
        this.ready = false;
      }),
      webviewView.onDidChangeVisibility(() => {
        if (webviewView.visible) void this.postChanges();
      }),
    );
  }

  private html(webview: vscode.Webview, dist: vscode.Uri): string {
    const nonce = randomBytes(16).toString('base64');
    const css = webview.asWebviewUri(vscode.Uri.joinPath(dist, 'chat.css'));
    const codicons = webview.asWebviewUri(vscode.Uri.joinPath(dist, 'codicon.css'));
    const js = webview.asWebviewUri(vscode.Uri.joinPath(dist, 'chat.js'));
    const lang = language();
    return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data: https:; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="${codicons}" rel="stylesheet">
<link href="${css}" rel="stylesheet">
<title>MusabAI</title>
</head>
<body>
<div id="app"></div>
<script nonce="${nonce}" src="${js}"></script>
</body>
</html>`;
  }

  private post(message: HostMessage): void {
    this.messageEmitter.fire(message);
    if (!this.view || !this.ready) {
      if (message.type !== 'chatEvent') this.queue.push(message);
      return;
    }
    void this.view.webview.postMessage(message);
  }

  /** The init payload for a newly-connected external surface (the phone link). */
  async snapshot(): Promise<Extract<HostMessage, { type: 'init' }>> {
    const live = await this.liveChat(this.activeId || this.store.activeId || '');
    this.activeId = live.stored.id;
    return { type: 'init', state: await this.viewState(), chats: this.store.list(), chat: view(live.stored), changes: await this.changeFiles() };
  }

  /** Sends a prompt from an external surface (the phone link) into the active chat. */
  async sendExternal(text: string): Promise<void> {
    if (!text.trim()) return;
    if (!this.activeId) {
      const live = await this.liveChat(this.store.activeId || '');
      this.activeId = live.stored.id;
    }
    await this.runTurn(text, [], [], get('mode', 'agent'), chatModel());
  }

  async reveal(focusInput = true): Promise<void> {
    await vscode.commands.executeCommand(`${ChatController.viewId}.focus`);
    if (focusInput) this.post({ type: 'focusInput' });
  }

  get visible(): boolean {
    return Boolean(this.view?.visible);
  }

  // ---- state ------------------------------------------------------------------------------------

  async modelOptions(): Promise<ModelOption[]> {
    const models = await this.services.pool.listModels();
    const group = (source: string, keyless: boolean) =>
      source === 'local' ? 'Local (this laptop)' : source === 'custom' ? 'Custom' : keyless ? 'Free · no key needed' : 'Free · with your key';
    const rank = ['Auto', 'Free · no key needed', 'Free · with your key', 'Local (this laptop)', 'Custom'];
    return [
      { id: AUTO_MODEL_ID, name: 'Auto (best free model)', group: 'Auto', ready: true, note: 'Picks a free model that can do the task' },
      ...models
        .map((m) => ({
        id: m.id,
        name: m.name,
        group: group(m.source, m.keyless),
        ready: m.ready,
        note: m.ready ? m.note : 'Add a free key in Settings',
        vision: m.capabilities.includes('vision'),
        coolingDown: m.coolingDown,
        secretId: m.secretId,
      }))
        .sort((a, b) => rank.indexOf(a.group) - rank.indexOf(b.group)),
    ];
  }

  private async viewState(): Promise<ViewState> {
    return {
      modes: modes().map((m) => ({ id: m.id, label: m.label })),
      mode: get('mode', 'agent'),
      models: await this.modelOptions(),
      model: chatModel(),
      language: language(),
      workspaceName: vscode.workspace.name ?? '',
      hasWorkspace: Boolean(this.services.root),
      trusted: vscode.workspace.isTrusted,
      runMode: policy().mode,
      version: String(this.context.extension.packageJSON.version ?? ''),
      indexStatus: this.services.index ? `${this.services.index.status.files} files indexed` : undefined,
    };
  }

  private async postState(): Promise<void> {
    if (!this.ready) return;
    this.post({ type: 'state', state: await this.viewState() });
  }

  private async changeFiles(): Promise<ChangeFile[]> {
    return ((await this.services.changes?.summary()) ?? []).map((c) => ({ path: c.path, rel: c.rel, added: c.added, removed: c.removed, created: c.created, deleted: c.deleted }));
  }

  private async postChanges(): Promise<void> {
    if (this.ready) this.post({ type: 'changes', files: await this.changeFiles() });
  }

  private postChats(): void {
    const running = new Set([...this.live.values()].filter((l) => l.controller).map((l) => l.stored.id));
    this.post({ type: 'chats', chats: this.store.list().map((c) => ({ ...c, running: running.has(c.id) })), activeId: this.activeId });
  }

  private async postInit(): Promise<void> {
    if (!this.view) return;
    const live = await this.liveChat(this.activeId || this.store.activeId || '');
    this.activeId = live.stored.id;
    const message: HostMessage = {
      type: 'init',
      state: await this.viewState(),
      chats: this.store.list(),
      chat: view(live.stored),
      changes: await this.changeFiles(),
    };
    void this.view.webview.postMessage(message);
    for (const queued of this.queue.splice(0)) void this.view.webview.postMessage(queued);
  }

  // ---- chats ------------------------------------------------------------------------------------

  private makeSession(chatId: string, checkpoints: CheckpointStore): AgentSession {
    const services = this.services;
    const root = services.root ?? os.homedir();
    const host = services.host ?? new NodeHost({ root });
    const session = new AgentSession({
      pool: services.pool,
      host,
      emit: (event) => this.onAgentEvent(chatId, event),
      policy,
      approve: (request, key) => this.requestApproval(chatId, request, key),
      environment: environmentProvider(root, 'editor', () => this.editorState(root), () => readMemory(root)),
      rules: rulesProvider(root, () => get<string[]>('rules.user', [])),
      changes: services.changes,
      checkpoints,
      index: services.index,
      mcp: services.mcp,
      github: async () => services.github(false),
      disabledTools,
      maxSteps: get('agent.maxSteps', 60),
    });
    for (const key of this.context.workspaceState.get<string[]>(ALWAYS_KEY, [])) session.allow(key);
    return session;
  }

  private async liveChat(id: string): Promise<LiveChat> {
    const existing = this.live.get(id);
    if (existing) return existing;
    const stored = (id ? await this.store.load(id) : undefined) ?? this.store.create();
    const checkpoints = new CheckpointStore();
    checkpoints.restoreState(stored.checkpoints);
    const session = this.makeSession(stored.id, checkpoints);
    session.restoreSnapshot(stored.agent);
    const live: LiveChat = { stored, session, checkpoints };
    this.live.set(stored.id, live);
    return live;
  }

  private async persist(live: LiveChat): Promise<void> {
    if (!live.stored.messages.length) return;
    live.stored.agent = live.session.snapshot();
    live.stored.checkpoints = live.checkpoints.toJSON();
    await this.store.save(live.stored).catch((e: Error) => this.services.log.warn(`could not save chat: ${e.message}`));
  }

  private schedulePersist(live: LiveChat): void {
    if (live.saveTimer) return;
    live.saveTimer = setTimeout(() => {
      live.saveTimer = undefined;
      void this.persist(live);
    }, 4000);
  }

  private apply(live: LiveChat, event: ChatEvent): void {
    reduceChat(view(live.stored), event);
    this.post({ type: 'chatEvent', chatId: live.stored.id, event });
  }

  async newChat(): Promise<void> {
    const current = this.live.get(this.activeId);
    if (current && !current.stored.messages.length) {
      this.post({ type: 'focusInput' });
      return;
    }
    const live = await this.liveChat('');
    this.activeId = live.stored.id;
    await this.store.setActive(this.activeId);
    this.post({ type: 'chat', chat: view(live.stored) });
    this.postChats();
    this.post({ type: 'focusInput' });
  }

  private async selectChat(id: string): Promise<void> {
    const live = await this.liveChat(id);
    this.activeId = live.stored.id;
    await this.store.setActive(this.activeId);
    this.post({ type: 'chat', chat: view(live.stored) });
    this.postChats();
  }

  private async deleteChat(id: string): Promise<void> {
    this.live.get(id)?.controller?.abort();
    this.live.delete(id);
    await this.store.delete(id);
    if (id === this.activeId) {
      const next = this.store.list()[0];
      if (next) await this.selectChat(next.id);
      else await this.newChat();
    }
    this.postChats();
  }

  // ---- agent ------------------------------------------------------------------------------------

  private editorState(root: string): EditorState {
    const editor = vscode.window.activeTextEditor;
    const rel = (u: vscode.Uri) => path.relative(root, u.fsPath);
    const openFiles = vscode.window.tabGroups.all
      .flatMap((g) => g.tabs)
      .map((tab) => (tab.input instanceof vscode.TabInputText && tab.input.uri.scheme === 'file' ? rel(tab.input.uri) : ''))
      .filter((f) => f && !f.startsWith('..'));
    const state: EditorState = { openFiles: [...new Set(openFiles)] };
    if (editor?.document.uri.scheme === 'file' && !rel(editor.document.uri).startsWith('..')) {
      state.activeFile = rel(editor.document.uri);
      state.cursorLine = editor.selection.active.line + 1;
      if (!editor.selection.isEmpty) state.selection = { file: state.activeFile, startLine: editor.selection.start.line + 1, endLine: editor.selection.end.line + 1 };
    }
    return state;
  }

  private onAgentEvent(chatId: string, event: AgentEvent): void {
    const live = this.live.get(chatId);
    if (!live?.assistantId) return;
    const messageId = live.assistantId;
    if (event.type === 'text' || event.type === 'reasoning') {
      // Coalesce stream deltas: one webview message per frame instead of per token.
      const pending = this.pendingText;
      if (pending && pending.chatId === chatId && pending.messageId === messageId && pending.event.type === event.type) pending.event.text += event.text;
      else {
        this.flushText();
        this.pendingText = { chatId, messageId, event: { ...event } };
      }
      this.flushTimer ??= setTimeout(() => this.flushText(), 40);
      return;
    }
    this.flushText();
    this.apply(live, { type: 'agent', messageId, event });
    this.schedulePersist(live);
    if (event.type === 'file_changed') this.review.schedule();
  }

  private flushText(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
    const pending = this.pendingText;
    this.pendingText = undefined;
    const live = pending && this.live.get(pending.chatId);
    if (pending && live) this.apply(live, { type: 'agent', messageId: pending.messageId, event: pending.event });
  }

  private approvalView(id: string, request: ApprovalRequest, key?: string): ApprovalView {
    switch (request.kind) {
      case 'command':
        return { id, kind: 'command', title: request.background ? 'Run in the background?' : 'Run this command?', detail: request.command, reason: request.reason, canAlways: Boolean(key) };
      case 'write_outside':
        return { id, kind: 'write_outside', title: 'Change a file outside the project?', detail: request.path, canAlways: false };
      case 'delete':
        return { id, kind: 'delete', title: 'Delete this file?', detail: request.path, canAlways: false };
      case 'laptop':
        return { id, kind: 'laptop', title: `Laptop: ${request.action.replace(/_/g, ' ')}`, detail: request.detail, canAlways: Boolean(key) };
      case 'browser':
        return { id, kind: 'browser', title: `Browser: ${request.action}`, detail: request.detail, canAlways: Boolean(key) };
      case 'mcp':
        return { id, kind: 'mcp', title: `MCP ${request.server}: ${request.tool}`, detail: request.args, canAlways: Boolean(key) };
    }
  }

  private requestApproval(chatId: string, request: ApprovalRequest, key?: string): Promise<ApprovalResult> {
    const live = this.live.get(chatId);
    const messageId = live?.assistantId;
    if (!live || !messageId) return Promise.resolve('deny');
    const id = newId('a');
    const approval = this.approvalView(id, request, key);
    this.flushText();
    this.apply(live, { type: 'approval', messageId, approval });
    return new Promise<ApprovalResult>((resolve) => {
      this.approvals.set(id, { resolve, chatId, messageId, key });
      live.controller?.signal.addEventListener('abort', () => this.answer(id, 'deny'), { once: true });
      if (!this.visible || chatId !== this.activeId) {
        const title =
          request.kind === 'command' ? t('MusabAI wants to run a command') :
          request.kind === 'write_outside' ? t('MusabAI wants to change a file outside the project') :
          request.kind === 'delete' ? t('MusabAI wants to delete a file') :
          request.kind === 'laptop' ? t('MusabAI wants to use the laptop') :
          request.kind === 'browser' ? t('MusabAI wants to use the browser') : t('MusabAI wants to use an MCP tool');
        const buttons = [t('Allow'), t('Deny'), ...(approval.canAlways ? [t('Always allow')] : [])];
        void vscode.window.showWarningMessage(`${title}: ${approval.detail.slice(0, 200)}`, ...buttons).then((choice) => {
          if (!choice) return;
          this.answer(id, choice === t('Allow') ? 'allow' : choice === t('Always allow') ? 'always' : 'deny');
        });
      }
    });
  }

  private answer(id: string, answer: ApprovalResult): void {
    const entry = this.approvals.get(id);
    if (!entry) return;
    this.approvals.delete(id);
    entry.resolve(answer);
    const live = this.live.get(entry.chatId);
    if (live) this.apply(live, { type: 'approvalDone', messageId: entry.messageId, approvalId: id, answer });
    if (answer === 'always' && entry.key) {
      if (entry.key.startsWith('cmd:')) {
        const prefix = entry.key.slice(4);
        const list = get<string[]>('agent.allowList', []);
        if (!list.includes(prefix)) void set('agent.allowList', [...list, prefix]);
      } else {
        const keys = this.context.workspaceState.get<string[]>(ALWAYS_KEY, []);
        if (!keys.includes(entry.key)) void this.context.workspaceState.update(ALWAYS_KEY, [...keys, entry.key]);
      }
    }
  }

  private async prepareMentions(chips: MentionChip[]): Promise<Mention[]> {
    const out: Mention[] = [];
    for (const c of chips) {
      const m = c.mention as unknown as Mention;
      if (m.type === 'terminal' && !m.text) out.push({ ...m, text: this.terminals.snapshot() || '(no recent terminal output)' });
      else if (m.type === 'problems' && !m.text) out.push({ ...m, text: problemsText(this.services.root) || '(no problems)' });
      else if (m.type === 'chat') {
        const old = await this.store.load(m.text);
        const text = (old?.messages ?? [])
          .map((x) => (x.role === 'user' ? `User: ${x.text}` : `MusabAI: ${(x.parts ?? []).filter((p) => p.kind === 'text').map((p) => (p as { text: string }).text).join('\n')}`))
          .join('\n\n');
        out.push({ ...m, text });
      } else out.push(m);
    }
    return out;
  }

  async runTurn(text: string, chips: MentionChip[], images: string[], modeId: string, modelId: string): Promise<void> {
    if (!text.trim() && !images.length) return;
    const live = await this.liveChat(this.activeId);
    this.activeId = live.stored.id;
    if (live.controller) {
      void vscode.window.showInformationMessage('MusabAI is still working in this chat. Stop it or open a new chat (+).');
      return;
    }
    let mode = modes().find((m) => m.id === modeId) ?? modes()[0];
    if (!this.services.root && mode.id !== 'ask') mode = modes().find((m) => m.id === 'ask')!;
    const turnId = newId('t');
    const user: UiMessage = { id: newId('m'), role: 'user', turnId, text, mentions: chips, images, mode: mode.id, createdAt: Date.now() };
    this.apply(live, { type: 'user', message: user });
    if (live.stored.title === 'New chat') live.stored.title = text.replace(/\s+/g, ' ').trim().slice(0, 60) || 'Image';
    const controller = new AbortController();
    live.controller = controller;
    await this.store.setActive(live.stored.id);
    this.postChats();
    // Carry the task across the per-turn step budget instead of stopping to ask the user to type "continue".
    const maxContinues = get('agent.autoContinue', true) ? Math.max(0, get('agent.maxContinues', 40)) : 0;
    try {
      if (this.services.mcp) await Promise.race([this.services.mcp.startAll(), new Promise((r) => setTimeout(r, 8000))]);
      const resolved = await resolveMentions(await this.prepareMentions(chips), { host: this.services.host ?? new NodeHost({ root: os.homedir() }), index: this.services.index }, text);
      const active = this.editorState(this.services.root ?? os.homedir()).activeFile;
      for (let attempt = 0; ; attempt++) {
        const assistant: UiMessage = { id: newId('m'), role: 'assistant', turnId, parts: [], status: 'streaming', mode: mode.id, createdAt: Date.now() };
        this.apply(live, { type: 'assistant', message: assistant });
        live.assistantId = assistant.id;
        const result = await live.session.run({
          turnId,
          text: attempt === 0 ? text : CONTINUE_PROMPT,
          mode,
          modelId,
          images: attempt === 0 ? [...images, ...resolved.images] : [],
          context: attempt === 0 ? resolved.context : undefined,
          referencedFiles: attempt === 0 ? [...resolved.files, ...(active ? [active] : [])] : [],
          mentionedRules: attempt === 0 ? resolved.rules : [],
          signal: controller.signal,
        });
        if (result.reason !== 'max_steps' || attempt >= maxContinues || controller.signal.aborted) break;
        // It only hit this step's budget, not a dead end: mark the step done (not "stopped at the limit") and keep going.
        this.apply(live, { type: 'agent', messageId: assistant.id, event: { type: 'done', reason: 'completed' } });
      }
    } catch (error) {
      this.onAgentEvent(live.stored.id, { type: 'done', reason: 'error', error: (error as Error).message });
    } finally {
      this.flushText();
      live.controller = undefined;
      live.assistantId = undefined;
      await this.persist(live);
      this.postChats();
      void this.postChanges();
    }
  }

  stop(chatId = this.activeId): void {
    this.live.get(chatId)?.controller?.abort();
  }

  /** Starts a turn from a command (fix an issue, a CI failure, a review finding…). */
  async sendFromCommand(text: string, mode = 'agent', newChat = true): Promise<void> {
    if (newChat) await this.newChat();
    await this.reveal(false);
    await this.runTurn(text, [], [], mode, chatModel());
  }

  /** Adds a finished exchange (a review, a report) as a new chat the user can continue. */
  async addExchange(title: string, userText: string, assistantMarkdown: string): Promise<void> {
    await this.newChat();
    const live = await this.liveChat(this.activeId);
    live.stored.title = title;
    const turnId = newId('t');
    this.apply(live, { type: 'user', message: { id: newId('m'), role: 'user', turnId, text: userText, createdAt: Date.now() } });
    this.apply(live, {
      type: 'assistant',
      message: { id: newId('m'), role: 'assistant', turnId, parts: [{ kind: 'text', text: assistantMarkdown }], status: 'completed', createdAt: Date.now() },
    });
    live.session.history.push({ role: 'user', content: userText }, { role: 'assistant', content: assistantMarkdown });
    await this.persist(live);
    this.postChats();
    await this.reveal(false);
  }

  attach(chips: MentionChip[]): void {
    this.post({ type: 'attach', chips, focus: true });
  }

  focusInput(text?: string, mode?: string): void {
    this.post({ type: 'focusInput', text, mode });
  }

  private async restore(turnId: string): Promise<void> {
    const live = await this.liveChat(this.activeId);
    const choice = await vscode.window.showWarningMessage(
      'Restore this checkpoint? Files MusabAI changed since this message go back to how they were, and the conversation after it is removed.',
      { modal: true },
      'Restore',
    );
    if (choice !== 'Restore') return;
    live.controller?.abort();
    const host = this.services.host;
    const restored = host ? await live.checkpoints.restore(turnId, host) : [];
    live.session.truncateFrom(turnId);
    const user = live.stored.messages.find((m) => m.role === 'user' && m.turnId === turnId);
    if (user) this.apply(live, { type: 'truncate', fromMessageId: user.id });
    await this.persist(live);
    this.review.schedule();
    this.post({ type: 'focusInput', text: user?.text });
    void vscode.window.setStatusBarMessage(`MusabAI: restored ${restored.length} file${restored.length === 1 ? '' : 's'}`, 4000);
  }

  // ---- code block actions -----------------------------------------------------------------------

  private async insertCode(code: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      const doc = await vscode.workspace.openTextDocument({ content: code });
      await vscode.window.showTextDocument(doc);
      return;
    }
    await editor.edit((b) => b.replace(editor.selection, code));
  }

  /** Cursor's Apply: merge a code block into its file and leave the result for review. */
  private async applyCode(code: string, lang?: string, file?: string): Promise<void> {
    const host = this.services.host;
    const root = this.services.root;
    let target: string | undefined;
    if (file && root) target = path.resolve(root, file);
    else if (vscode.window.activeTextEditor?.document.uri.scheme === 'file') target = vscode.window.activeTextEditor.document.uri.fsPath;
    if (!target || !host) {
      await this.insertCode(code);
      return;
    }
    const before = await host.readText(target);
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.uri.fsPath === target && !editor.selection.isEmpty) {
      await editor.edit((b) => b.replace(editor.selection, code));
      return;
    }
    let after: string;
    if (before === undefined || !before.trim()) after = code.endsWith('\n') ? code : `${code}\n`;
    else if (before.split('\n').length > 1500) {
      await this.insertCode(code);
      return;
    } else {
      const merged = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'MusabAI is applying the code…', cancellable: true }, async (_p, token) => {
        const controller = new AbortController();
        token.onCancellationRequested(() => controller.abort());
        const { text } = await complete(
          this.services.pool,
          chatModel(),
          'You merge a code snippet into an existing file. Output the COMPLETE updated file in one fenced code block. Apply only what the snippet implies; keep everything else exactly as it is. If the snippet abbreviates unchanged code with comments like "...", keep the original code there.',
          `File: ${path.relative(root!, target!)}\n\`\`\`${lang ?? ''}\n${before}\n\`\`\`\n\nSnippet to apply:\n\`\`\`${lang ?? ''}\n${code}\n\`\`\``,
          { signal: controller.signal, maxTokens: 16_000 },
        );
        return extractCodeBlock(text);
      }).then(undefined, (error: Error) => {
        void vscode.window.showErrorMessage(`MusabAI: ${error.message}`);
        return undefined;
      });
      if (!merged) return;
      after = before.endsWith('\n') && !merged.endsWith('\n') ? `${merged}\n` : merged;
    }
    this.services.changes?.record(target, before ?? null);
    await host.writeText(target, after);
    this.services.changes?.touched();
    await host.openInEditor?.(target);
    this.review.schedule();
  }

  // ---- messages from the webview ----------------------------------------------------------------

  private async handle(message: ViewMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
        this.ready = true;
        await this.postInit();
        break;
      case 'send':
        await set('mode', message.mode);
        if (message.model !== chatModel()) await set('model', message.model);
        await this.runTurn(message.text, message.chips, message.images, message.mode, message.model);
        break;
      case 'stop':
        this.stop();
        break;
      case 'newChat':
        await this.newChat();
        break;
      case 'selectChat':
        await this.selectChat(message.id);
        break;
      case 'deleteChat':
        await this.deleteChat(message.id);
        break;
      case 'setMode':
        await set('mode', message.mode);
        break;
      case 'setRunMode':
        await set('agent.runMode', message.mode);
        // In Restricted Mode every command asks, whatever the run mode. If the user picked a more
        // autonomous mode, open the trust dialog so their choice takes effect (granting trust fires
        // onDidGrantWorkspaceTrust, which refreshes the pill). Dangerous commands still always ask.
        if (message.mode !== 'ask' && this.services.root && !vscode.workspace.isTrusted) {
          await vscode.commands.executeCommand('workbench.trust.manage');
        }
        await this.postState();
        break;
      case 'setModel':
        await set('model', message.model);
        break;
      case 'mentionQuery':
        this.post({ type: 'mentionResults', query: message.query, items: await searchMentions(message.query, this.services, this.store) });
        break;
      case 'approval':
        this.answer(message.id, message.answer);
        break;
      case 'acceptAll':
        await this.review.acceptAll();
        break;
      case 'rejectAll':
        await this.review.rejectAll();
        break;
      case 'acceptFile':
        await this.review.acceptFile(message.path);
        break;
      case 'rejectFile':
        await this.review.rejectFile(message.path);
        break;
      case 'reviewFile':
        await this.review.openDiff(message.path);
        break;
      case 'reviewAll':
        await this.review.reviewAll();
        break;
      case 'openFile': {
        const root = this.services.root ?? os.homedir();
        const abs = path.isAbsolute(message.path) ? message.path : path.join(root, message.path);
        const doc = await vscode.workspace.openTextDocument(abs);
        const pos = new vscode.Position(Math.max(0, (message.line ?? 1) - 1), 0);
        await vscode.window.showTextDocument(doc, { selection: new vscode.Range(pos, pos), preview: true });
        break;
      }
      case 'restore':
        await this.restore(message.turnId);
        break;
      case 'copy':
        await vscode.env.clipboard.writeText(message.text);
        break;
      case 'insertCode':
        await this.insertCode(message.code);
        break;
      case 'applyCode':
        await this.applyCode(message.code, message.lang, message.file);
        break;
      case 'runInTerminal': {
        const terminal = vscode.window.activeTerminal && vscode.window.activeTerminal.name !== 'MusabAI Agent' ? vscode.window.activeTerminal : vscode.window.createTerminal({ name: 'bash', cwd: this.services.root });
        terminal.show();
        terminal.sendText(message.command, true);
        break;
      }
      case 'build':
        await set('mode', 'agent');
        this.post({ type: 'state', state: { mode: 'agent' } });
        await this.runTurn('Implement the plan above. Keep the todo list updated as you work and verify the result.', [], [], 'agent', chatModel());
        break;
      case 'openSettings':
        await vscode.commands.executeCommand('musabai.openSettings', message.section);
        break;
      case 'manageTrust':
        await vscode.commands.executeCommand('workbench.trust.manage');
        break;
      case 'openFolder':
        await vscode.commands.executeCommand('workbench.action.files.openFolder');
        break;
      case 'pickImage': {
        const files = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { Images: ['png', 'jpg', 'jpeg', 'gif', 'webp'] } });
        if (!files?.[0]) break;
        const bytes = await vscode.workspace.fs.readFile(files[0]);
        const ext = path.extname(files[0].fsPath).slice(1).toLowerCase().replace('jpg', 'jpeg');
        this.post({ type: 'imagePicked', dataUrl: `data:image/${ext};base64,${Buffer.from(bytes).toString('base64')}` });
        break;
      }
      case 'slash':
        await this.slash(message.command, message.text);
        break;
    }
  }

  private async slash(command: string, text?: string): Promise<void> {
    const map: Record<string, string> = {
      review: 'musabai.github.review',
      commit: 'musabai.scm.generateCommitMessage',
      pr: 'musabai.github.createPullRequest',
      'fix-ci': 'musabai.github.fixCI',
      issue: 'musabai.github.fixIssue',
      rule: 'musabai.rules.new',
      mcp: 'musabai.openSettings',
      settings: 'musabai.openSettings',
      index: 'musabai.index.rebuild',
      background: 'musabai.background.new',
      import: 'musabai.import',
    };
    if (command === 'new' || command === 'clear') return this.newChat();
    const id = map[command];
    if (id) await vscode.commands.executeCommand(id, command === 'mcp' ? 'mcp' : text);
  }

  dispose(): void {
    for (const live of this.live.values()) {
      live.controller?.abort();
      void this.persist(live);
    }
    this.disposables.forEach((d) => d.dispose());
    this.messageEmitter.dispose();
  }
}
