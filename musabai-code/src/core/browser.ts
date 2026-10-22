import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

/** Chromium-family browsers REA/CDP can drive, in order of preference. */
const CANDIDATES = ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable', 'brave-browser', 'microsoft-edge'];
const ABSOLUTE = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium', '/usr/bin/google-chrome', '/opt/google/chrome/chrome'];

export interface BrowserDeps {
  which: (cmd: string) => Promise<string | undefined>;
  headless?: boolean;
  /** Spawn as root needs --no-sandbox (same as the editor launcher). */
  noSandbox?: boolean;
}

export interface PageState {
  url: string;
  title: string;
  text: string;
  consoleErrors: string[];
}

export async function findBrowser(deps: BrowserDeps): Promise<string | undefined> {
  const override = process.env.MUSABAI_BROWSER;
  if (override) return override;
  for (const name of CANDIDATES) {
    const found = await deps.which(name);
    if (found) return found;
  }
  // Installs that are not on PATH: `which` checks a path with a slash as it is.
  for (const abs of ABSOLUTE) {
    const found = await deps.which(abs);
    if (found) return found;
  }
  return undefined;
}

/** Drives a Chromium-family browser over the DevTools Protocol: one tab, navigate, read, screenshot, click and type. */
export class BrowserSession {
  private proc?: ChildProcess;
  private ws?: WebSocket;
  private sessionId?: string;
  private tmpdir?: string;
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private consoleErrors: string[] = [];

  constructor(private readonly deps: BrowserDeps) {}

  private async start(): Promise<void> {
    if (this.ws) return;
    const exe = await findBrowser(this.deps);
    if (!exe) throw new Error('No Chromium-family browser found. Install one (e.g. `sudo apt install chromium`) or set MUSABAI_BROWSER.');
    // Some environments only start Chromium with --no-sandbox; try the safer launch first, then fall back once.
    try {
      let wsUrl: string;
      try {
        wsUrl = await this.launch(exe, Boolean(this.deps.noSandbox));
      } catch (error) {
        if (this.deps.noSandbox) throw error;
        wsUrl = await this.launch(exe, true);
      }
      await this.connect(wsUrl);
    } catch (error) {
      // Leave nothing half-started behind: the next action tries a clean launch.
      await this.close();
      throw error;
    }
  }

