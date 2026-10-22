import path from 'node:path';
import * as vscode from 'vscode';
import type { Hunk } from '../core/diff';
import { t } from './l10n';
import type { Services } from './services';

export const ORIGINAL_SCHEME = 'musabai-original';

export function originalUri(file: string): vscode.Uri {
  return vscode.Uri.from({ scheme: ORIGINAL_SCHEME, path: file, query: String(Date.now()) });
}

/** Agent edits waiting for review: highlighted in editors, with Accept/Reject per hunk and per file. */
export class ReviewController implements vscode.Disposable, vscode.CodeLensProvider, vscode.TextDocumentContentProvider {
  private readonly added = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: new vscode.ThemeColor('diffEditor.insertedLineBackground'),
    overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.addedForeground'),
    overviewRulerLane: vscode.OverviewRulerLane.Left,
  });
  private readonly removed = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    borderWidth: '1px 0 0 0',
    borderStyle: 'dashed',
    borderColor: new vscode.ThemeColor('diffEditor.removedTextBorder'),
    overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.deletedForeground'),
    overviewRulerLane: vscode.OverviewRulerLane.Left,
  });
  private readonly lenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.lenses.event;
  private readonly contentChanged = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.contentChanged.event;
  private readonly listeners = new Set<() => void>();
  private readonly hunkCache = new Map<string, Hunk[]>();
  private timer?: NodeJS.Timeout;
  private readonly disposables: vscode.Disposable[] = [];
  private unsubscribe?: () => void;

  constructor(private readonly services: Services) {
    this.disposables.push(
      vscode.languages.registerCodeLensProvider({ scheme: 'file' }, this),
      vscode.workspace.registerTextDocumentContentProvider(ORIGINAL_SCHEME, this),
      vscode.window.onDidChangeVisibleTextEditors(() => this.schedule()),
      vscode.window.onDidChangeActiveTextEditor(() => this.updateContext()),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (this.services.changes?.has(e.document.uri.fsPath)) this.schedule();
      }),
      services.onDidChangeWorkspace(() => this.attach()),
    );
    this.attach();
  }

  private attach(): void {
    this.unsubscribe?.();
    this.unsubscribe = this.services.changes?.onDidChange(() => this.schedule());
    this.schedule();
  }

  onDidChangePending(listener: () => void): vscode.Disposable {
    this.listeners.add(listener);
    return new vscode.Disposable(() => this.listeners.delete(listener));
  }

  schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.refresh(), 120);
  }

  async refresh(): Promise<void> {
    const changes = this.services.changes;
    this.hunkCache.clear();
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.uri.scheme !== 'file') continue;
      const file = editor.document.uri.fsPath;
      if (!changes?.has(file)) {
        editor.setDecorations(this.added, []);
        editor.setDecorations(this.removed, []);
        continue;
      }
      const list = await changes.hunks(file);
      this.hunkCache.set(file, list);
      const addedRanges: vscode.Range[] = [];
      const removedMarks: vscode.DecorationOptions[] = [];
      const lastLine = Math.max(0, editor.document.lineCount - 1);
      for (const h of list) {
        if (h.newLines.length) addedRanges.push(new vscode.Range(h.newStart, 0, Math.min(lastLine, h.newStart + h.newLines.length - 1), 0));
        if (h.oldLines.length) {
          const line = Math.min(lastLine, h.newStart);
          const md = new vscode.MarkdownString();
          md.appendMarkdown(`**MusabAI** — ${h.oldLines.length} line${h.oldLines.length === 1 ? '' : 's'} replaced or removed:\n`);
          md.appendCodeblock(h.oldLines.join('').replace(/\n$/, '').slice(0, 4000), editor.document.languageId);
          removedMarks.push({
            range: new vscode.Range(line, 0, line, 0),
            hoverMessage: md,
            renderOptions: h.newLines.length
              ? undefined
              : { after: { contentText: `  ⌫ ${h.oldLines.length} removed`, color: new vscode.ThemeColor('editorCodeLens.foreground'), fontStyle: 'italic' } },
          });
        }
      }
      editor.setDecorations(this.added, addedRanges);
      editor.setDecorations(this.removed, removedMarks);
    }
    this.lenses.fire();
    this.updateContext();
    this.listeners.forEach((l) => l());
  }

  private updateContext(): void {
    const editor = vscode.window.activeTextEditor;
    const pending = Boolean(editor && this.services.changes?.has(editor.document.uri.fsPath));
    void vscode.commands.executeCommand('setContext', 'musabai.pendingChangesInEditor', pending);
  }

  async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    const file = document.uri.fsPath;
    const changes = this.services.changes;
    if (!changes?.has(file)) return [];
    const list = this.hunkCache.get(file) ?? (await changes.hunks(file));
    if (!list.length) return [];
    const top = new vscode.Range(0, 0, 0, 0);
    const lenses = [
      new vscode.CodeLens(top, { title: `$(sparkle) MusabAI: ${list.length} change${list.length === 1 ? '' : 's'}`, command: 'musabai.review.openDiff', arguments: [document.uri] }),
      new vscode.CodeLens(top, { title: `$(check) ${t('Accept all')}`, command: 'musabai.review.acceptFile', arguments: [document.uri] }),
      new vscode.CodeLens(top, { title: `$(close) ${t('Reject all')}`, command: 'musabai.review.rejectFile', arguments: [document.uri] }),
      new vscode.CodeLens(top, { title: `$(diff) ${t('Open diff')}`, command: 'musabai.review.openDiff', arguments: [document.uri] }),
    ];
    list.forEach((h, index) => {
      const line = Math.min(Math.max(0, document.lineCount - 1), h.newStart);
      if (line === 0 && index === 0 && list.length === 1) return;
      const range = new vscode.Range(line, 0, line, 0);
      lenses.push(
        new vscode.CodeLens(range, { title: `$(check) ${t('Accept')}`, command: 'musabai.review.acceptHunk', arguments: [document.uri, index] }),
        new vscode.CodeLens(range, { title: `$(close) ${t('Reject')}`, command: 'musabai.review.rejectHunk', arguments: [document.uri, index] }),
      );
    });
    return lenses;
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.services.changes?.baseline(uri.path) ?? '';
  }

  private target(uri?: vscode.Uri | string): string | undefined {
    if (typeof uri === 'string') return uri;
    return (uri ?? vscode.window.activeTextEditor?.document.uri)?.fsPath;
  }

  async acceptFile(uri?: vscode.Uri | string): Promise<void> {
    const file = this.target(uri);
    if (file) this.services.changes?.accept(file);
  }

  async rejectFile(uri?: vscode.Uri | string): Promise<void> {
    const file = this.target(uri);
    if (file) await this.services.changes?.reject(file);
  }

  async acceptHunk(uri: vscode.Uri, index: number): Promise<void> {
    await this.services.changes?.acceptHunk(uri.fsPath, index);
  }

  async rejectHunk(uri: vscode.Uri, index: number): Promise<void> {
    await this.services.changes?.rejectHunk(uri.fsPath, index);
  }

  async openDiff(uri?: vscode.Uri | string): Promise<void> {
    const file = this.target(uri);
    if (!file || !this.services.changes?.has(file)) return;
    const right = vscode.Uri.file(file);
    this.contentChanged.fire(originalUri(file));
    await vscode.commands.executeCommand('vscode.diff', originalUri(file), right, `${path.basename(file)} (MusabAI changes)`);
  }

  async reviewAll(): Promise<void> {
    const summary = (await this.services.changes?.summary()) ?? [];
    if (!summary.length) return;
    if (summary.length === 1) return this.openDiff(summary[0].path);
    const resources = summary.map((s) => [vscode.Uri.file(s.path), originalUri(s.path), vscode.Uri.file(s.path)]);
    try {
      await vscode.commands.executeCommand('vscode.changes', 'MusabAI changes', resources);
    } catch {
      await this.openDiff(summary[0].path);
    }
  }

  async acceptAll(): Promise<void> {
    this.services.changes?.acceptAll();
  }

  async rejectAll(): Promise<void> {
    await this.services.changes?.rejectAll();
  }

  dispose(): void {
    this.unsubscribe?.();
    this.added.dispose();
    this.removed.dispose();
    this.lenses.dispose();
    this.contentChanged.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
