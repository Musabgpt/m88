import assert from 'node:assert/strict';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { BrowserSession, findBrowser } from '../../src/core/browser';
import { browserTool } from '../../src/core/tools/browser';
import { type ApprovalRequest, type ApprovalResult, which } from '../../src/core/host';
import type { ToolContext } from '../../src/core/tools/types';
import { tempDir } from './helpers';

/** A stand-in for Chromium: prints a DevTools endpoint and answers the few CDP calls BrowserSession makes. */
const FAKE_BROWSER = `
const { WebSocketServer } = require(process.env.MUSABAI_FAKE_WS);
const fs = require('fs');
if (process.env.MUSABAI_FAKE_PIDFILE) fs.appendFileSync(process.env.MUSABAI_FAKE_PIDFILE, process.pid + '\\n');
if (process.env.MUSABAI_FAKE_IGNORE_TERM) process.on('SIGTERM', () => {});
const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' }, () => {
  process.stderr.write('DevTools listening on ws://127.0.0.1:' + wss.address().port + '/devtools/browser/fake\\n');
});
let url = 'about:blank';
wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    const msg = JSON.parse(String(raw));
    const reply = (result) => ws.send(JSON.stringify({ id: msg.id, result, sessionId: msg.sessionId }));
    if (msg.method === 'Target.createTarget') return reply({ targetId: 'T1' });
    if (msg.method === 'Target.attachToTarget') {
      ws.send(JSON.stringify({ method: 'Target.attachedToTarget', params: { sessionId: 'S1' } }));
      return reply({});
    }
    if (msg.method === 'Page.navigate') {
      url = msg.params.url;
      reply({});
      // The browser crashing while the page loads: no load event ever comes.
      if (url.includes('crash.test')) return void setTimeout(() => process.exit(1), 20);
      ws.send(JSON.stringify({ method: 'Page.loadEventFired', params: {}, sessionId: 'S1' }));
      // The user closing the browser window.
      if (url.includes('close.test')) setTimeout(() => process.exit(0), 50);
      return;
    }
    if (msg.method === 'Runtime.evaluate') return reply({ result: { value: JSON.stringify({ u: url, t: 'Fake page', x: 'fake body' }) } });
    if (msg.method === 'Page.captureScreenshot') return reply({ data: 'AAAA' });
    reply({});
  });
});
`;

