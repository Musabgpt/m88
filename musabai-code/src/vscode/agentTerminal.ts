import * as vscode from 'vscode';

/** The "MusabAI Agent" terminal: shows every command the agent runs and its output; Ctrl+C stops it. */
export class AgentTerminal implements vscode.Disposable {
  private terminal?: vscode.Terminal;
  private readonly writer = new vscode.EventEmitter<string>();
  private ready = false;
  private buffer: string[] = [];
  private interrupt?: () => void;
  private readonly disposables: vscode.Disposable[] = [];

  constructor() {
    this.disposables.push(
      vscode.window.onDidCloseTerminal((t) => {
        if (t === this.terminal) {
          this.terminal = undefined;
          this.ready = false;
        }
      }),
    );
  }

  private ensure(): void {
    if (this.terminal) return;
    const pty: vscode.Pseudoterminal = {
      onDidWrite: this.writer.event,
      open: () => {
        this.ready = true;
        for (const chunk of this.buffer) this.writer.fire(chunk);
        this.buffer = [];
      },
      close: () => {
        this.ready = false;
        this.terminal = undefined;
      },
      handleInput: (data) => {
        if (data === '\x03') this.interrupt?.();
      },
    };
    this.terminal = vscode.window.createTerminal({ name: 'MusabAI Agent', pty, iconPath: new vscode.ThemeIcon('sparkle') });
  }

  private write(text: string): void {
    const data = text.replace(/\r?\n/g, '\r\n');
    if (this.ready) this.writer.fire(data);
    else this.buffer.push(data);
  }

  begin(command: string, cwd: string, onInterrupt: () => void, reveal: boolean): void {
    this.ensure();
    this.interrupt = onInterrupt;
    if (reveal) this.terminal?.show(true);
    this.write(`\x1b[2m${cwd}\x1b[0m\n\x1b[1;36m$ ${command}\x1b[0m\n`);
  }

  output(chunk: string): void {
    this.write(chunk);
  }

  end(exitCode: number | null, seconds: string, note = ''): void {
    this.interrupt = undefined;
    const color = exitCode === 0 ? '32' : '31';
    this.write(`\n\x1b[${color}m[${note || `exit ${exitCode}`} · ${seconds} s]\x1b[0m\n\n`);
  }

  show(): void {
    this.ensure();
    this.terminal?.show();
  }

  dispose(): void {
    this.terminal?.dispose();
    this.writer.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
