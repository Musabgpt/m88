import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import type * as vscode from 'vscode';
import { WebSocket, WebSocketServer } from 'ws';
import type { HostMessage, HostToPhone, PhoneToHost } from '../webview/shared/protocol';
import type { ChatController } from './chatController';
import { type PhoneLang, pairingPage, phoneCsp, phonePage, phoneStrings } from './phonePage';
import { qrSvg } from './qr';
import type { Services } from './services';

export interface PhoneInfo {
  /** The one-time pairing link (also in the QR code). */
  url: string;
  token: string;
  port: number;
  address: string;
}

export interface PhoneServerOptions {
  /** The bundled page script (dist/webview/phone.js). */
  scriptPath?: string;
  lang?: () => PhoneLang;
  /** How long a pairing link works, and how long the link stays up without a phone connected. */
  pairMinutes?: number;
  idleMinutes?: number;
  onIdleStop?: (minutes: number) => void;
}

const COOKIE = 'musabai_phone';
// Bridges and tunnels of containers, VMs and VPNs: a phone on the Wi-Fi cannot reach their addresses.
const VIRTUAL = /^(docker|br-|virbr|veth|vmnet|vboxnet|lxc|lxd|cni|flannel|podman|kube|tun|tap|wg|tailscale|zt|utun|ham)/i;

/** The interface of the default route (Linux), which is normally the Wi-Fi or Ethernet the phone shares. */
export function defaultRouteInterface(table?: string): string | undefined {
  try {
    const text = table ?? readFileSync('/proc/net/route', 'utf8');
    for (const line of text.split('\n').slice(1)) {
      const [iface, destination, , flags] = line.trim().split(/\s+/);
      if (destination === '00000000' && Number.parseInt(flags, 16) & 1) return iface;
    }
  } catch {
    // not Linux
  }
  return undefined;
}

/**
 * The laptop's address on the network the phone is on: never a container, VM or VPN interface, preferring the
 * default-route interface, then Wi-Fi, then Ethernet (whatever its range: home 192.168.x, office 10.x, CGNAT 100.64.x).
 */
export function pickLanAddress(interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]>, defaultIface?: string): string {
  const found: { name: string; address: string }[] = [];
  for (const [name, list] of Object.entries(interfaces)) {
    for (const net of list ?? []) if (net.family === 'IPv4' && !net.internal) found.push({ name, address: net.address });
  }
  const real = found.filter((f) => !VIRTUAL.test(f.name));
  const pool = real.length ? real : found;
  const rank = (f: { name: string }) => (f.name === defaultIface ? 0 : /^wl/.test(f.name) ? 1 : /^(en|eth)/.test(f.name) ? 2 : 3);
  return [...pool].sort((a, b) => rank(a) - rank(b))[0]?.address ?? '127.0.0.1';
}

function sameSecret(a: string | undefined, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function cookieOf(req: IncomingMessage): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === COOKIE) return value.join('=');
  }
  return undefined;
}

/**
 * A local web server that lets a phone on the same Wi-Fi view the chat, send prompts, answer approvals and stop a
 * run. It listens on the Wi-Fi address only. The QR code holds a one-time pairing code that works for one phone
 * within a few minutes; that phone then gets its own session cookie. Nothing is logged with a secret in it, and
 * the link stops by itself when no phone has been connected for a while.
 */
export class PhoneServer implements vscode.Disposable {
  private server?: Server;
  private wss?: WebSocketServer;
  private starting?: Promise<PhoneInfo>;
  private pairing = '';
  private pairingUntil = 0;
  private readonly sessions = new Set<string>();
  private address = '';
  private port = 0;
  private readonly sockets = new Set<WebSocket>();
  private idleTimer?: NodeJS.Timeout;
  private script?: string;
  private readonly options: PhoneServerOptions;