async function fakeBrowser(dir: string): Promise<string> {
  const script = path.join(dir, 'fake-browser.js');
  const exe = path.join(dir, 'fake-browser');
  await writeFile(script, FAKE_BROWSER);
  await writeFile(exe, `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`);
  await chmod(exe, 0o755);
  return exe;
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function fakeCtx(answer: ApprovalResult) {
  const calls: ApprovalRequest[] = [];
  const session = {
    open: async (url: string) => ({ url, title: 'T', text: 'hello body', consoleErrors: ['oops'] }),
    state: async () => ({ url: 'u', title: 'T', text: 'clicked body', consoleErrors: [] }),
    screenshot: async () => 'data:image/png;base64,AAAA',
    click: async () => true,
    type: async () => true,
    press: async () => undefined,
    close: async () => undefined,
  };
  const ctx = {
    host: { browser: () => session },
    visionModel: true,
    approve: async (request: ApprovalRequest) => (calls.push(request), answer),
  } as unknown as ToolContext;
  return { ctx, calls };
}

const savedEnv = process.env.MUSABAI_BROWSER;
afterEach(() => {
  if (savedEnv === undefined) delete process.env.MUSABAI_BROWSER;
  else process.env.MUSABAI_BROWSER = savedEnv;
  delete process.env.MUSABAI_FAKE_WS;
  delete process.env.MUSABAI_FAKE_PIDFILE;
  delete process.env.MUSABAI_FAKE_IGNORE_TERM;
});

describe('browser discovery', () => {
  it('prefers the MUSABAI_BROWSER override', async () => {
    process.env.MUSABAI_BROWSER = '/custom/chrome';
    const found = await findBrowser({ which: async () => '/usr/bin/chromium' });
    assert.equal(found, '/custom/chrome');
  });

  it('finds the first installed Chromium-family browser', async () => {
    delete process.env.MUSABAI_BROWSER;
    const found = await findBrowser({ which: async (c) => (c === 'google-chrome' ? '/usr/bin/google-chrome' : undefined) });
    assert.equal(found, '/usr/bin/google-chrome');
  });

  it('returns undefined when no browser is installed', async () => {
    delete process.env.MUSABAI_BROWSER;
    assert.equal(await findBrowser({ which: async () => undefined }), undefined);
  });

  it('finds a browser installed outside PATH by its absolute path', async () => {
    delete process.env.MUSABAI_BROWSER;
    const found = await findBrowser({ which: async (c) => (c === '/opt/google/chrome/chrome' ? c : undefined) });
    assert.equal(found, '/opt/google/chrome/chrome');
  });
});

describe('browser session', () => {
  it('fails cleanly, without crashing the agent, when MUSABAI_BROWSER points nowhere', async () => {
    process.env.MUSABAI_BROWSER = '/nonexistent/chromium';
    const session = new BrowserSession({ which });
    await assert.rejects(session.open('http://example.test/'), /could not start the browser|exited before it was ready/);
    await assert.rejects(session.open('http://example.test/'), /could not start the browser|exited before it was ready/);
    await session.close();
  });

  it('starts the browser again after the user closes it, instead of failing every later action', async () => {
    const { dir, cleanup } = await tempDir();
    const session = new BrowserSession({ which, noSandbox: true });
    try {
      process.env.MUSABAI_BROWSER = await fakeBrowser(dir);
      process.env.MUSABAI_FAKE_WS = require.resolve('ws');
      process.env.MUSABAI_FAKE_PIDFILE = path.join(dir, 'pids');
      const first = await session.open('http://example.test/');
      assert.equal(first.title, 'Fake page');
      // The window closes while the agent still holds the session.
      await assert.rejects(session.open('http://close.test/'));
      const again = await session.open('http://example.test/again');
      assert.equal(again.url, 'http://example.test/again');
      assert.equal((await readFile(path.join(dir, 'pids'), 'utf8')).trim().split('\n').length, 2, 'a new browser was started');
    } finally {
      await session.close();
      await cleanup();
    }
  });

  it('fails fast, instead of waiting for the load event, when the browser dies while a page loads', async () => {
    const { dir, cleanup } = await tempDir();
    const session = new BrowserSession({ which, noSandbox: true });
    try {
      process.env.MUSABAI_BROWSER = await fakeBrowser(dir);
      process.env.MUSABAI_FAKE_WS = require.resolve('ws');
      await session.open('http://example.test/');
      const started = Date.now();
      await assert.rejects(session.open('http://crash.test/'), /browser/);
      assert.ok(Date.now() - started < 5000, `gave up after ${Date.now() - started} ms`);
    } finally {
      await session.close();
      await cleanup();
    }
  });

  it('kills a browser that ignores SIGTERM when it closes', async () => {
    const { dir, cleanup } = await tempDir();
    const session = new BrowserSession({ which, noSandbox: true });
    try {
      process.env.MUSABAI_BROWSER = await fakeBrowser(dir);
      process.env.MUSABAI_FAKE_WS = require.resolve('ws');
      process.env.MUSABAI_FAKE_PIDFILE = path.join(dir, 'pids');
      process.env.MUSABAI_FAKE_IGNORE_TERM = '1';
      await session.open('http://example.test/');
      const pid = Number((await readFile(path.join(dir, 'pids'), 'utf8')).trim());
      assert.equal(alive(pid), true);
      const started = Date.now();
      await session.close();
      assert.ok(Date.now() - started < 5000);
      assert.equal(alive(pid), false, 'SIGKILL followed the ignored SIGTERM');
    } finally {
      await session.close();
      await cleanup();
    }
  });
});

describe('browser tool', () => {
  it('asks before opening a page and reports the page back', async () => {
    const { ctx, calls } = fakeCtx('allow');
    const result = await browserTool.execute({ action: 'open', url: 'http://localhost:3000' }, ctx);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].kind, 'browser');
    assert.ok(result.ok && result.content.includes('hello body'));
  });

  it('skips the action when the user denies it', async () => {
    const { ctx } = fakeCtx('deny');
    const result = await browserTool.execute({ action: 'click', target: 'Run' }, ctx);
    assert.equal(result.ok, false);
    assert.match(result.summary, /Skipped/);
  });

  it('does not ask for a read-only screenshot', async () => {
    const { ctx, calls } = fakeCtx('deny');
    const result = await browserTool.execute({ action: 'screenshot' }, ctx);
    assert.equal(calls.length, 0);
    assert.deepEqual(result.images, ['data:image/png;base64,AAAA']);
  });
});
