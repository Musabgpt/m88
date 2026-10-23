import { spawn } from 'node:child_process';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/** Asks the user for their sudo password; retry is true after a wrong one. Undefined means they cancelled. */
export type SudoPasswordPrompt = (retry: boolean) => Promise<string | undefined>;

export const USES_SUDO = /(^|[\s;&|(])sudo(\s|$)/;

function sudo(args: string[], input?: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('sudo', args, { stdio: ['pipe', 'ignore', 'ignore'], detached: true });
    const timer = setTimeout(() => child.kill('SIGKILL'), 15_000);
    child.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
    child.stdin.end(input ?? '');
  });
}

/**
 * Remembers the sudo password for the session, after asking the user once, and hands it to sudo through an
 * askpass helper that lives only while a command runs. The password stays in memory and is never put in the
 * environment or on the command line.
 */
export class SudoPassword {
  private password?: string;

  constructor(private readonly prompt: SudoPasswordPrompt) {}

  get secret(): string | undefined {
    return this.password;
  }

  forget(): void {
    this.password = undefined;
  }

  /** Environment that lets sudo in the command read the password, or undefined if none is needed or given. */
  async prepare(): Promise<{ env: Record<string, string>; cleanup: () => Promise<void> } | undefined> {
    if (!this.password) {
      if (await sudo(['-n', 'true'])) return undefined;
      for (let attempt = 0; attempt < 3 && !this.password; attempt++) {
        const candidate = await this.prompt(attempt > 0);
        if (candidate === undefined) return undefined;
        if (await sudo(['-k', '-S', '-p', '', 'true'], `${candidate}\n`)) this.password = candidate;
      }
      if (!this.password) return undefined;
    }
    const dir = await mkdtemp(path.join(os.tmpdir(), 'musabai-sudo-'));
    await chmod(dir, 0o700);
    const secretFile = path.join(dir, 'p');
    const helper = path.join(dir, 'askpass');
    await writeFile(secretFile, `${this.password}\n`, { mode: 0o600 });
    await writeFile(helper, `#!/bin/sh\ncat '${secretFile}'\n`, { mode: 0o700 });
    return {
      // sudo uses the helper when there is no terminal, but only if DISPLAY is set; the helper itself needs no display.
      env: { SUDO_ASKPASS: helper, DISPLAY: process.env.DISPLAY || ':0' },
      cleanup: () => rm(dir, { recursive: true, force: true }),
    };
  }
}

export function redact(text: string, secret: string | undefined): string {
  return secret ? text.split(secret).join('********') : text;
}
