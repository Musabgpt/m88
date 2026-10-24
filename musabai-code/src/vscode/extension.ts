import path from 'node:path';
import * as vscode from 'vscode';
import type { MentionChip } from '../webview/shared/protocol';
import { BackgroundAgents } from './background';
import { ChatController } from './chatController';
import { TabCompletion } from './completion';
import { chatModel, get, language, set } from './config';
import { GitHubCommands } from './githubCommands';
import { Importer } from './importer';
import { InlineEditController } from './inlineEdit';
import { t } from './l10n';
import { PhoneServer } from './phoneServer';
import { ReviewController } from './review';
import { generateCommitMessage } from './scm';
import { Services } from './services';
import { SettingsPanel, newRule } from './settingsPanel';
import { TerminalAssist } from './terminalAssist';
import { checkForUpdates } from './updateCheck';

function selectionChip(editor: vscode.TextEditor | undefined): MentionChip | undefined {
  if (!editor) return undefined;
  const doc = editor.document;
  const name = path.basename(doc.fileName);
  if (doc.uri.scheme !== 'file') {
    const text = editor.selection.isEmpty ? doc.getText() : doc.getText(editor.selection);
    return { mention: { type: 'text', title: name || 'Untitled', text }, label: name || 'Untitled', icon: 'file' };
  }
  const rel = vscode.workspace.asRelativePath(doc.uri, false);
  if (editor.selection.isEmpty) return { mention: { type: 'file', path: rel }, label: name, icon: 'file' };
  const start = editor.selection.start.line + 1;
  let end = editor.selection.end.line + 1;
  if (editor.selection.end.character === 0 && end > start) end--;
  return { mention: { type: 'file', path: rel, startLine: start, endLine: end }, label: `${name} (${start}-${end})`, icon: 'selection' };
}

class FixWithMusabAI implements vscode.CodeActionProvider {
  static readonly kinds = [vscode.CodeActionKind.QuickFix];
  provideCodeActions(document: vscode.TextDocument, _range: vscode.Range, context: vscode.CodeActionContext): vscode.CodeAction[] {
    const diagnostic = context.diagnostics.find((d) => d.severity <= vscode.DiagnosticSeverity.Warning);
    if (!diagnostic || document.uri.scheme !== 'file') return [];
    const action = new vscode.CodeAction('Fix with MusabAI', vscode.CodeActionKind.QuickFix);
    action.command = { command: 'musabai.fixDiagnostic', title: 'Fix with MusabAI', arguments: [document.uri, diagnostic] };
    action.diagnostics = [diagnostic];
    return [action];
  }
}

export interface MusabAIApi {
  services: Services;
  chat: ChatController;
  inline: InlineEditController;
  tab: TabCompletion;
  review: ReviewController;
  background: BackgroundAgents;
}

