import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { findBrowser } from '../../src/core/browser';
import { browserTool } from '../../src/core/tools/browser';
import type { ApprovalRequest, ApprovalResult } from '../../src/core/host';
import type { ToolContext } from '../../src/core/tools/types';

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
