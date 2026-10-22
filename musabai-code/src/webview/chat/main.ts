import { h, icon, timeAgo, vscodeApi } from '../shared/dom';
import {
  type ChangeFile,
  type ChatSummary,
  type ChatView,
  type HostMessage,
  type MentionChip,
  type MentionItem,
  type ModelOption,
  type TodoLite,
  type UiMessage,
  type UiPart,
  type ViewMessage,
  type ViewState,
  reduceChat,
} from '../shared/protocol';
import { setLanguage, tr } from './i18n';
import { codeBlock, renderMarkdown } from './markdown';

const vscode = vscodeApi();
const post = (m: ViewMessage) => vscode.postMessage(m);

interface PopupItem {
  label: string;
  detail?: string;
  icon: string;
  group?: string;
  disabled?: boolean;
  run: () => void;
}

const S = {
  view: undefined as ViewState | undefined,
  chats: [] as ChatSummary[],
  chat: undefined as ChatView | undefined,
  changes: [] as ChangeFile[],
  chips: [] as MentionChip[],
  images: [] as string[],
  historyOpen: false,
  changesOpen: false,
  todosOpen: true,
  expanded: new Set<string>(),
  popup: undefined as { kind: 'mention' | 'slash' | 'mode' | 'run' | 'model'; items: PopupItem[]; index: number; start?: number } | undefined,
  mentionQuery: '',
};

const TOOL_ICONS: Record<string, string> = {
  read_file: 'file-code', list_dir: 'folder-opened', file_search: 'search', grep_search: 'regex', codebase_search: 'telescope',
  edit_file: 'edit', multi_edit: 'edit', write_file: 'new-file', delete_file: 'trash', run_terminal_cmd: 'terminal',
  terminal_output: 'output', read_lints: 'warning', todo_write: 'checklist', fetch_rules: 'law', web_search: 'globe',
  web_fetch: 'link-external', git: 'git-branch', github: 'github', laptop: 'device-desktop', command: 'terminal',
  write_outside: 'edit', read_outside: 'file', delete: 'trash', mcp: 'plug', web: 'globe', update_memory: 'bookmark',
};
const MODE_ICONS: Record<string, string> = { agent: '∞', plan: 'checklist', ask: 'comment-discussion', manual: 'edit' };
// Memory notes are reviewed like edits: a diff badge, a click opens the change, and the turn offers its checkpoint.
const EDIT_TOOLS = new Set(['edit_file', 'multi_edit', 'write_file', 'delete_file', 'update_memory']);

// ---- skeleton ---------------------------------------------------------------------------------------

const app = document.getElementById('app')!;
const top = h('div', { class: 'top' });
const history = h('div', { class: 'history hidden' });
const list = h('div', { class: 'messages', role: 'log' });
const changesBar = h('div', { class: 'changes hidden' });
const todoBar = h('div', { class: 'todobar hidden' });
const chipsRow = h('div', { class: 'chips' });
const imagesRow = h('div', { class: 'images' });
const input = h('textarea', { class: 'input', rows: 1, dir: 'auto', spellcheck: 'false' }) as HTMLTextAreaElement;
const modeBtn = h('button', { class: 'pill', title: 'Mode (Ctrl+.)' });
const modelBtn = h('button', { class: 'pill model', title: 'Model (Ctrl+/)' });
const runBtn = h('button', { class: 'pill run', title: 'When commands run (approvals)' });
const RUN_MODES: { id: 'ask' | 'allowlist' | 'auto'; label: string; icon: string }[] = [
  { id: 'ask', label: 'Ask each time', icon: 'question' },
  { id: 'allowlist', label: 'Allow-list', icon: 'shield' },
  { id: 'auto', label: 'Auto-run', icon: 'zap' },
];
const imageBtn = h('button', { class: 'icon-btn', title: tr('Attach image') }, icon('file-media'));
const sendBtn = h('button', { class: 'send', title: tr('Send') });
const popup = h('div', { class: 'popup hidden', role: 'listbox' });
const notice = h('div', { class: 'notice hidden' });
const box = h(
  'div',
  { class: 'box' },
  h('div', { class: 'chips-line' }, h('button', { class: 'add-context', title: tr('@ for context, / for commands'), onclick: () => openMentionPicker() }, icon('mention'), h('span', { class: 'add-context-label' }, tr('Add context'))), chipsRow),
  input,
  imagesRow,
  h('div', { class: 'footer' }, modeBtn, runBtn, modelBtn, h('span', { class: 'spacer' }), imageBtn, sendBtn),
);
const composer = h('div', { class: 'composer' }, changesBar, todoBar, popup, notice, box);
app.append(top, history, list, composer);

const messageEls = new Map<string, HTMLElement>();
let pendingRender = new Set<string>();
let frame = 0;

// ---- helpers ----------------------------------------------------------------------------------------

function running(): boolean {
  const last = S.chat?.messages[S.chat.messages.length - 1];
  return last?.role === 'assistant' && last.status === 'streaming';
}