  constructor(
    private readonly chat: ChatController,
    private readonly services: Services,
    options: PhoneServerOptions = {},
  ) {
    this.options = { pairMinutes: 10, idleMinutes: 15, ...options };
  }

  get running(): boolean {
    return Boolean(this.server);
  }

  get info(): PhoneInfo | undefined {
    if (!this.server) return undefined;
    return { url: `http://${this.address}:${this.port}/?t=${this.pairing}`, token: this.pairing, port: this.port, address: this.address };
  }

  /** Starts the link, or, when it already runs, issues a fresh one-time pairing code for another phone. Safe to call twice at once. */
  start(port = 0, bind?: string): Promise<PhoneInfo> {
    if (this.server) {
      this.newPairing();
      return Promise.resolve(this.info!);
    }
    this.starting ??= this.listen(port, bind).finally(() => (this.starting = undefined));
    return this.starting;
  }

  private newPairing(): void {
    this.pairing = randomBytes(16).toString('hex');
    this.pairingUntil = Date.now() + this.options.pairMinutes! * 60_000;
  }

  private async listen(port: number, bind?: string): Promise<PhoneInfo> {
    const address = bind ?? pickLanAddress(os.networkInterfaces(), defaultRouteInterface());
    const server = createServer((req, res) => void this.handleHttp(req, res));
    const wss = new WebSocketServer({ noServer: true, maxPayload: 1_000_000 });
    server.on('upgrade', (req, socket, head) => {
      const origin = req.headers.origin;
      const sameOrigin = !origin || origin === `http://${req.headers.host}`;
      if (new URL(req.url ?? '/', 'http://phone').pathname !== '/ws' || !sameOrigin || !this.validSession(cookieOf(req))) {
        socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    });
    wss.on('connection', (ws: WebSocket) => this.onConnection(ws));
    const configured = Math.max(0, Math.min(65535, Math.floor(port) || 0));
    await new Promise<void>((resolve, reject) => {
      const onError = (e: Error) => reject(e);
      server.once('error', onError);
      // Only the network the phone is on, not every interface of the laptop.
      server.listen(configured, address, () => {
        server.removeListener('error', onError);
        resolve();
      });
    });
    this.server = server;
    this.wss = wss;
    this.address = address;
    this.port = (server.address() as AddressInfo).port;
    this.newPairing();
    this.armIdleStop();
    this.services.log.info(`phone link listening on http://${this.address}:${this.port}/ (pairing code valid for ${this.options.pairMinutes} minutes)`);
    return this.info!;
  }

  async stop(): Promise<void> {
    await this.starting?.catch(() => undefined);
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
    for (const ws of this.sockets) ws.terminate();
    this.sockets.clear();
    this.sessions.clear();
    this.pairing = '';
    this.wss?.close();
    this.wss = undefined;
    const server = this.server;
    this.server = undefined;
    if (!server) return;
    // Force-drop keep-alive HTTP and WebSocket connections so the port frees immediately.
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  /** With no phone connected for idleMinutes, the link stops itself (and says so). */
  private armIdleStop(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
    if (this.sockets.size || !this.server) return;
    const minutes = this.options.idleMinutes!;
    this.idleTimer = setTimeout(() => {
      if (this.sockets.size) return;
      void this.stop().then(() => this.options.onIdleStop?.(minutes));
    }, minutes * 60_000);
    this.idleTimer.unref?.();
  }

  private validSession(token: string | undefined): boolean {
    return Boolean(token) && [...this.sessions].some((s) => sameSecret(token, s));
  }

  private lang(): PhoneLang {
    return this.options.lang?.() ?? 'en';
  }

  private async pageScript(): Promise<string> {
    if (this.script === undefined) {
      const code = this.options.scriptPath ? await readFile(this.options.scriptPath, 'utf8').catch(() => '') : '';
      // Inlined into the page, a development build's source-map comment would only point the phone at a missing file.
      this.script = code.replace(/^\/\/# sourceMappingURL=.*$/m, '');
    }
    return this.script;
  }

  private async handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://phone');
    const headers = { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY', 'x-content-type-options': 'nosniff' };
    let session = cookieOf(req);
    if (!this.validSession(session)) session = undefined;
    // The phone's page checks this when its connection drops, to tell "the link has ended" from "the Wi-Fi blinked".
    if (url.pathname === '/session') {
      res.writeHead(session ? 204 : 401, headers);
      res.end();
      return;
    }
    if (url.pathname !== '/' || req.method !== 'GET') {
      res.writeHead(404, headers);
      res.end();
      return;
    }
    const cookies: string[] = [];
    if (!session) {
      // The pairing code works once, for one phone, and only for a few minutes; that phone gets its own session.
      if (!this.pairing || Date.now() > this.pairingUntil || !sameSecret(url.searchParams.get('t') ?? undefined, this.pairing)) {
        res.writeHead(403, { ...headers, 'content-type': 'text/html; charset=utf-8' });
        res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body dir="auto" style="font-family:sans-serif;background:#181818;color:#eee;text-align:center;padding:3rem">${phoneStrings(this.lang()).invalid}</body>`);
        return;
      }
      this.pairing = '';
      session = randomBytes(24).toString('hex');
      this.sessions.add(session);
      cookies.push(`${COOKIE}=${session}; HttpOnly; SameSite=Strict; Path=/`);
    }
    const nonce = randomBytes(16).toString('base64');
    res.writeHead(200, { ...headers, 'content-type': 'text/html; charset=utf-8', 'content-security-policy': phoneCsp(nonce), ...(cookies.length ? { 'set-cookie': cookies } : {}) });
    res.end(phonePage(this.lang(), nonce, await this.pageScript()));
  }

  /** Only what the phone shows: the chat (init, a chat switch, chat events). Mentions, attachments and the like stay on the laptop. */
  private forwards(message: HostMessage): message is Extract<HostToPhone, { type: 'init' | 'chat' | 'chatEvent' }> {
    return message.type === 'init' || message.type === 'chat' || message.type === 'chatEvent';
  }

  private onConnection(ws: WebSocket): void {
    this.sockets.add(ws);
    this.armIdleStop();
    const send = (message: HostToPhone) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
    };
    const sub = this.chat.onDidPost((message) => {
      if (this.forwards(message)) send(message);
    });
    void this.chat.snapshot().then(send);
    const close = () => {
      sub.dispose();
      if (this.sockets.delete(ws)) this.armIdleStop();
    };
    ws.on('message', (raw: unknown) => void this.onMessage(String(raw), send));
    ws.on('close', close);
    ws.on('error', close);
  }

  private async onMessage(raw: string, reply: (message: HostToPhone) => void): Promise<void> {
    let data: PhoneToHost;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    if (data?.type === 'send' && typeof data.text === 'string') {
      const result = await this.chat.sendExternal(data.text.slice(0, 20_000)).catch((e: Error) => {
        this.services.log.error(`phone send: ${e.message}`);
        return 'error' as const;
      });
      // Busy: the phone gets its text back instead of losing it, and a hint that Stop is there.
      if (result === 'busy') reply({ type: 'notice', text: phoneStrings(this.lang()).busy, restore: data.text });
    } else if (data?.type === 'stop') {
      this.chat.stop();
    } else if (data?.type === 'approval' && typeof data.id === 'string' && (data.answer === 'allow' || data.answer === 'deny')) {
      this.chat.answerExternal(data.id, data.answer);
    }
  }

  /** The HTML for the pairing panel shown in the editor: a QR of the one-time link plus the plain link. */
  pairingHtml(info: PhoneInfo): string {
    return pairingPage(this.lang(), info.url, qrSvg(info.url, { scale: 7 }), this.options.pairMinutes!, this.options.idleMinutes!);
  }

  dispose(): void {
    void this.stop();
  }
}
