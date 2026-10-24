import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import WebSocket from 'ws';
import { PhoneServer, defaultRouteInterface, pickLanAddress } from '../../src/vscode/phoneServer';
import { pairingPage, phonePage } from '../../src/vscode/phonePage';
import { qrSvg } from '../../src/vscode/qr';

function fakeChat() {
  const listeners = new Set<(m: unknown) => void>();
  return {
    sent: [] as string[],
    answers: [] as [string, string][],
    stopped: 0,
    busy: false,
    onDidPost(cb: (m: unknown) => void) {
      listeners.add(cb);
      return { dispose: () => listeners.delete(cb) };
    },
    async snapshot() {
      return { type: 'init', state: {}, chats: [], chat: { id: 'c1', title: 'T', messages: [] }, changes: [] };
    },
    async sendExternal(text: string) {
      if (this.busy) return 'busy';
      this.sent.push(text);
      return 'started';
    },
    answerExternal(id: string, answer: string) {
      this.answers.push([id, answer]);
    },
    stop() {
      this.stopped++;
    },
    fire(message: unknown) {
      for (const cb of listeners) cb(message);
    },
  };
}
const logged: string[] = [];
const fakeServices = { log: { info: (l: string) => logged.push(l), error() {} } } as never;

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
function open(url: string, headers: Record<string, string> = {}): Promise<Opened> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers });
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

/** Pairs like a phone scanning the QR code: the one-time link gives this phone its session cookie. */
async function pair(base: string, token: string): Promise<string> {
  const page = await fetch(`http://${base}/?t=${token}`);
  assert.equal(page.status, 200);
  const cookie = (page.headers.get('set-cookie') ?? '').split(';')[0];
  assert.match(cookie, /^musabai_phone=[0-9a-f]{48}$/);
  return cookie;
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
  it('pairs one phone with a one-time code, then streams the chat to its session only', async () => {
    const chat = fakeChat();
    const server = new PhoneServer(chat as never, fakeServices);
    running = server;
    const info = await server.start(0, '127.0.0.1');
    const base = `127.0.0.1:${info.port}`;
    assert.ok(logged.every((l) => !l.includes(info.token)), 'the pairing code is never logged');

    // The page is gated: nothing without the code.
    assert.equal((await fetch(`http://${base}/`)).status, 403);
    const page = await fetch(`http://${base}/?t=${info.token}`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy') ?? '', /script-src 'nonce-/);
    assert.match(await page.text(), /MusabAI/);
    const cookie = (page.headers.get('set-cookie') ?? '').split(';')[0];
    assert.match(page.headers.get('set-cookie') ?? '', /HttpOnly; SameSite=Strict/);

    // The code works once: someone else replaying the link is refused; the paired phone can reload.
    assert.equal((await fetch(`http://${base}/?t=${info.token}`)).status, 403);
    assert.equal((await fetch(`http://${base}/`, { headers: { cookie } })).status, 200);
    assert.equal((await fetch(`http://${base}/session`, { headers: { cookie } })).status, 204);
    assert.equal((await fetch(`http://${base}/session`)).status, 401);

    // A WebSocket needs the session, from the page's own origin.
    await assert.rejects(open(`ws://${base}/ws`));
    await assert.rejects(open(`ws://${base}/ws`, { cookie, origin: 'http://evil.example' }));
    const conn = await open(`ws://${base}/ws`, { cookie, origin: `http://${base}` });
    client = conn.ws;
    const init = await conn.next();
    assert.equal(init.type, 'init');
    assert.equal(init.chat.id, 'c1');

    // Only what the phone shows is forwarded: not mention results or attachments meant for the editor view.
    chat.fire({ type: 'mentionResults', query: 'x', items: [] });
    chat.fire({ type: 'chatEvent', chatId: 'c1', event: { type: 'user', message: { id: 'm1', role: 'user', text: 'hi' } } });
    const forwarded = await conn.next();
    assert.equal(forwarded.type, 'chatEvent');
    assert.equal(forwarded.event.type, 'user');

    // A prompt, an approval and a stop from the phone reach the chat; "always" is not accepted from the phone.
    conn.ws.send(JSON.stringify({ type: 'send', text: 'build it' }));
    conn.ws.send(JSON.stringify({ type: 'approval', id: 'a1', answer: 'allow' }));
    conn.ws.send(JSON.stringify({ type: 'approval', id: 'a2', answer: 'always' }));
    conn.ws.send(JSON.stringify({ type: 'stop' }));
    await new Promise((r) => setTimeout(r, 150));
    assert.deepEqual(chat.sent, ['build it']);
    assert.deepEqual(chat.answers, [['a1', 'allow']]);
    assert.equal(chat.stopped, 1);

    // While the chat works, a prompt is not lost: the phone gets it back with a notice.
    chat.busy = true;
    conn.ws.send(JSON.stringify({ type: 'send', text: 'and the tests' }));
    const notice = await conn.next();
    assert.equal(notice.type, 'notice');
    assert.equal(notice.restore, 'and the tests');
  });

  it('starts once when asked twice at the same moment, and a new start issues a new code', async () => {
    const server = new PhoneServer(fakeChat() as never, fakeServices);
    running = server;
    const [a, b] = await Promise.all([server.start(0, '127.0.0.1'), server.start(0, '127.0.0.1')]);
    assert.equal(a.port, b.port);
    const again = await server.start(0, '127.0.0.1');
    assert.equal(again.port, a.port);
    assert.notEqual(again.token, a.token);
    const base = `127.0.0.1:${a.port}`;
    assert.equal((await fetch(`http://${base}/?t=${a.token}`)).status, 403, 'the old code no longer pairs');
    await pair(base, again.token);
  });

  it('stops by itself when no phone is connected for a while', async () => {
    let stoppedAfter: number | undefined;
    const server = new PhoneServer(fakeChat() as never, fakeServices, { idleMinutes: 0.002, onIdleStop: (m) => (stoppedAfter = m) });
    running = server;
    const info = await server.start(0, '127.0.0.1');
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(server.running, false);
    assert.equal(stoppedAfter, 0.002);
    await assert.rejects(fetch(`http://127.0.0.1:${info.port}/?t=${info.token}`));
  });

  it('stays up while a phone is connected', async () => {
    const server = new PhoneServer(fakeChat() as never, fakeServices, { idleMinutes: 0.01 });
    running = server;
    const info = await server.start(0, '127.0.0.1');
    const base = `127.0.0.1:${info.port}`;
    const cookie = await pair(base, info.token);
    const conn = await open(`ws://${base}/ws`, { cookie });
    client = conn.ws;
    await new Promise((r) => setTimeout(r, 900));
    assert.equal(server.running, true);
  });

  it('stops cleanly and frees the port', async () => {
    const server = new PhoneServer(fakeChat() as never, fakeServices);
    const info = await server.start(0, '127.0.0.1');
    assert.equal(server.running, true);
    await server.stop();
    assert.equal(server.running, false);
    await assert.rejects(fetch(`http://127.0.0.1:${info.port}/?t=${info.token}`));
  });
});