export async function activate(context: vscode.ExtensionContext): Promise<MusabAIApi> {
  const services = new Services(context);
  context.subscriptions.push(services);
  await services.init();

  const review = new ReviewController(services);
  const inline = new InlineEditController(services, context);
  const terminals = new TerminalAssist(services);
  const chat = new ChatController(context, services, review, terminals);
  const tab = new TabCompletion(services);
  const github = new GitHubCommands(services, chat);
  const background = new BackgroundAgents(services, context);
  const settings = new SettingsPanel(context, services, chat);
  const importer = new Importer(services, context);
  const phone = new PhoneServer(chat, services, {
    scriptPath: path.join(context.extensionPath, 'dist', 'webview', 'phone.js'),
    lang: language,
    onIdleStop: (minutes) => void vscode.window.showInformationMessage(`MusabAI: ${t('The phone link stopped after {0} minutes without a phone connected.', minutes)}`),
  });
  context.subscriptions.push(review, inline, terminals, chat, tab, github, background, settings, phone);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatController.viewId, chat, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.window.registerTreeDataProvider('musabai.backgroundAgents', background),
    vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, tab),
    vscode.languages.registerCodeActionsProvider({ scheme: 'file' }, new FixWithMusabAI(), { providedCodeActionKinds: FixWithMusabAI.kinds }),
  );

  const modelStatus = vscode.window.createStatusBarItem('musabai.model', vscode.StatusBarAlignment.Right, 100);
  modelStatus.name = 'MusabAI model';
  modelStatus.command = 'musabai.selectModel';
  const renderModel = async () => {
    const id = chatModel();
    const name = id === 'auto' ? 'Auto' : (await services.pool.resolve(id))?.name ?? id;
    modelStatus.text = `$(sparkle) ${name.length > 28 ? `${name.slice(0, 27)}…` : name}`;
    modelStatus.tooltip = 'MusabAI chat model (free) — click to change';
  };
  void renderModel();
  modelStatus.show();
  context.subscriptions.push(
    modelStatus,
    services.onDidChangeModels(() => void renderModel()),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('musabai.model')) void renderModel();
      if (e.affectsConfiguration('musabai.tab')) tab.render();
    }),
  );

  const register = (id: string, fn: (...args: any[]) => unknown) => context.subscriptions.push(vscode.commands.registerCommand(id, fn));

  register('musabai.chat.open', async () => {
    const editor = vscode.window.activeTextEditor;
    await chat.reveal();
    if (editor && !editor.selection.isEmpty) {
      const chip = selectionChip(editor);
      if (chip) chat.attach([chip]);
    }
  });
  register('musabai.chat.addSelection', async () => {
    const chip = selectionChip(vscode.window.activeTextEditor);
    await chat.reveal();
    if (chip) chat.attach([chip]);
  });
  register('musabai.chat.new', async () => {
    await chat.reveal();
    await chat.newChat();
  });
  register('musabai.chat.newAgent', async () => {
    await chat.reveal();
    await chat.newChat();
    chat.focusInput(undefined, 'agent');
  });
  register('musabai.chat.stop', () => chat.stop());
  register('musabai.explainSelection', async () => {
    const chip = selectionChip(vscode.window.activeTextEditor);
    if (!chip) return;
    await chat.newChat();
    await chat.reveal(false);
    await chat.runTurn('Explain this code: what it does, how, and anything surprising.', [chip], [], 'ask', chatModel());
  });
  register('musabai.fixDiagnostic', async (uri: vscode.Uri, diagnostic: vscode.Diagnostic) => {
    const rel = vscode.workspace.asRelativePath(uri, false);
    const start = Math.max(1, diagnostic.range.start.line + 1 - 12);
    const end = diagnostic.range.end.line + 1 + 12;
    const chip: MentionChip = { mention: { type: 'file', path: rel, startLine: start, endLine: end }, label: `${path.basename(rel)} (${start}-${end})`, icon: 'selection' };
    await chat.newChat();
    await chat.reveal(false);
    await chat.runTurn(`Fix this ${diagnostic.source ?? ''} problem at ${rel}:${diagnostic.range.start.line + 1}: ${diagnostic.message}`, [chip], [], 'agent', chatModel());
  });

  register('musabai.inlineEdit', (instruction?: string) => inline.run(undefined, typeof instruction === 'string' ? instruction : undefined));
  register('musabai.inlineEdit.accept', () => inline.resolve(undefined, 'accept'));
  register('musabai.inlineEdit.reject', () => inline.resolve(undefined, 'reject'));
  register('musabai.inlineEdit.acceptBlock', (uri: vscode.Uri, index: number) => inline.resolveBlock(uri, index, 'accept'));
  register('musabai.inlineEdit.rejectBlock', (uri: vscode.Uri, index: number) => inline.resolveBlock(uri, index, 'reject'));
  register('musabai.acceptActive', async () => {
    if (inline.hasSession()) return inline.resolve(undefined, 'accept');
    return review.acceptFile();
  });
  register('musabai.rejectActive', async () => {
    if (inline.hasSession()) return inline.resolve(undefined, 'reject');
    return review.rejectFile();
  });

  register('musabai.review.acceptFile', (uri?: vscode.Uri) => review.acceptFile(uri));
  register('musabai.review.rejectFile', (uri?: vscode.Uri) => review.rejectFile(uri));
  register('musabai.review.acceptHunk', (uri: vscode.Uri, index: number) => review.acceptHunk(uri, index));
  register('musabai.review.rejectHunk', (uri: vscode.Uri, index: number) => review.rejectHunk(uri, index));
  register('musabai.review.openDiff', (uri?: vscode.Uri) => review.openDiff(uri));
  register('musabai.review.all', () => review.reviewAll());
  register('musabai.review.acceptAll', () => review.acceptAll());
  register('musabai.review.rejectAll', () => review.rejectAll());

  register('musabai.tab.toggle', () => tab.toggle());
  register('musabai.terminal.generateCommand', () => terminals.generateCommand());
  register('musabai.terminal.addToChat', async () => {
    const text = terminals.snapshot(3);
    await chat.reveal();
    chat.attach([{ mention: { type: 'terminal', text: text || '', name: 'Terminal' }, label: 'Terminal', icon: 'terminal' }]);
  });
  register('musabai.scm.generateCommitMessage', (arg?: { rootUri?: vscode.Uri }) => generateCommitMessage(services, arg));

  register('musabai.github.signIn', () => github.signIn());
  register('musabai.github.createPullRequest', () => github.createPullRequest());
  register('musabai.github.review', () => github.review());
  register('musabai.github.fixIssue', () => github.fixIssue());
  register('musabai.github.fixCI', () => github.fixCI());

  register('musabai.background.new', (prompt?: string) => background.create(typeof prompt === 'string' ? prompt : undefined));
  register('musabai.background.stop', (item: never) => background.stop(item));
  register('musabai.background.review', (item: never) => background.review(item));
  register('musabai.background.apply', (item: never) => background.apply(item));
  register('musabai.background.createPr', (item: never) => background.createPr(item));
  register('musabai.background.discard', (item: never) => background.discard(item));
  register('musabai.background.openWorktree', (item: never) => background.openWorktree(item));
  register('musabai.background.showLog', (id: string) => background.showLog(id));
  register('musabai.background.diffFile', (id: string, file: string) => background.diffFile(id, file));

  register('musabai.openSettings', (section?: string) => settings.open(typeof section === 'string' ? section : undefined));
  register('musabai.rules.new', () => newRule(services.root));
  register('musabai.index.rebuild', async () => {
    if (!services.index) return;
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'MusabAI: indexing the codebase' }, () => services.index!.build());
    void vscode.window.setStatusBarMessage(`MusabAI: indexed ${services.index.status.files} files`, 4000);
  });
  register('musabai.import', (from?: string) => importer.run(typeof from === 'string' ? from : undefined));
  register('musabai.walkthrough', () =>
    vscode.commands.executeCommand('workbench.action.openWalkthrough', `${context.extension.id}#musabai.welcome`, false),
  );
  register('musabai.selectModel', async () => {
    const options = await chat.modelOptions();
    const current = chatModel();
    const items: (vscode.QuickPickItem & { id?: string })[] = [];
    let group = '';
    for (const o of options) {
      if (o.group !== group) {
        group = o.group;
        items.push({ label: group, kind: vscode.QuickPickItemKind.Separator });
      }
      items.push({
        id: o.id,
        label: `${o.id === current ? '$(check) ' : ''}${o.name}`,
        description: o.ready ? (o.coolingDown ? 'busy, cooling down' : o.note ?? '') : 'needs a free key',
        detail: o.id,
      });
    }
    const pick = await vscode.window.showQuickPick(items, { title: 'MusabAI chat model (all free)', matchOnDetail: true });
    if (!pick?.id) return;
    const chosen = options.find((o) => o.id === pick.id);
    if (chosen && !chosen.ready && chosen.secretId) {
      await settings.open('keys');
      return;
    }
    await set('model', pick.id);
  });

  register('musabai.checkForUpdates', () => checkForUpdates(context, true));

  let pairingPanel: vscode.WebviewPanel | undefined;
  register('musabai.phone.start', async () => {
    try {
      const info = await phone.start(get('phone.port', 0));
      // One pairing panel: running the command again shows a fresh one-time code in it.
      if (!pairingPanel) {
        pairingPanel = vscode.window.createWebviewPanel('musabai.phone', 'MusabAI — Phone Link', vscode.ViewColumn.Active, { enableScripts: false });
        pairingPanel.onDidDispose(() => (pairingPanel = undefined));
      } else pairingPanel.reveal();
      pairingPanel.webview.html = phone.pairingHtml(info);
    } catch (e) {
      void vscode.window.showErrorMessage(`${t('Could not start the phone link')}: ${(e as Error).message}`);
    }
  });
  register('musabai.phone.stop', async () => {
    const was = phone.running;
    await phone.stop();
    pairingPanel?.dispose();
    void vscode.window.showInformationMessage(was ? t('MusabAI phone link stopped.') : t('The phone link was not running.'));
  });

  // Start MCP servers in the background so their tools are ready for the first request.
  setTimeout(() => void services.mcp?.startAll(), 4000);
  // Tell the user (once a day, never silently installing) when a newer release is published.
  setTimeout(() => void checkForUpdates(context, false), 10_000);

  if (!context.globalState.get('musabai.welcomed') && get('showWelcome', true)) {
    void context.globalState.update('musabai.welcomed', true);
    setTimeout(() => {
      void chat.reveal(false);
      void vscode.commands.executeCommand('musabai.walkthrough');
    }, 1500);
  }
  return { services, chat, inline, tab, review, background };
}

export function deactivate(): void {
  // Disposables registered on the context clean up the agent processes and MCP servers.
}
