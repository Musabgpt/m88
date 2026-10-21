import { access, constants } from 'node:fs/promises';
import path from 'node:path';
import * as vscode from 'vscode';
import { type ApprovalRequest, type ApprovalResult, type Diagnostic, type ExecOptions, type ExecResult, NodeHost, type SearchHit } from '../core/host';
import type { CodebaseIndex } from '../core/index/indexer';
import { relPath } from '../core/util';
import type { AgentTerminal } from './agentTerminal';
import { get } from './config';

export async function bundledRipgrep(): Promise<string | undefined> {
  const candidates = [
    path.join(vscode.env.appRoot, 'node_modules.asar.unpacked', '@vscode', 'ripgrep-universal', 'bin', `${process.platform}-${process.arch}`, 'rg'),
    path.join(vscode.env.appRoot, 'node_modules', '@vscode', 'ripgrep', 'bin', 'rg'),
    path.join(vscode.env.appRoot, 'node_modules.asar.unpacked', '@vscode', 'ripgrep', 'bin', 'rg'),
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // next
    }
  }
  return undefined;
}

function openDocument(abs: string): vscode.TextDocument | undefined {
  return vscode.workspace.textDocuments.find((d) => d.uri.scheme === 'file' && d.uri.fsPath === abs);
}

const SEVERITY: Record<number, Diagnostic['severity']> = {
  [vscode.DiagnosticSeverity.Error]: 'error',
  [vscode.DiagnosticSeverity.Warning]: 'warning',
  [vscode.DiagnosticSeverity.Information]: 'info',
  [vscode.DiagnosticSeverity.Hint]: 'info',
};

export interface VsHostOptions {
  root: string;
  rgPath?: string;
  terminal: AgentTerminal;
  approve: (request: ApprovalRequest) => Promise<ApprovalResult>;
  index?: () => CodebaseIndex | undefined;
}

/** The agent's view of the editor: open buffers, workspace edits, the agent terminal and language-server diagnostics. */
export class VsCodeHost extends NodeHost {
  constructor(private readonly vsOptions: VsHostOptions) {
    super({ root: vsOptions.root, rgPath: vsOptions.rgPath, approve: vsOptions.approve });
  }

  override async readText(abs: string): Promise<string | undefined> {
    const doc = openDocument(abs);
    if (doc && !doc.isClosed) return doc.getText();
    return super.readText(abs);
  }

  override async writeText(abs: string, content: string): Promise<void> {
    const doc = openDocument(abs);
    if (doc && !doc.isClosed) {
      const edit = new vscode.WorkspaceEdit();
      edit.replace(doc.uri, new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), content);
      if (await vscode.workspace.applyEdit(edit)) {
        await doc.save();
        return;
      }
    }
    await super.writeText(abs, content);
  }

  override async exec(command: string, options: ExecOptions = {}): Promise<ExecResult> {
    const terminal = this.vsOptions.terminal;
    const local = new AbortController();
    const signal = options.signal ? AbortSignal.any([options.signal, local.signal]) : local.signal;
    const cwd = options.cwd ? path.resolve(this.root, options.cwd) : this.root;
    terminal.begin(command, relPath(this.root, cwd) === '.' ? path.basename(this.root) : relPath(this.root, cwd), () => local.abort(), get('agent.revealTerminal', true));
    const result = await super.exec(command, {
      ...options,
      signal,
      onOutput: (chunk) => {
        terminal.output(chunk);
        options.onOutput?.(chunk);
      },
    });
    const seconds = (result.durationMs / 1000).toFixed(1);
    if (result.backgroundId) terminal.end(0, seconds, `running in the background as ${result.backgroundId}`);
    else terminal.end(result.exitCode, seconds, result.timedOut ? 'timed out' : result.killed ? 'stopped' : '');
    return result;
  }

  override async diagnostics(paths: string[]): Promise<Diagnostic[]> {
    const uris = paths.map((p) => vscode.Uri.file(p));
    // Language servers report on documents the editor has loaded; load them, then give the servers a moment.
    await Promise.all(uris.map((u) => vscode.workspace.openTextDocument(u).then(undefined, () => undefined)));
    await new Promise<void>((resolve) => {
      const timer = setTimeout(done, 2500);
      let quiet: NodeJS.Timeout | undefined;
      const sub = vscode.languages.onDidChangeDiagnostics((e) => {
        if (!e.uris.some((u) => uris.some((x) => x.fsPath === u.fsPath))) return;
        if (quiet) clearTimeout(quiet);
        quiet = setTimeout(done, 400);
      });
      function done() {
        clearTimeout(timer);
        if (quiet) clearTimeout(quiet);
        sub.dispose();
        resolve();
      }
    });
    const out: Diagnostic[] = [];
    const missing: string[] = [];
    for (const uri of uris) {
      const found = vscode.languages.getDiagnostics(uri).filter((d) => d.severity <= vscode.DiagnosticSeverity.Warning);
      if (!found.length) missing.push(uri.fsPath);
      for (const d of found) {
        out.push({
          path: relPath(this.root, uri.fsPath),
          line: d.range.start.line + 1,
          column: d.range.start.character + 1,
          severity: SEVERITY[d.severity] ?? 'info',
          message: d.message,
          source: d.source,
        });
      }
    }
    // Files no language server covers still get the basic syntax checks.
    return [...out, ...(missing.length ? await super.diagnostics(missing) : [])];
  }

  async codebaseSearch(query: string, limit: number): Promise<SearchHit[]> {
    const index = this.vsOptions.index?.();
    return index ? index.search(query, limit) : [];
  }

  async openInEditor(abs: string, line?: number): Promise<void> {
    const doc = await vscode.workspace.openTextDocument(abs);
    const pos = new vscode.Position(Math.max(0, (line ?? 1) - 1), 0);
    await vscode.window.showTextDocument(doc, { selection: new vscode.Range(pos, pos), preview: false });
  }
}
