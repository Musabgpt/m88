import * as vscode from 'vscode';
import { hunks, splitLines } from '../core/diff';
import { inlineEdit } from '../core/oneshot';
import { chatModel, get } from './config';
import { t } from './l10n';
import type { Services } from './services';

interface Block {
  /** First red (old) line; the green (new) lines follow the red ones. */
  start: number;
  removed: number;
  added: number;
}

interface Session {
  uri: string;
  blocks: Block[];
}

const HISTORY_KEY = 'musabai.inlineHistory';

/** Ctrl+K: rewrite the selection (or write at the cursor) and review the result as an inline red/green diff. */
export class InlineEditController implements vscode.Disposable, vscode.CodeLensProvider {
  private readonly sessions = new Map<string, Session>();
  private readonly red = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: new vscode.ThemeColor('diffEditor.removedLineBackground'),
    textDecoration: 'line-through',
    opacity: '0.75',
  });
  private readonly green = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: new vscode.ThemeColor('diffEditor.insertedLineBackground'),
  });
  private readonly lenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.lenses.event;
  private applying = false;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly services: Services, private readonly context: vscode.ExtensionContext) {
    this.disposables.push(
      vscode.languages.registerCodeLensProvider({ scheme: 'file' }, this),
      vscode.languages.registerCodeLensProvider({ scheme: 'untitled' }, this),
      vscode.window.onDidChangeVisibleTextEditors(() => this.decorateAll()),
      vscode.window.onDidChangeActiveTextEditor(() => this.updateContext()),
      vscode.workspace.onDidChangeTextDocument((e) => this.onChange(e)),
      vscode.workspace.onWillSaveTextDocument((e) => {
        const session = this.sessions.get(e.document.uri.toString());
        if (session) e.waitUntil(Promise.resolve(this.resolveEdits(e.document, session, 'accept')).then((edits) => {
          this.sessions.delete(e.document.uri.toString());
          this.decorateAll();
          return edits;
        }));
      }),
      vscode.workspace.onDidCloseTextDocument((d) => this.sessions.delete(d.uri.toString())),
    );
  }

  hasSession(editor = vscode.window.activeTextEditor): boolean {
    return Boolean(editor && this.sessions.has(editor.document.uri.toString()));
  }

  private async askInstruction(selectionEmpty: boolean): Promise<string | undefined> {
    const history = this.context.globalState.get<string[]>(HISTORY_KEY, []);
    const pick = vscode.window.createQuickPick();
    pick.title = selectionEmpty ? 'MusabAI — generate code at the cursor (Ctrl+K)' : 'MusabAI — edit selection (Ctrl+K)';
    pick.placeholder = t('Describe the change (Ctrl+K)');
    pick.items = history.map((label) => ({ label, description: '$(history)' }));
    pick.matchOnDescription = false;
    return new Promise((resolve) => {
      let done = false;
      pick.onDidAccept(() => {
        done = true;
        const value = pick.value.trim() || pick.selectedItems[0]?.label || '';
        pick.hide();
        resolve(value || undefined);
      });
      pick.onDidHide(() => {
        if (!done) resolve(undefined);
        pick.dispose();
      });
      pick.show();
    });
  }

  async run(editor = vscode.window.activeTextEditor, preset?: string): Promise<void> {
    if (!editor) return;
    if (this.hasSession(editor)) {
      await this.resolve(editor, 'accept');
    }
    const doc = editor.document;
    const sel = editor.selection;
    const empty = sel.isEmpty;
    const startLine = sel.start.line;
    let endLine = sel.end.line;
    if (!empty && sel.end.character === 0 && endLine > startLine) endLine--;
    const range = empty
      ? new vscode.Range(startLine, 0, startLine, 0)
      : new vscode.Range(startLine, 0, endLine + 1 < doc.lineCount ? endLine + 1 : endLine, endLine + 1 < doc.lineCount ? 0 : doc.lineAt(endLine).text.length);
    const instruction = preset?.trim() || (await this.askInstruction(empty));
    if (!instruction) return;
    const history = this.context.globalState.get<string[]>(HISTORY_KEY, []).filter((h) => h !== instruction);
    await this.context.globalState.update(HISTORY_KEY, [instruction, ...history].slice(0, 25));

    const original = doc.getText(range);
    const before = doc.getText(new vscode.Range(new vscode.Position(Math.max(0, startLine - 120), 0), range.start));
    const after = doc.getText(new vscode.Range(range.end, new vscode.Position(Math.min(doc.lineCount - 1, endLine + 60), 0)));
    const model = get<string>('inlineEdit.model', '') || chatModel();
    const versionBefore = doc.version;

    let result: string | undefined;
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: t('MusabAI is editing…'), cancellable: true },
      async (_progress, token) => {
        const controller = new AbortController();
        token.onCancellationRequested(() => controller.abort());
        try {
          result = await inlineEdit(
            this.services.pool,
            model,
            { file: vscode.workspace.asRelativePath(doc.uri), language: doc.languageId, before, selection: empty ? '' : original, after, instruction },
            controller.signal,
          );
        } catch (error) {
          if (!controller.signal.aborted) void vscode.window.showErrorMessage(`MusabAI: ${(error as Error).message}`);
        }
      },
    );
    if (result === undefined) return;
    if (doc.version !== versionBefore) {
      void vscode.window.showWarningMessage('MusabAI: the file changed while the edit was being written; run Ctrl+K again.');
      return;
    }
    let replacement = result;
    if (original.endsWith('\n') && !replacement.endsWith('\n')) replacement += '\n';
    if (empty && replacement && !replacement.endsWith('\n')) replacement += '\n';
    if (empty) {
      const indent = /^\s*/.exec(doc.lineAt(startLine).text)?.[0] ?? '';
      if (indent && !/^\s/.test(replacement)) replacement = replacement.split('\n').map((l) => (l ? indent + l : l)).join('\n');
    }
    await this.show(editor, range, original, replacement);
  }

  /** Writes old (red) and new (green) lines into the document and tracks them as blocks. */
  async show(editor: vscode.TextEditor, range: vscode.Range, original: string, replacement: string): Promise<void> {
    const list = hunks(original, replacement);
    if (!list.length) {
      void vscode.window.showInformationMessage('MusabAI: no change was needed.');
      return;
    }
    const oldLines = splitLines(original);
    let merged = '';
    const blocks: Block[] = [];
    let oldIndex = 0;
    let line = range.start.line;
    const pushLines = (lines: string[]) => {
      for (const l of lines) {
        merged += l.endsWith('\n') ? l : `${l}\n`;
        line++;
      }
    };
    for (const h of list) {
      pushLines(oldLines.slice(oldIndex, h.oldStart));
      blocks.push({ start: line, removed: h.oldLines.length, added: h.newLines.length });
      pushLines(h.oldLines);
      pushLines(h.newLines);
      oldIndex = h.oldStart + h.oldLines.length;
    }
    pushLines(oldLines.slice(oldIndex));
    if (!original.endsWith('\n') && !replacement.endsWith('\n') && merged.endsWith('\n') && range.end.line === editor.document.lineCount - 1) {
      merged = merged.slice(0, -1);
    }
    this.applying = true;
    try {
      await editor.edit((b) => b.replace(range, merged));
    } finally {
      this.applying = false;
    }
    this.sessions.set(editor.document.uri.toString(), { uri: editor.document.uri.toString(), blocks });
    this.decorateAll();
  }

  private onChange(e: vscode.TextDocumentChangeEvent): void {
    if (this.applying) return;
    const session = this.sessions.get(e.document.uri.toString());
    if (!session || !e.contentChanges.length) return;
    for (const change of e.contentChanges) {
      const delta = change.text.split('\n').length - 1 - (change.range.end.line - change.range.start.line);
      for (const block of session.blocks) {
        const end = block.start + block.removed + block.added - 1;
        if (change.range.end.line < block.start) block.start += delta;
        else if (change.range.start.line >= block.start + block.removed && change.range.end.line <= end) block.added += delta;
        else if (change.range.start.line >= block.start && change.range.end.line < block.start + block.removed) block.removed += delta;
        else if (change.range.start.line <= end && delta !== 0) {
          // An edit across the diff: keep the text as it is and stop tracking it.
          this.sessions.delete(session.uri);
          break;
        }
      }
    }
    if (this.sessions.has(session.uri)) session.blocks = session.blocks.filter((b) => b.removed > 0 || b.added > 0);
    this.decorateAll();
  }

  private resolveEdits(doc: vscode.TextDocument, session: Session, action: 'accept' | 'reject', only?: number): vscode.TextEdit[] {
    const edits: vscode.TextEdit[] = [];
    session.blocks.forEach((block, index) => {
      if (only !== undefined && index !== only) return;
      const from = action === 'accept' ? block.start : block.start + block.removed;
      const count = action === 'accept' ? block.removed : block.added;
      if (count <= 0) return;
      const end = from + count;
      const range = end < doc.lineCount ? new vscode.Range(from, 0, end, 0) : new vscode.Range(from > 0 ? from - 1 : 0, from > 0 ? doc.lineAt(from - 1).text.length : 0, doc.lineCount - 1, doc.lineAt(doc.lineCount - 1).text.length);
      edits.push(vscode.TextEdit.delete(range));
    });
    return edits;
  }

  async resolve(editor: vscode.TextEditor | undefined, action: 'accept' | 'reject', only?: number): Promise<void> {
    editor ??= vscode.window.activeTextEditor;
    if (!editor) return;
    const key = editor.document.uri.toString();
    const session = this.sessions.get(key);
    if (!session) return;
    const edits = this.resolveEdits(editor.document, session, action, only);
    this.applying = true;
    try {
      await editor.edit((b) => {
        for (const edit of edits) b.delete(edit.range);
      });
    } finally {
      this.applying = false;
    }
    if (only === undefined) this.sessions.delete(key);
    else {
      const block = session.blocks[only];
      const removedLines = action === 'accept' ? block.removed : block.added;
      session.blocks.splice(only, 1);
      for (const b of session.blocks) if (b.start > block.start) b.start -= removedLines;
      if (!session.blocks.length) this.sessions.delete(key);
    }
    this.decorateAll();
  }

  private decorateAll(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      const session = this.sessions.get(editor.document.uri.toString());
      const red: vscode.Range[] = [];
      const green: vscode.Range[] = [];
      for (const b of session?.blocks ?? []) {
        if (b.removed) red.push(new vscode.Range(b.start, 0, b.start + b.removed - 1, 0));
        if (b.added) green.push(new vscode.Range(b.start + b.removed, 0, b.start + b.removed + b.added - 1, 0));
      }
      editor.setDecorations(this.red, red);
      editor.setDecorations(this.green, green);
    }
    this.lenses.fire();
    this.updateContext();
  }

  private updateContext(): void {
    void vscode.commands.executeCommand('setContext', 'musabai.inlineDiffVisible', this.hasSession());
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const session = this.sessions.get(document.uri.toString());
    if (!session) return [];
    const lenses: vscode.CodeLens[] = [];
    session.blocks.forEach((b, index) => {
      const range = new vscode.Range(b.start, 0, b.start, 0);
      if (index === 0 && session.blocks.length > 1) {
        lenses.push(
          new vscode.CodeLens(range, { title: `$(check-all) ${t('Accept all')}`, command: 'musabai.inlineEdit.accept' }),
          new vscode.CodeLens(range, { title: `$(close-all) ${t('Reject all')}`, command: 'musabai.inlineEdit.reject' }),
        );
      }
      lenses.push(
        new vscode.CodeLens(range, { title: `$(check) ${t('Accept')} (Ctrl+Enter)`, command: 'musabai.inlineEdit.acceptBlock', arguments: [document.uri, index] }),
        new vscode.CodeLens(range, { title: `$(close) ${t('Reject')} (Ctrl+Backspace)`, command: 'musabai.inlineEdit.rejectBlock', arguments: [document.uri, index] }),
      );
    });
    return lenses;
  }

  async resolveBlock(uri: vscode.Uri, index: number, action: 'accept' | 'reject'): Promise<void> {
    const editor = vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === uri.toString());
    await this.resolve(editor, action, index);
  }

  dispose(): void {
    this.red.dispose();
    this.green.dispose();
    this.lenses.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
