import * as vscode from 'vscode';
import { stripAnsi } from '../core/host';
import { terminalCommand } from '../core/oneshot';
import { chatModel } from './config';
import { t } from './l10n';
import type { Services } from './services';

interface Execution {
  command: string;
  output: string;
  exitCode?: number;
  terminal: string;
}

/** Ctrl+K in the terminal, and the recent output of the user's terminals for @terminal context. */
export class TerminalAssist implements vscode.Disposable {
  private readonly recent: Execution[] = [];
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly services: Services) {
    const start = (vscode.window as { onDidStartTerminalShellExecution?: vscode.Event<vscode.TerminalShellExecutionStartEvent> }).onDidStartTerminalShellExecution;
    const end = (vscode.window as { onDidEndTerminalShellExecution?: vscode.Event<vscode.TerminalShellExecutionEndEvent> }).onDidEndTerminalShellExecution;
    if (start && end) {
      this.disposables.push(
        start(async (e) => {
          if (e.terminal.name === 'MusabAI Agent') return;
          const entry: Execution = { command: e.execution.commandLine.value, output: '', terminal: e.terminal.name };
          this.recent.push(entry);
          if (this.recent.length > 20) this.recent.shift();
          try {
            for await (const chunk of e.execution.read()) {
              entry.output += chunk;
              if (entry.output.length > 30_000) entry.output = entry.output.slice(-30_000);
            }
          } catch {
            // the stream ends with the command
          }
        }),
        end((e) => {
          const entry = [...this.recent].reverse().find((x) => x.command === e.execution.commandLine.value && x.exitCode === undefined);
          if (entry) entry.exitCode = e.exitCode;
        }),
      );
    }
  }

  /** The latest commands and their output, newest last. */
  snapshot(limit = 3): string {
    return this.recent
      .slice(-limit)
      .map((e) => `$ ${e.command}\n${stripAnsi(e.output).trim()}\n[exit ${e.exitCode ?? '?'}]`)
      .join('\n\n');
  }

  lastFailure(): Execution | undefined {
    return [...this.recent].reverse().find((e) => e.exitCode !== undefined && e.exitCode !== 0);
  }

  async generateCommand(): Promise<void> {
    const terminal = vscode.window.activeTerminal ?? vscode.window.createTerminal({ name: 'bash' });
    const request = await vscode.window.showInputBox({ title: 'MusabAI — terminal (Ctrl+K)', prompt: t('Describe the command to run'), placeHolder: 'e.g. find the 10 biggest files here / kill whatever uses port 3000' });
    if (!request?.trim()) return;
    const cwd = terminal.shellIntegration?.cwd?.fsPath || this.services.root || process.env.HOME || '/';
    const command = await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'MusabAI…' }, () =>
      terminalCommand(this.services.pool, chatModel(), request, cwd).catch((error: Error) => {
        void vscode.window.showErrorMessage(`MusabAI: ${error.message}`);
        return '';
      }),
    );
    if (!command) return;
    terminal.show();
    // Typed, not executed: the user reads it and presses Enter.
    terminal.sendText(command, false);
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