describe('phone link address and pages', () => {
  const net = (address: string) => ({ address, family: 'IPv4' as const, internal: false, netmask: '255.255.255.0', mac: '00:00:00:00:00:00', cidr: `${address}/24` });

  it('picks the Wi-Fi address over container, VM and VPN interfaces', () => {
    const interfaces = { lo: [{ ...net('127.0.0.1'), internal: true }], docker0: [net('172.17.0.1')], virbr0: [net('192.168.122.1')], tun0: [net('10.8.0.2')], wlp2s0: [net('100.72.14.9')] };
    assert.equal(pickLanAddress(interfaces), '100.72.14.9');
    assert.equal(pickLanAddress({ ...interfaces, enp3s0: [net('10.1.2.3')] }, 'enp3s0'), '10.1.2.3', 'the default route wins');
    assert.equal(pickLanAddress({ docker0: [net('172.17.0.1')] }), '172.17.0.1', 'a virtual interface only when nothing else');
    assert.equal(pickLanAddress({}), '127.0.0.1');
  });

  it('reads the default-route interface from /proc/net/route', () => {
    const table = 'Iface\tDestination\tGateway \tFlags\tRefCnt\tUse\tMetric\tMask\nvirbr0\t007AA8C0\t00000000\t0001\t0\t0\t0\t00FFFFFF\nwlp2s0\t00000000\t0101A8C0\t0003\t0\t0\t600\t00000000\n';
    assert.equal(defaultRouteInterface(table), 'wlp2s0');
    assert.equal(defaultRouteInterface('Iface\tDestination\n'), undefined);
  });

  it('serves the page and the pairing panel in the editor language', () => {
    const ar = phonePage('ar', 'n0nce', 'console.log(1)</script>');
    assert.match(ar, /<html lang="ar" dir="rtl">/);
    assert.match(ar, /إرسال/);
    assert.match(ar, /<script nonce="n0nce">console.log\(1\)<\\\/script><\/script>/, 'a script cannot end the tag early');
    assert.match(phonePage('en', 'n', ''), /dir="ltr"[\s\S]*Send/);
    const panel = pairingPage('en', 'http://10.0.0.2:5000/?t=abc&x=<1>', '<svg/>', 10, 15);
    assert.match(panel, /Link your phone/);
    assert.match(panel, /works once, for one phone, within 10 minutes/);
    assert.ok(panel.includes('t=abc&amp;x=&lt;1&gt;'));
    assert.match(pairingPage('ar', 'u', '<svg/>', 10, 15), /اربط موبايلك/);
  });
});
