import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import WebSocket from 'ws';
import { PhoneServer } from '../../src/vscode/phoneServer';
import { qrSvg } from '../../src/vscode/qr';

function fakeChat() {
  const listeners = new Set<(m: unknown) => void>();
  return {
    sent: [] as string[],
    stopped: 0,
    onDidPost(cb: (m: unknown) => void) {
      listeners.add(cb);
      return { dispose: () => listeners.delete(cb) };
    },
    async snapshot() {
      return { type: 'init', state: {}, chats: [], chat: { id: 'c1', title: 'T', messages: [] }, changes: [] };
    },
    async sendExternal(text: string) {
      this.sent.push(text);
    },
    stop() {
      this.stopped++;
    },
    fire(message: unknown) {
      for (const cb of listeners) cb(message);
    },
  };
}
const fakeServices = { log: { info() {}, error() {} } } as never;

let running: PhoneServer | undefined;
let client: WebSocket | undefined;
afterEach(async () => {
  client?.terminate();
  client = undefined;
  await running?.stop();
  running = undefined;
});

interface Opened {
  ws: WebSocket;
  next(): Promise<any>;
}

// Attaches the message listener before 'open' so no early message (the init snapshot) is missed.
function open(url: string): Promise<Opened> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const queue: any[] = [];
    const waiters: ((m: any) => void)[] = [];
    ws.on('message', (d) => {
      const msg = JSON.parse(String(d));
      const w = waiters.shift();
      if (w) w(msg);
      else queue.push(msg);
    });
    const fail = (e: Error) => {
      ws.terminate();
      reject(e);
    };
    ws.once('open', () => resolve({ ws, next: () => (queue.length ? Promise.resolve(queue.shift()) : new Promise((r) => waiters.push(r))) }));
    ws.once('error', fail);
    ws.once('unexpected-response', () => fail(new Error('rejected')));
  });
}

describe('qr', () => {
  it('renders a QR as an SVG', () => {
    const svg = qrSvg('http://192.168.1.5:7000/?t=abc');
    assert.match(svg, /^<svg /);
    assert.match(svg, /<path d="M/);
    assert.ok(svg.includes('</svg>'));
  });
});

describe('phone server', () => {
  it('serves the page only with the right token, and streams the chat over WebSocket', async () => {
    const chat = fakeChat();
    const server = new PhoneServer(chat as never, fakeServices);
    running = server;
    const info = await server.start(0);
    const base = `127.0.0.1:${info.port}`;

    // The page is gated by the token.
    assert.equal((await fetch(`http://${base}/`)).status, 403);
    const page = await fetch(`http://${base}/?t=${info.token}`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /MusabAI/);

    // A phone with the token connects and gets the current chat first.
    const conn = await open(`ws://${base}/?t=${info.token}`);
    client = conn.ws;
    const init = await conn.next();
    assert.equal(init.type, 'init');
    assert.equal(init.chat.id, 'c1');

    // A host message is forwarded live to the phone.
    chat.fire({ type: 'chatEvent', chatId: 'c1', event: { type: 'user', message: { id: 'm1', role: 'user', text: 'hi' } } });
    const forwarded = await conn.next();
    assert.equal(forwarded.type, 'chatEvent');
    assert.equal(forwarded.event.type, 'user');

    // A prompt from the phone reaches the chat.
    conn.ws.send(JSON.stringify({ type: 'send', text: 'build it' }));
    await new Promise((r) => setTimeout(r, 100));
    assert.deepEqual(chat.sent, ['build it']);
  });

  it('rejects a WebSocket without the token', async () => {
    const server = new PhoneServer(fakeChat() as never, fakeServices);
    running = server;
    const info = await server.start(0);
    await assert.rejects(open(`ws://127.0.0.1:${info.port}/?t=wrong`));
  });

  it('stops cleanly and frees the port', async () => {
    const server = new PhoneServer(fakeChat() as never, fakeServices);
    const info = await server.start(0);
    assert.equal(server.running, true);
    await server.stop();
    assert.equal(server.running, false);
    await assert.rejects(fetch(`http://127.0.0.1:${info.port}/?t=${info.token}`));
  });
});
