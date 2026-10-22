import { randomBytes } from 'node:crypto';
import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import type * as vscode from 'vscode';
import { WebSocket, WebSocketServer } from 'ws';
import type { ChatController } from './chatController';
import { PHONE_PAGE } from './phonePage';
import { qrSvg } from './qr';
import type { Services } from './services';

export interface PhoneInfo {
  url: string;
  token: string;
  port: number;
}

/** A LAN IPv4 the phone can reach, preferring home-network ranges over VPN/container addresses. */
function lanAddress(): string {
  const found: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list ?? []) if (net.family === 'IPv4' && !net.internal) found.push(net.address);
  }
  return found.find((a) => a.startsWith('192.168.')) ?? found.find((a) => a.startsWith('10.')) ?? found.find((a) => /^172\.(1[6-9]|2\d|3[01])\./.test(a)) ?? found[0] ?? '127.0.0.1';
}

/** A local web server that lets a phone on the same Wi-Fi view the chat and send prompts, gated by a token. */
export class PhoneServer implements vscode.Disposable {
  private server?: Server;
  private wss?: WebSocketServer;
  private token = '';
  private address = '';
  private port = 0;
  private readonly sockets = new Set<WebSocket>();

  constructor(
    private readonly chat: ChatController,
    private readonly services: Services,
  ) {}

  get running(): boolean {
    return Boolean(this.server);
  }

  get info(): PhoneInfo | undefined {
    if (!this.server) return undefined;
    return { url: `http://${this.address}:${this.port}/?t=${this.token}`, token: this.token, port: this.port };
  }

  async start(port = 0): Promise<PhoneInfo> {
    if (this.server) return this.info!;
    this.token = randomBytes(16).toString('hex');
    const server = createServer((req, res) => this.handleHttp(req, res));
    const wss = new WebSocketServer({ noServer: true });
    server.on('upgrade', (req, socket, head) => {
      if (this.tokenOf(req.url) !== this.token) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
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
      server.listen(configured, '0.0.0.0', () => {
        server.removeListener('error', onError);
        resolve();
      });
    });
    this.server = server;
    this.wss = wss;
    this.port = (server.address() as AddressInfo).port;
    this.address = lanAddress();
    this.services.log.info(`phone link listening on ${this.info?.url}`);
    return this.info!;
  }

  async stop(): Promise<void> {
    for (const ws of this.sockets) ws.terminate();
    this.sockets.clear();
    this.wss?.close();
    this.wss = undefined;
    const server = this.server;
    this.server = undefined;
    if (!server) return;
    // Force-drop keep-alive HTTP and WebSocket connections so the port frees immediately.
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private tokenOf(url: string | undefined): string | null {
    try {
      return new URL(url ?? '/', 'http://localhost').searchParams.get('t');
    } catch {
      return null;
    }
  }

  private handleHttp(req: IncomingMessage, res: ServerResponse): void {
    if (this.tokenOf(req.url) !== this.token) {
      res.writeHead(403, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;background:#181818;color:#eee;text-align:center;padding:3rem">رابط غير صالح أو منتهي.</body>');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(PHONE_PAGE);
  }

  private onConnection(ws: WebSocket): void {
    this.sockets.add(ws);
    const sub = this.chat.onDidPost((message) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
    });
    void this.chat.snapshot().then((init) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(init));
    });
    const close = () => {
      sub.dispose();
      this.sockets.delete(ws);
    };
    ws.on('message', (raw: unknown) => this.onMessage(String(raw)));
    ws.on('close', close);
    ws.on('error', close);
  }

  private onMessage(raw: string): void {
    let data: { type?: string; text?: string };
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    if (data.type === 'send' && typeof data.text === 'string') {
      void this.chat.sendExternal(data.text).catch((e: Error) => this.services.log.error(`phone send: ${e.message}`));
    } else if (data.type === 'stop') {
      this.chat.stop();
    }
  }

  /** The HTML for the pairing panel shown in the editor: a QR of the URL plus the plain link. */
  pairingHtml(info: PhoneInfo): string {
    const svg = qrSvg(info.url, { scale: 7 });
    const link = info.url.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:var(--vscode-font-family),sans-serif;color:var(--vscode-foreground);text-align:center;padding:24px;line-height:1.7}
.qr{background:#fff;display:inline-block;padding:14px;border-radius:12px;margin:12px 0}.qr svg{display:block;width:240px;height:240px}
.url{direction:ltr;unicode-bidi:plaintext;background:var(--vscode-textCodeBlock-background,#1b1b1b);padding:8px 12px;border-radius:8px;display:inline-block;word-break:break-all;font-family:var(--vscode-editor-font-family),monospace;font-size:12px;margin-top:8px}
h2{margin:0 0 4px}.muted{opacity:.7;font-size:13px}</style></head>
<body>
<h2>📱 اربط موبايلك</h2>
<p class="muted">امسح الرمز بكاميرا الموبايل — لازم الموبايل على نفس شبكة الواي فاي.</p>
<div class="qr">${svg}</div>
<p class="muted">أو افتح هذا الرابط في متصفح الموبايل:</p>
<div class="url">${link}</div>
<p class="muted">يبقى الرابط يعمل حتى توقف الربط من لوحة الأوامر: «MusabAI: Stop Phone Link».</p>
</body></html>`;
  }

  dispose(): void {
    void this.stop();
  }
}