function nearBottom(): boolean {
  return list.scrollHeight - list.scrollTop - list.clientHeight < 80;
}

function scrollToBottom(force = false): void {
  if (force || nearBottom()) list.scrollTop = list.scrollHeight;
}

function placeholder(): string {
  const mode = S.view?.mode ?? 'agent';
  return mode === 'ask' ? tr('Ask anything about your code…') : mode === 'plan' ? tr('Describe the plan you need…') : tr('Plan, search, build anything…');
}

function autosize(): void {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 240)}px`;
  input.style.overflowY = input.scrollHeight > 240 ? 'auto' : 'hidden';
}

function saveDraft(): void {
  vscode.setState({ draft: input.value, chips: S.chips });
}

async function resizeImage(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
      if (scale === 1 && dataUrl.length < 1_200_000) return resolve(dataUrl);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// ---- top bar & history --------------------------------------------------------------------------------

function renderTop(): void {
  const title = S.chat?.title && S.chat.title !== 'New chat' ? S.chat.title : tr('New chat');
  top.replaceChildren(
    h('button', { class: 'title', title: tr('Chats'), onclick: () => { S.historyOpen = !S.historyOpen; renderHistory(); } }, h('span', { class: 'title-text', dir: 'auto' }, title), icon(S.historyOpen ? 'chevron-up' : 'chevron-down')),
    h('span', { class: 'spacer' }),
    h('button', { class: 'icon-btn', title: `${tr('New chat')} (Ctrl+L)`, onclick: () => post({ type: 'newChat' }) }, icon('add')),
    h('button', { class: 'icon-btn', title: tr('Chats'), onclick: () => { S.historyOpen = !S.historyOpen; renderHistory(); } }, icon('history')),
    h('button', { class: 'icon-btn', title: `${tr('Settings')} (Ctrl+Shift+J)`, onclick: () => post({ type: 'openSettings' }) }, icon('settings-gear')),
  );
}

function renderHistory(): void {
  history.classList.toggle('hidden', !S.historyOpen);
  renderTop();
  if (!S.historyOpen) return;
  history.replaceChildren(
    ...(S.chats.length
      ? S.chats.map((c) =>
          h(
            'div',
            { class: `chat-row${c.id === S.chat?.id ? ' active' : ''}`, onclick: () => { S.historyOpen = false; renderHistory(); post({ type: 'selectChat', id: c.id }); } },
            c.running ? icon('loading', 'codicon-modifier-spin') : icon('comment-discussion'),
            h('span', { class: 'chat-title', dir: 'auto' }, c.title || tr('New chat')),
            h('span', { class: 'muted' }, timeAgo(c.updatedAt)),
            h('button', { class: 'icon-btn small', title: tr('Delete'), onclick: (e: Event) => { e.stopPropagation(); post({ type: 'deleteChat', id: c.id }); } }, icon('trash')),
          ),
        )
      : [h('div', { class: 'muted pad' }, tr('No results'))]),
  );
}

// ---- messages ---------------------------------------------------------------------------------------

function chipEl(chip: MentionChip, removable?: () => void): HTMLElement {
  return h(
    'span',
    { class: 'chip', title: String((chip.mention as Record<string, unknown>).path ?? chip.label) },
    icon(chip.icon || 'file'),
    h('span', { class: 'chip-label' }, chip.label),
    removable ? h('button', { class: 'chip-x', onclick: removable, title: 'Remove' }, icon('close')) : null,
  );
}

function hasChangesAfter(turnId: string): boolean {
  const msgs = S.chat?.messages ?? [];
  const at = msgs.findIndex((m) => m.role === 'user' && m.turnId === turnId);
  return msgs.slice(at).some((m) => m.parts?.some((p) => p.kind === 'tool' && EDIT_TOOLS.has(p.name) && p.status === 'done'));
}

function renderUser(m: UiMessage): HTMLElement {
  const el = h(
    'div',
    { class: 'msg user', 'data-id': m.id },
    h(
      'div',
      { class: 'bubble' },
      m.mentions?.length ? h('div', { class: 'chips' }, ...m.mentions.map((c) => chipEl(c))) : null,
      m.text ? h('div', { class: 'text', dir: 'auto' }, m.text) : null,
      m.images?.length ? h('div', { class: 'images' }, ...m.images.map((src) => h('img', { src, class: 'thumb' }))) : null,
    ),
  );
  if (hasChangesAfter(m.turnId)) {
    el.append(
      h('div', { class: 'msg-actions' }, h('button', { class: 'link', onclick: () => post({ type: 'restore', turnId: m.turnId }) }, icon('discard'), ` ${tr('Restore checkpoint')}`)),
    );
  }
  return el;
}

function toolHead(part: Extract<UiPart, { kind: 'tool' }>): HTMLElement {
  const meta = part.meta ?? {};
  const spinning = part.status === 'running' || part.status === 'pending';
  const badges: (HTMLElement | null)[] = [];
  if (typeof meta.added === 'number' && EDIT_TOOLS.has(part.name)) {
    badges.push(h('span', { class: 'add' }, `+${meta.added}`), h('span', { class: 'del' }, `−${meta.removed ?? 0}`));
  }
  if (part.name === 'run_terminal_cmd' && part.status !== 'running' && meta.exitCode !== undefined && meta.exitCode !== null) {
    badges.push(h('span', { class: `exit ${meta.exitCode === 0 ? 'ok' : 'bad'}` }, `exit ${meta.exitCode}`));
  }
  const openable = typeof meta.path === 'string';
  const label = part.status === 'running' || part.status === 'pending' ? part.title : part.summary ?? part.title;
  return h(
    'div',
    { class: 'tool-head' },
    spinning ? icon('loading', 'codicon-modifier-spin') : icon(part.status === 'failed' ? 'error' : TOOL_ICONS[part.name] ?? (part.name.startsWith('mcp_') ? 'plug' : 'tools')),
    h(
      'span',
      {
        class: `tool-title${openable ? ' openable' : ''}`,
        title: label,
        onclick: openable
          ? (e: Event) => {
              e.stopPropagation();
              post({ type: EDIT_TOOLS.has(part.name) && !meta.deleted ? 'reviewFile' : 'openFile', path: String(meta.path), line: typeof meta.line === 'number' ? meta.line : (meta.startLine as number | undefined) } as ViewMessage);
            }
          : false,
      },
      label,
    ),
    ...badges,
    part.detail || part.output ? icon(S.expanded.has(part.callId) ? 'chevron-down' : 'chevron-right', 'chev') : null,
  );
}

function renderDiff(text: string): HTMLElement {
  return h(
    'pre',
    { class: 'output diff' },
    ...text.split('\n').map((line) =>
      h('span', { class: line.startsWith('+') && !line.startsWith('+++') ? 'add' : line.startsWith('-') && !line.startsWith('---') ? 'del' : line.startsWith('@@') ? 'hunk' : '' }, `${line}\n`),
    ),
  );
}

function renderTool(part: Extract<UiPart, { kind: 'tool' }>): HTMLElement {
  const el = h('div', { class: `tool ${part.status}` });
  const head = toolHead(part);
  const body = part.output || part.detail;
  if (body) {
    head.classList.add('clickable');
    head.addEventListener('click', () => {
      if (S.expanded.has(part.callId)) S.expanded.delete(part.callId);
      else S.expanded.add(part.callId);
      el.replaceWith(renderTool(part));
    });
  }
  el.append(head);
  const a = part.approval;
  if (a && !a.answer) {
    // Exactly what "Always allow" remembers, and where, so it never covers more than the card shows.
    const always = `${tr('Always allow')}${a.alwaysLabel ? ` “${a.alwaysLabel.length > 80 ? `${a.alwaysLabel.slice(0, 79)}…` : a.alwaysLabel}”` : ''} · ${tr(a.alwaysScope === 'everywhere' ? 'all projects' : 'this project')}`;
    el.append(
      h(
        'div',
        { class: 'approval' },
        h('div', { class: 'approval-title' }, icon('shield'), ` ${a.title}`),
        h('pre', { class: 'approval-detail' }, a.detail),
        a.reason ? h('div', { class: 'muted', dir: 'auto' }, a.reason) : null,
        h(
          'div',
          { class: 'approval-actions' },
          h('button', { class: 'primary', onclick: () => post({ type: 'approval', id: a.id, answer: 'allow' }) }, a.kind === 'command' ? tr('Run') : tr('Allow')),
          h('button', { class: 'secondary', onclick: () => post({ type: 'approval', id: a.id, answer: 'deny' }) }, tr('Skip')),
          a.canAlways ? h('button', { class: 'link', onclick: () => post({ type: 'approval', id: a.id, answer: 'always' }) }, always) : null,
        ),
      ),
    );
  } else if (a?.answer) {
    el.append(h('div', { class: `approval-done ${a.answer}` }, a.answer === 'deny' ? tr('Skipped') : tr('Allowed')));
  }
  if (body && S.expanded.has(part.callId)) {
    el.append(EDIT_TOOLS.has(part.name) && part.detail ? renderDiff(part.detail) : h('pre', { class: 'output' }, (part.output ?? part.detail ?? '').slice(-20_000)));
  }
  return el;
}

function renderTodos(todos: TodoLite[], compact = false): HTMLElement {
  const done = todos.filter((t) => t.status === 'completed').length;
  return h(
    'div',
    { class: `todos${compact ? ' compact' : ''}` },
    h('div', { class: 'todos-head' }, icon('checklist'), ` ${tr('Tasks')} ${done}/${todos.length}`),
    ...todos.map((t) =>
      h(
        'div',
        { class: `todo ${t.status}` },
        icon(t.status === 'completed' ? 'pass' : t.status === 'in_progress' ? 'loading' : t.status === 'cancelled' ? 'circle-slash' : 'circle-large-outline', t.status === 'in_progress' ? 'codicon-modifier-spin' : ''),
        h('span', { dir: 'auto' }, t.content),
      ),
    ),
  );
}

function renderAssistant(m: UiMessage): HTMLElement {
  const el = h('div', { class: 'msg assistant', 'data-id': m.id });
  const parts = m.parts ?? [];
  const streaming = m.status === 'streaming';
  parts.forEach((part, i) => {
    if (part.kind === 'text') {
      if (part.text.trim()) el.append(h('div', { class: 'md', dir: 'auto', html: renderMarkdown(part.text, `${m.id}:${i}`) }));
    } else if (part.kind === 'reasoning') {
      const key = `${m.id}:r${i}`;
      const live = streaming && i === parts.length - 1;
      const d = h('details', { class: 'reasoning', open: S.expanded.has(key) }, h('summary', null, icon(live ? 'loading' : 'lightbulb', live ? 'codicon-modifier-spin' : ''), ` ${live ? tr('Thinking') : tr('Thought')}`), h('div', { class: 'md small', dir: 'auto', html: renderMarkdown(part.text, key) }));
      d.addEventListener('toggle', () => (d.open ? S.expanded.add(key) : S.expanded.delete(key)));
      el.append(d);
    } else if (part.kind === 'status') {
      el.append(h('div', { class: 'status-line' }, icon('info'), ` ${part.text}`));
    } else el.append(renderTool(part));
  });
  if (m.todos?.length && !streaming) el.append(renderTodos(m.todos));
  if (streaming && !parts.some((p) => p.kind === 'text' || p.kind === 'tool')) el.append(h('div', { class: 'typing' }, h('span'), h('span'), h('span')));
  if (m.status === 'error') {
    el.append(h('div', { class: 'error', dir: 'auto' }, icon('error'), ` ${m.error ?? 'Error'}`));
  } else if (m.status === 'cancelled') el.append(h('div', { class: 'status-line' }, tr('Stopped.')));
  else if (m.status === 'max_steps') el.append(h('div', { class: 'status-line' }, tr('Step limit reached — say "continue" to keep going.')));
  const footer = h('div', { class: 'msg-footer' });
  if (m.model) footer.append(h('span', { class: 'muted' }, m.model));
  if (m.mode === 'plan' && m.status === 'completed') footer.append(h('button', { class: 'primary small', onclick: () => post({ type: 'build', messageId: m.id }) }, icon('play'), ` ${tr('Build')}`));
  if (footer.childNodes.length) el.append(footer);
  return el;
}

function renderMessage(m: UiMessage): HTMLElement {
  const el = m.role === 'user' ? renderUser(m) : renderAssistant(m);
  messageEls.set(m.id, el);
  return el;
}

const SUGGESTIONS = ['Explain this project', 'Find and fix a bug', 'Write tests for the open file', 'Build a small web app and open it', 'Review my changes (Bugbot)'];

function renderEmpty(): HTMLElement {
  return h(
    'div',
    { class: 'empty' },
    h('div', { class: 'logo' }, icon('sparkle')),
    h('h2', null, 'MusabAI'),
    h('p', { class: 'muted', dir: 'auto' }, tr('Free AI for your code: chat, agent, inline edits and Tab — no account needed.')),
    h(
      'div',
      { class: 'suggestions' },
      ...SUGGESTIONS.map((s) =>
        h('button', { class: 'suggestion', dir: 'auto', onclick: () => (s.includes('Bugbot') ? post({ type: 'slash', command: 'review' }) : send(tr(s))) }, tr(s)),
      ),
    ),
    h('p', { class: 'muted small' }, tr('Ctrl+L chat · Ctrl+K edit · Ctrl+I agent · Tab complete')),
  );
}

function renderAll(): void {
  messageEls.clear();
  const msgs = S.chat?.messages ?? [];
  list.replaceChildren(...(msgs.length ? msgs.map(renderMessage) : [renderEmpty()]));
  renderTop();
  renderComposer();
  scrollToBottom(true);
}

function scheduleRender(id: string): void {
  pendingRender.add(id);
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    const stick = nearBottom();
    for (const mid of pendingRender) {
      const m = S.chat?.messages.find((x) => x.id === mid);
      const old = messageEls.get(mid);
      if (m && old) old.replaceWith(renderMessage(m));
    }
    pendingRender = new Set();
    renderComposer();
    if (stick) scrollToBottom(true);
  });
}

// ---- composer ---------------------------------------------------------------------------------------

function currentModel(): ModelOption | undefined {
  return S.view?.models.find((m) => m.id === S.view?.model);
}

function renderComposer(): void {
  const busy = running();
  input.placeholder = placeholder();
  chipsRow.replaceChildren(...S.chips.map((c, i) => chipEl(c, () => { S.chips.splice(i, 1); renderComposer(); saveDraft(); })));
  imagesRow.replaceChildren(
    ...S.images.map((src, i) => h('span', { class: 'thumb-wrap' }, h('img', { src, class: 'thumb' }), h('button', { class: 'chip-x', onclick: () => { S.images.splice(i, 1); renderComposer(); } }, icon('close')))),
  );
  const mode = S.view?.modes.find((m) => m.id === S.view?.mode) ?? { id: 'agent', label: 'Agent' };
  const mi = MODE_ICONS[mode.id];
  modeBtn.replaceChildren(mi && mi.length === 1 ? h('span', { class: 'glyph' }, mi) : icon(mi ?? 'sparkle'), ` ${tr(mode.label)}`, icon('chevron-down', 'small'));
  const model = currentModel();
  modelBtn.replaceChildren(h('span', { class: 'model-name' }, model ? tr(model.name) : S.view?.model ?? ''), icon('chevron-down', 'small'));
  const run = RUN_MODES.find((r) => r.id === S.view?.runMode) ?? RUN_MODES[1];
  runBtn.replaceChildren(icon(run.icon, 'small'), ` ${tr(run.label)}`, icon('chevron-down', 'small'));
  runBtn.classList.toggle('auto', run.id === 'auto');
  sendBtn.replaceChildren(icon(busy ? 'debug-stop' : 'arrow-up'));
  sendBtn.title = busy ? tr('Stop') : tr('Send');
  sendBtn.classList.toggle('stop', busy);

  const files = S.changes;
  changesBar.classList.toggle('hidden', !files.length);
  if (files.length) {
    const added = files.reduce((n, f) => n + f.added, 0);
    const removed = files.reduce((n, f) => n + f.removed, 0);
    changesBar.replaceChildren(
      h(
        'div',
        { class: 'changes-head' },
        h('button', { class: 'changes-summary', onclick: () => { S.changesOpen = !S.changesOpen; renderComposer(); } }, icon(S.changesOpen ? 'chevron-down' : 'chevron-right'), h('span', null, `${files.length} ${files.length === 1 ? tr('file changed') : tr('files changed')}`), h('span', { class: 'add' }, `+${added}`), h('span', { class: 'del' }, `−${removed}`)),
        h(
          'span',
          { class: 'changes-actions' },
          h('button', { class: 'secondary small', title: tr('Review'), onclick: () => post({ type: 'reviewAll' }) }, icon('diff-multiple')),
          h('button', { class: 'secondary small', onclick: () => post({ type: 'rejectAll' }) }, tr('Reject all')),
          h('button', { class: 'primary small', onclick: () => post({ type: 'acceptAll' }) }, tr('Accept all')),
        ),
      ),
      S.changesOpen
        ? h(
            'div',
            { class: 'changes-list' },
            ...files.map((f) =>
              h(
                'div',
                { class: 'change-row' },
                icon(f.created ? 'new-file' : f.deleted ? 'trash' : 'edit'),
                h('span', { class: 'openable', onclick: () => post({ type: 'reviewFile', path: f.path }), title: f.rel }, f.rel),
                h('span', { class: 'add' }, `+${f.added}`),
                h('span', { class: 'del' }, `−${f.removed}`),
                h('span', { class: 'spacer' }),
                h('button', { class: 'icon-btn small', title: tr('Reject'), onclick: () => post({ type: 'rejectFile', path: f.path }) }, icon('close')),
                h('button', { class: 'icon-btn small', title: tr('Accept'), onclick: () => post({ type: 'acceptFile', path: f.path }) }, icon('check')),
              ),
            ),
          )
        : '',
    );
  }
  renderNotice();
  const last = S.chat?.messages[S.chat.messages.length - 1];
  const todos = busy && last?.todos?.length ? last.todos : undefined;
  todoBar.classList.toggle('hidden', !todos);
  if (todos) todoBar.replaceChildren(renderTodos(todos, true));
}

/** Why the agent cannot work normally here (no folder, or Restricted Mode), with the one click that fixes it. */
function renderNotice(): void {
  const v = S.view;
  const restricted = Boolean(v?.hasWorkspace && !v.trusted);
  const noFolder = Boolean(v && !v.hasWorkspace);
  notice.classList.toggle('hidden', !restricted && !noFolder);
  if (restricted) {
    notice.replaceChildren(
      icon('shield'),
      h('span', { class: 'notice-text', dir: 'auto' }, tr('Restricted Mode: this folder is not trusted, so the agent asks before every command.')),
      h('button', { class: 'primary small', onclick: () => post({ type: 'manageTrust' }) }, tr('Trust this folder')),
    );
  } else if (noFolder) {
    notice.replaceChildren(
      icon('folder-opened'),
      h('span', { class: 'notice-text', dir: 'auto' }, tr('Open a folder to let the agent work on a project.')),
      h('button', { class: 'primary small', onclick: () => post({ type: 'openFolder' }) }, tr('Open Folder')),
    );
  }
}

function send(text = input.value): void {
  if (running()) {
    post({ type: 'stop' });
    return;
  }
  const value = text.trim();
  if (!value && !S.images.length) return;
  if (!S.view) return;
  post({ type: 'send', text: value, chips: S.chips, images: S.images, mode: S.view.mode, model: S.view.model });
  input.value = '';
  S.chips = [];
  S.images = [];
  closePopup();
  autosize();
  saveDraft();
  renderComposer();
}

// ---- popups: @mentions, /commands, mode, model ------------------------------------------------------

function closePopup(): void {
  S.popup = undefined;
  popup.classList.add('hidden');
}

function renderPopup(): void {
  const p = S.popup;
  if (!p) return closePopup();
  popup.classList.remove('hidden');
  let group = '';
  const rows: HTMLElement[] = [];
  p.items.forEach((item, i) => {
    if (item.group && item.group !== group) {
      group = item.group;
      rows.push(h('div', { class: 'popup-group' }, tr(group)));
    }
    rows.push(
      h(
        'div',
        {
          class: `popup-item${i === p.index ? ' active' : ''}${item.disabled ? ' disabled' : ''}`,
          role: 'option',
          onmousedown: (e: Event) => {
            e.preventDefault();
            item.run();
          },
        },
        item.icon.length === 1 ? h('span', { class: 'glyph' }, item.icon) : icon(item.icon),
        h('span', { class: 'popup-label', dir: 'auto' }, item.label),
        item.detail ? h('span', { class: 'popup-detail' }, item.detail) : null,
      ),
    );
  });
  popup.replaceChildren(...(rows.length ? rows : [h('div', { class: 'muted pad' }, tr('No results'))]));
  popup.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
}

function mentionTrigger(): { start: number; query: string } | undefined {
  const caret = input.selectionStart ?? input.value.length;
  const before = input.value.slice(0, caret);
  const m = /(^|\s)@([^\s@]*)$/.exec(before);
  return m ? { start: caret - m[2].length - 1, query: m[2] } : undefined;
}

let mentionTimer: ReturnType<typeof setTimeout> | undefined;

function openMentionPicker(): void {
  const caret = input.selectionStart ?? input.value.length;
  const needsSpace = caret > 0 && !/\s$/.test(input.value.slice(0, caret));
  input.setRangeText(`${needsSpace ? ' ' : ''}@`, caret, caret, 'end');
  input.focus();
  onInput();
}

function applyMentionResults(query: string, items: MentionItem[]): void {
  const trigger = mentionTrigger();
  if (!trigger || trigger.query !== query) return;
  S.popup = {
    kind: 'mention',
    index: 0,
    start: trigger.start,
    items: items.map((item) => ({
      label: item.chip.label,
      detail: item.detail,
      icon: item.chip.icon ?? 'file',
      group: item.group,
      run: () => {
        const caret = input.selectionStart ?? input.value.length;
        input.setRangeText('', trigger.start, caret, 'end');
        if (!S.chips.some((c) => JSON.stringify(c.mention) === JSON.stringify(item.chip.mention))) S.chips.push(item.chip);
        closePopup();
        renderComposer();
        saveDraft();
        input.focus();
      },
    })),
  };
  renderPopup();
}

const SLASH: { cmd: string; label: string; icon: string; mode?: string }[] = [
  { cmd: 'agent', label: 'Agent mode', icon: '∞', mode: 'agent' },
  { cmd: 'plan', label: 'Plan mode', icon: 'checklist', mode: 'plan' },
  { cmd: 'ask', label: 'Ask mode', icon: 'comment-discussion', mode: 'ask' },
  { cmd: 'new', label: 'New chat', icon: 'add' },
  { cmd: 'review', label: 'Bugbot: review changes', icon: 'eye' },
  { cmd: 'commit', label: 'Write the commit message', icon: 'git-commit' },
  { cmd: 'pr', label: 'Open a pull request', icon: 'github' },
  { cmd: 'fix-ci', label: 'Fix failing GitHub Actions', icon: 'github' },
  { cmd: 'issue', label: 'Fix a GitHub issue', icon: 'github' },
  { cmd: 'background', label: 'Start a background agent', icon: 'robot' },
  { cmd: 'rule', label: 'New project rule', icon: 'law' },
  { cmd: 'mcp', label: 'MCP servers', icon: 'plug' },
  { cmd: 'index', label: 'Re-index the codebase', icon: 'sync' },
  { cmd: 'import', label: 'Import VS Code / Cursor settings', icon: 'cloud-download' },
  { cmd: 'settings', label: 'MusabAI settings', icon: 'settings-gear' },
];

function setMode(mode: string): void {
  if (!S.view) return;
  S.view.mode = mode;
  post({ type: 'setMode', mode });
  renderComposer();
}

function openSlash(query: string): void {
  const items = SLASH.filter((s) => s.cmd.startsWith(query.toLowerCase()) || tr(s.label).toLowerCase().includes(query.toLowerCase())).map((s) => ({
    label: `/${s.cmd}`,
    detail: tr(s.label),
    icon: s.icon,
    run: () => {
      input.value = '';
      closePopup();
      autosize();
      if (s.mode) setMode(s.mode);
      else post({ type: 'slash', command: s.cmd });
    },
  }));
  S.popup = { kind: 'slash', index: 0, items };
  renderPopup();
}

function openModeMenu(): void {
  S.popup = {
    kind: 'mode',
    index: Math.max(0, S.view?.modes.findIndex((m) => m.id === S.view?.mode) ?? 0),
    items: (S.view?.modes ?? []).map((m) => ({ label: tr(m.label), icon: MODE_ICONS[m.id] ?? 'symbol-misc', run: () => { setMode(m.id); closePopup(); input.focus(); } })),
  };
  renderPopup();
}

function setRunMode(mode: 'ask' | 'allowlist' | 'auto'): void {
  if (S.view) S.view.runMode = mode;
  post({ type: 'setRunMode', mode });
  renderComposer();
}

function openRunMenu(): void {
  S.popup = {
    kind: 'run',
    index: Math.max(0, RUN_MODES.findIndex((r) => r.id === S.view?.runMode)),
    items: RUN_MODES.map((r) => ({
      label: `${r.id === S.view?.runMode ? '✓ ' : ''}${tr(r.label)}`,
      detail: r.id === 'auto' ? tr('runs commands without asking (risky ones still ask)') : r.id === 'allowlist' ? tr('read-only and allow-listed run; the rest ask') : tr('asks before every command'),
      icon: r.icon,
      run: () => { setRunMode(r.id); closePopup(); input.focus(); },
    })),
  };
  renderPopup();
}

function openModelMenu(): void {
  const models = S.view?.models ?? [];
  S.popup = {
    kind: 'model',
    index: Math.max(0, models.findIndex((m) => m.id === S.view?.model)),
    items: models.map((m) => ({
      label: `${m.id === S.view?.model ? '✓ ' : ''}${tr(m.name)}`,
      detail: m.ready ? (m.coolingDown ? 'busy' : m.vision ? 'vision' : m.note ?? '') : tr('needs a free key'),
      icon: m.group.startsWith('Local') ? 'device-desktop' : m.ready ? 'sparkle' : 'key',
      group: m.group,
      disabled: !m.ready,
      run: () => {
        closePopup();
        if (!m.ready) return post({ type: 'openSettings', section: 'keys' });
        if (S.view) S.view.model = m.id;
        post({ type: 'setModel', model: m.id });
        renderComposer();
        input.focus();
      },
    })),
  };
  renderPopup();
}

function onInput(): void {
  autosize();
  saveDraft();
  const value = input.value;
  if (/^\/[\w-]*$/.test(value)) return openSlash(value.slice(1));
  const trigger = mentionTrigger();
  if (trigger) {
    S.mentionQuery = trigger.query;
    if (mentionTimer) clearTimeout(mentionTimer);
    mentionTimer = setTimeout(() => post({ type: 'mentionQuery', query: trigger.query }), 90);
    return;
  }
  if (S.popup?.kind === 'mention' || S.popup?.kind === 'slash') closePopup();
}

input.addEventListener('input', onInput);
input.addEventListener('keydown', (e) => {
  if (S.popup && !S.popup.items.length && e.key === 'Escape') return closePopup();
  if (S.popup && S.popup.items.length) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = S.popup.items.length;
      S.popup.index = (S.popup.index + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
      renderPopup();
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      S.popup.items[S.popup.index]?.run();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closePopup();
      return;
    }
  }
  if ((e.ctrlKey || e.metaKey) && e.key === '.') {
    e.preventDefault();
    return openModeMenu();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === '/') {
    e.preventDefault();
    return openModelMenu();
  }
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    send();
  }
  if (e.key === 'Backspace' && !input.value && S.chips.length) {
    S.chips.pop();
    renderComposer();
  }
});
input.addEventListener('blur', () => setTimeout(() => { if (S.popup && document.activeElement !== input) closePopup(); }, 150));
input.addEventListener('paste', async (e) => {
  const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
  if (!files.length) return;
  e.preventDefault();
  for (const file of files) {
    const data = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(file);
    });
    S.images.push(await resizeImage(data));
  }
  renderComposer();
});
box.addEventListener('dragover', (e) => e.preventDefault());
box.addEventListener('drop', async (e) => {
  e.preventDefault();
  const uris = (e.dataTransfer?.getData('text/uri-list') || '').split(/\r?\n/).filter((u) => u.startsWith('file://'));
  for (const uri of uris) {
    const file = decodeURIComponent(uri.slice(7));
    S.chips.push({ mention: { type: 'file', path: file }, label: file.split('/').pop() ?? file, icon: 'file' });
  }
  for (const f of [...(e.dataTransfer?.files ?? [])].filter((x) => x.type.startsWith('image/'))) {
    const data = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(f);
    });
    S.images.push(await resizeImage(data));
  }
  renderComposer();
});
modeBtn.addEventListener('click', () => (S.popup?.kind === 'mode' ? closePopup() : openModeMenu()));
runBtn.addEventListener('click', () => (S.popup?.kind === 'run' ? closePopup() : openRunMenu()));
modelBtn.addEventListener('click', () => (S.popup?.kind === 'model' ? closePopup() : openModelMenu()));
imageBtn.addEventListener('click', () => post({ type: 'pickImage' }));
sendBtn.addEventListener('click', () => send());
document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  if (S.popup && !popup.contains(target) && ![modeBtn, runBtn, modelBtn].some((b) => b === target || b.contains(target))) closePopup();
  const btn = target.closest<HTMLElement>('.cb-btn');
  if (btn) {
    const block = codeBlock(btn.dataset.block ?? '');
    if (!block) return;
    const action = btn.dataset.action;
    if (action === 'copy') {
      post({ type: 'copy', text: block.code });
      btn.classList.add('done');
      setTimeout(() => btn.classList.remove('done'), 1200);
    } else if (action === 'insert') post({ type: 'insertCode', code: block.code });
    else if (action === 'apply') post({ type: 'applyCode', code: block.code, lang: block.info.lang, file: block.info.file });
    else if (action === 'run') post({ type: 'runInTerminal', command: block.code.replace(/^\$\s+/gm, '').trim() });
    return;
  }
  const link = target.closest<HTMLAnchorElement>('.md a[href]');
  if (link) {
    const href = link.getAttribute('href') ?? '';
    if (!/^https?:/.test(href)) {
      e.preventDefault();
      const m = /^(.+?)(?::(\d+))?$/.exec(href.replace(/^file:\/\//, ''));
      if (m) post({ type: 'openFile', path: m[1], line: m[2] ? Number(m[2]) : undefined });
    }
  }
  const code = target.closest<HTMLElement>('.md code:not(.hljs)');
  if (code && /^[\w./-]+\.\w+(:\d+)?$/.test(code.textContent ?? '')) {
    const [file, line] = (code.textContent ?? '').split(':');
    post({ type: 'openFile', path: file, line: line ? Number(line) : undefined });
  }
});
document.addEventListener('keydown', (e) => {
  // Enter approves only when nothing else has the focus: on a focused control (Skip, a link, a code-block button)
  // Enter does what that control does, so it can never turn a Skip into a Run.
  const active = document.activeElement as HTMLElement | null;
  const onControl = Boolean(active && active !== document.body && active.closest('button, a, input, textarea, select, summary, [contenteditable], [tabindex]'));
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !onControl) {
    const approve = list.querySelector<HTMLButtonElement>('.approval .primary');
    if (approve) {
      e.preventDefault();
      approve.click();
    }
  }
  if (e.key === 'Escape' && running() && document.activeElement !== input) post({ type: 'stop' });
});

// ---- messages from the extension --------------------------------------------------------------------

function applyState(state: Partial<ViewState>): void {
  S.view = { ...(S.view ?? ({} as ViewState)), ...state };
  if (state.language) setLanguage(state.language);
}

window.addEventListener('message', (event: MessageEvent<HostMessage>) => {
  const m = event.data;
  switch (m.type) {
    case 'init':
      applyState(m.state);
      S.chats = m.chats;
      S.chat = m.chat;
      S.changes = m.changes;
      renderAll();
      renderHistory();
      input.focus();
      break;
    case 'state':
      applyState(m.state);
      renderComposer();
      if (!S.chat?.messages.length) renderAll();
      break;
    case 'chats':
      S.chats = m.chats;
      if (S.historyOpen) renderHistory();
      break;
    case 'chat':
      S.chat = m.chat;
      S.expanded.clear();
      renderAll();
      break;
    case 'chatEvent': {
      if (!S.chat || m.chatId !== S.chat.id) break;
      const wasEmpty = !S.chat.messages.length;
      const message = reduceChat(S.chat, m.event);
      if (m.event.type === 'truncate' || wasEmpty) renderAll();
      else if (message) {
        if (!messageEls.has(message.id)) {
          list.append(renderMessage(message));
          scrollToBottom(true);
          renderComposer();
        } else scheduleRender(message.id);
        if (m.event.type === 'agent' && m.event.event.type === 'tool_end') {
          // A finished edit can add a "Restore checkpoint" button to the user message of this turn.
          const user = S.chat.messages.find((x) => x.role === 'user' && x.turnId === message.turnId);
          if (user) scheduleRender(user.id);
        }
      }
      break;
    }
    case 'mentionResults':
      applyMentionResults(m.query, m.items);
      break;
    case 'attach':
      for (const chip of m.chips) if (!S.chips.some((c) => JSON.stringify(c.mention) === JSON.stringify(chip.mention))) S.chips.push(chip);
      renderComposer();
      if (m.focus) input.focus();
      break;
    case 'changes':
      S.changes = m.files;
      renderComposer();
      break;
    case 'focusInput':
      if (m.mode) setMode(m.mode);
      if (m.text !== undefined) {
        input.value = m.text;
        autosize();
      }
      input.focus();
      if (m.send) send();
      break;
    case 'imagePicked':
      void resizeImage(m.dataUrl).then((url) => {
        S.images.push(url);
        renderComposer();
      });
      break;
  }
});

const saved = vscode.getState() as { draft?: string; chips?: MentionChip[] } | undefined;
if (saved?.draft) input.value = saved.draft;
if (saved?.chips) S.chips = saved.chips;
autosize();
renderTop();
renderComposer();
post({ type: 'ready' });