  private async launch(exe: string, noSandbox: boolean): Promise<string> {
    await this.close();
    this.tmpdir = await mkdtemp(path.join(os.tmpdir(), 'musabai-browser-'));
    const args = [
      this.deps.headless === false ? '--new-window' : '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${this.tmpdir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-background-networking',
      ...(noSandbox ? ['--no-sandbox'] : []),
      'about:blank',
    ];
    const proc = spawn(exe, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    this.proc = proc;
    // The browser closing later (the user closes the window, or it crashes) ends this session; the next action starts a new one.
    proc.on('exit', () => {
      if (this.proc === proc) this.reset(new Error('the browser was closed'));
    });
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('the browser did not expose a DevTools endpoint in time')), 30000);
      let buffer = '';
      proc.stderr?.on('data', (chunk) => {
        buffer += chunk;
        const match = /ws:\/\/\S+/.exec(buffer);
        if (match) {
          clearTimeout(timer);
          resolve(match[0]);
        }
      });
      // A missing or broken executable (e.g. a wrong MUSABAI_BROWSER) fails the launch instead of crashing the process.
      proc.on('error', (error) => {
        clearTimeout(timer);
        reject(new Error(`could not start the browser ${exe}: ${error.message}`));
      });
      proc.on('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`the browser exited before it was ready (code ${code ?? 'unknown'})`));
      });
    });
  }

  /** Forgets the connection (after the browser went away) so the next action launches it again. */
  private reset(error: Error): void {
    for (const { reject } of this.pending.values()) reject(error);
    this.pending.clear();
    this.ws = undefined;
    this.sessionId = undefined;
  }

  private async connect(wsUrl: string): Promise<void> {
    const ws = new WebSocket(wsUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
    this.ws = ws;
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', (e) => reject(e as Error));
    });
    ws.on('error', () => undefined);
    ws.on('close', () => {
      if (this.ws === ws) this.reset(new Error('the connection to the browser closed'));
    });
    ws.on('message', (raw) => this.onMessage(String(raw)));
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank' }, undefined);
    const attached = new Promise<string>((resolve) => {
      const handler = (raw: WebSocket.RawData) => {
        const msg = JSON.parse(String(raw));
        if (msg.method === 'Target.attachedToTarget') {
          ws.off('message', handler);
          resolve(msg.params.sessionId);
        }
      };
      ws.on('message', handler);
    });
    await this.send('Target.attachToTarget', { targetId, flatten: true }, undefined);
    this.sessionId = await attached;
    await this.send('Page.enable');
    await this.send('Runtime.enable');
  }

  private onMessage(raw: string): void {
    const msg = JSON.parse(raw);
    if (msg.id && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id)!;
      this.pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
      const text = (msg.params.args ?? []).map((a: any) => a.value ?? a.description ?? '').join(' ').trim();
      if (text) this.consoleErrors.push(text.slice(0, 300));
      if (this.consoleErrors.length > 50) this.consoleErrors.shift();
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const text = msg.params?.exceptionDetails?.exception?.description ?? msg.params?.exceptionDetails?.text;
      if (text) this.consoleErrors.push(String(text).slice(0, 300));
    }
  }

  private send(method: string, params: Record<string, unknown> = {}, sessionId = this.sessionId): Promise<any> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      if (ws) this.reset(new Error('the connection to the browser closed'));
      return Promise.reject(new Error('the browser is not running (it was closed); the next open starts it again'));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`browser command ${method} timed out`));
      }, 30000);
      this.pending.set(id, { resolve: (v) => (clearTimeout(timer), resolve(v)), reject: (e) => (clearTimeout(timer), reject(e)) });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }

  private evaluate(expression: string): Promise<any> {
    return this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }).then((r) => {
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'evaluation failed');
      return r.result?.value;
    });
  }

  async open(url: string): Promise<PageState> {
    if (!/^https?:\/\//i.test(url)) throw new Error('Only http(s) URLs can be opened.');
    await this.start();
    this.consoleErrors = [];
    // Listen before navigating: a fast page can fire its load event right behind the navigate reply.
    const loaded = this.waitFor('Page.loadEventFired');
    await this.send('Page.navigate', { url });
    // Wait for the load event, but never hang: settle after a short grace period either way.
    await within(loaded, 15000);
    await delay(400);
    return this.state();
  }

  /** Resolves on the event, or as soon as the connection closes (a browser that went away sends nothing more). */
  private waitFor(method: string): Promise<void> {
    const ws = this.ws!;
    return new Promise((resolve) => {
      const done = () => {
        ws.off('message', handler);
        ws.off('close', done);
        resolve();
      };
      const handler = (raw: WebSocket.RawData) => {
        if (JSON.parse(String(raw)).method === method) done();
      };
      ws.on('message', handler);
      ws.once('close', done);
    });
  }

  async state(): Promise<PageState> {
    const info = await this.evaluate('JSON.stringify({u:location.href,t:document.title,x:(document.body?document.body.innerText:"").slice(0,8000)})');
    const parsed = JSON.parse(info || '{}');
    return { url: parsed.u ?? '', title: parsed.t ?? '', text: parsed.x ?? '', consoleErrors: [...this.consoleErrors] };
  }

  async screenshot(): Promise<string> {
    await this.start();
    const result = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    return `data:image/png;base64,${result.data}`;
  }

  /** Clicks by CSS selector, or, when `target` is plain text, the first button/link/input whose text or value matches. */
  async click(target: string): Promise<boolean> {
    await this.start();
    const json = JSON.stringify(target);
    const expr = `(() => {
      const q = ${json};
      let el = null;
      try { el = document.querySelector(q); } catch {}
      if (!el) {
        const cands = [...document.querySelectorAll('button,a,[role=button],input[type=submit],input[type=button],summary,[onclick]')];
        el = cands.find((e) => (e.innerText || e.value || e.getAttribute('aria-label') || '').trim().toLowerCase().includes(q.toLowerCase()));
      }
      if (!el) return false;
      el.scrollIntoView({ block: 'center' });
      el.click();
      return true;
    })()`;
    return Boolean(await this.evaluate(expr));
  }

  /** Types into the element at `selector` (or the focused element). Set `submit` to press Enter after. */
  async type(selector: string | undefined, text: string, submit = false): Promise<boolean> {
    await this.start();
    const expr = `(() => {
      const el = ${selector ? `document.querySelector(${JSON.stringify(selector)})` : 'document.activeElement'};
      if (!el) return false;
      el.focus();
      const setter = Object.getOwnPropertyDescriptor(el.__proto__, 'value')?.set;
      if (setter) setter.call(el, ${JSON.stringify(text)}); else el.value = ${JSON.stringify(text)};
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`;
    const ok = Boolean(await this.evaluate(expr));
    if (ok && submit) await this.press('Enter');
    return ok;
  }

  async press(key: string): Promise<void> {
    await this.start();
    const map: Record<string, { code: string; key: string; text?: string }> = {
      Enter: { code: 'Enter', key: 'Enter', text: '\r' },
      Tab: { code: 'Tab', key: 'Tab' },
      Escape: { code: 'Escape', key: 'Escape' },
      ArrowDown: { code: 'ArrowDown', key: 'ArrowDown' },
      ArrowUp: { code: 'ArrowUp', key: 'ArrowUp' },
      Backspace: { code: 'Backspace', key: 'Backspace' },
    };
    const k = map[key] ?? { code: key, key };
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k.key, code: k.code, text: k.text });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k.key, code: k.code });
  }

  async close(): Promise<void> {
    for (const { reject } of this.pending.values()) reject(new Error('the browser was closed'));
    this.pending.clear();
    try {
      this.ws?.close();
    } catch {
      // ignore
    }
    this.ws = undefined;
    this.sessionId = undefined;
    const proc = this.proc;
    this.proc = undefined;
    // proc.killed only says a signal was sent; whether the browser is gone is exitCode/signalCode.
    const running = () => Boolean(proc?.pid) && proc!.exitCode === null && proc!.signalCode === null;
    if (proc && running()) {
      const exited = new Promise<void>((resolve) => proc.once('exit', () => resolve()));
      proc.kill('SIGTERM');
      await within(exited, 1500);
      if (running()) {
        proc.kill('SIGKILL');
        await within(exited, 1000);
      }
    }
    if (this.tmpdir) {
      for (let i = 0; i < 3; i++) {
        try {
          await rm(this.tmpdir, { recursive: true, force: true });
          break;
        } catch {
          await delay(300);
        }
      }
      this.tmpdir = undefined;
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Waits for `promise`, or `ms` at most. The timer is cleared either way, so a settled wait never holds the process open. */
async function within<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([promise, new Promise<undefined>((resolve) => (timer = setTimeout(() => resolve(undefined), ms)))]);
  } finally {
    clearTimeout(timer);
  }
}
