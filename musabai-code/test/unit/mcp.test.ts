import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { McpClient } from '../../src/core/mcp/client';
import { McpManager, parseMcpConfig } from '../../src/core/mcp/manager';
import { mcpTool, toolsForMode, BUILTIN_MODES } from '../../src/core/tools';
import { type MockServer, mockServer, tempDir } from './helpers';

const FAKE_SERVER = `
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
const reply = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\\n');
process.stdout.write('a log line that is not JSON\\n');
console.error('fake server ready');
let pinged = false;
rl.on('line', (line) => {
  const msg = JSON.parse(line);
  if (msg.method === 'initialize') reply(msg.id, { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'fake', version: '1.0' } });
  else if (msg.method === 'notifications/initialized' && !pinged) {
    pinged = true;
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 'srv-1', method: 'roots/list' }) + '\\n');
  }
  else if (msg.id === 'srv-1') process.env.ROOTS = JSON.stringify(msg.result);
  else if (msg.method === 'tools/list') {
    if (msg.params && msg.params.cursor) reply(msg.id, { tools: [{ name: 'roots', description: 'Roots the client reported', inputSchema: { type: 'object' } }] });
    else reply(msg.id, { tools: [{ name: 'echo', description: 'Echo text', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] }, annotations: { readOnlyHint: true } }], nextCursor: 'p2' });
  }
  else if (msg.method === 'tools/call') {
    if (msg.params.name === 'echo') reply(msg.id, { content: [{ type: 'text', text: 'echo: ' + msg.params.arguments.text + ' ' + (process.env.GREETING || '') }] });
    else if (msg.params.name === 'roots') reply(msg.id, { content: [{ type: 'text', text: process.env.ROOTS || 'none' }, { type: 'image', data: 'AAA=', mimeType: 'image/png' }] });
    else reply(msg.id, { content: [{ type: 'text', text: 'boom' }], isError: true });
  }
});
`;

const servers: MockServer[] = [];
after(async () => Promise.all(servers.map((s) => s.close())));

describe('MCP', () => {
  it('parses Cursor and VS Code config formats with interpolation', () => {
    process.env.MUSABAI_TEST_TOKEN = 'tok123';
    const cursor = parseMcpConfig(
      JSON.stringify({ mcpServers: { files: { command: 'npx', args: ['-y', 'srv', '${workspaceFolder}'] }, remote: { url: 'https://x.dev/mcp', headers: { Authorization: 'Bearer ${env:MUSABAI_TEST_TOKEN}' } }, bad: { args: [] } } }),
      '/w',
      'project',
      '/w/.cursor/mcp.json',
    );
    assert.deepEqual(cursor.map((s) => [s.name, s.type]), [['files', 'stdio'], ['remote', 'http']]);
    assert.deepEqual(cursor[0].args, ['-y', 'srv', '/w']);
    assert.equal(cursor[1].headers?.Authorization, 'Bearer tok123');
    const vscode = parseMcpConfig(JSON.stringify({ servers: { legacy: { type: 'sse', url: 'http://localhost:1/sse' } } }), '/w', 'project', '/w/.vscode/mcp.json');
    assert.equal(vscode[0].type, 'sse');
  });

  it('talks to a stdio server: initialize, roots, paginated tools, calls and errors', async () => {
    const { dir, cleanup } = await tempDir();
    try {
      const script = path.join(dir, 'server.js');
      await writeFile(script, FAKE_SERVER);
      const client = new McpClient({ name: 'fake', type: 'stdio', command: process.execPath, args: [script], env: { GREETING: 'hello' }, source: 'project', configFile: '' }, { root: dir });
      await client.start();
      assert.equal(client.state, 'ready');
      assert.deepEqual(client.tools.map((t) => t.name), ['echo', 'roots']);
      assert.equal((await client.callTool('echo', { text: 'hi' })).text, 'echo: hi hello');
      const roots = await client.callTool('roots', {});
      assert.match(roots.text, new RegExp(`file://${dir.replace(/[/.]/g, '\\$&')}`));
      assert.deepEqual(roots.images, ['data:image/png;base64,AAA=']);
      assert.equal((await client.callTool('missing', {})).isError, true);
      await client.stop();
    } finally {
      await cleanup();
    }
  });

  it('reports a missing command clearly', async () => {
    const client = new McpClient({ name: 'x', type: 'stdio', command: 'definitely-not-a-command-xyz', source: 'global', configFile: '' }, { root: '/' });
    await assert.rejects(client.start(), /command not found/);
    assert.equal(client.state, 'error');
  });

  it('talks to a Streamable HTTP server with a session id and SSE responses', async () => {
    let session = '';
    const server = await mockServer({
      'POST /mcp': (req, res) => {
        const msg = req.body;
        if (msg.method === 'initialize') {
          res.writeHead(200, { 'content-type': 'application/json', 'mcp-session-id': 'sess-42' });
          res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2025-06-18', capabilities: {} } }));
          return;
        }
        session = String(req.headers['mcp-session-id'] || '');
        if (!msg.id) {
          res.writeHead(202);
          res.end();
          return;
        }
        if (msg.method === 'tools/list') {
          res.writeHead(200, { 'content-type': 'text/event-stream' });
          res.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { tools: [{ name: 'search', inputSchema: { type: 'object' } }] } })}\n\n`);
          res.end();
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: `found ${msg.params.arguments.q}` }] } }));
      },
    });
    servers.push(server);
    const client = new McpClient({ name: 'remote', type: 'http', url: `${server.url}/mcp`, source: 'global', configFile: '' }, { root: '/' });
    await client.start();
    assert.deepEqual(client.tools.map((t) => t.name), ['search']);
    assert.equal((await client.callTool('search', { q: 'docs' })).text, 'found docs');
    assert.equal(session, 'sess-42');
    assert.equal(server.requests.at(-1)!.headers['mcp-protocol-version'], '2025-06-18');
  });

  it('gates project servers on trust and exposes ready tools to the agent', async () => {
    const { dir, cleanup } = await tempDir();
    try {
      await mkdir(path.join(dir, '.cursor'), { recursive: true });
      const script = path.join(dir, 'server.js');
      await writeFile(script, FAKE_SERVER);
      await writeFile(path.join(dir, '.cursor', 'mcp.json'), JSON.stringify({ mcpServers: { fake: { command: process.execPath, args: [script] } } }));
      let asked = 0;
      const denied = new McpManager({ root: dir, home: dir, trustProjectServer: async () => (asked++, false) });
      await denied.startAll();
      assert.equal(asked, 1);
      assert.equal(denied.status()[0].state, 'not_trusted');
      assert.deepEqual(denied.tools(), []);

      const manager = new McpManager({ root: dir, home: dir, trustProjectServer: async () => true });
      await manager.startAll();
      const refs = manager.tools();
      assert.deepEqual(refs.map((r) => r.name), ['echo', 'roots']);
      const tool = mcpTool(refs[0]);
      assert.equal(tool.name, 'mcp_fake_echo');
      assert.equal(tool.readOnly, true);
      const ask = toolsForMode(BUILTIN_MODES.find((m) => m.id === 'ask')!, refs).map((t) => t.name);
      assert.ok(ask.includes('mcp_fake_echo') && !ask.includes('mcp_fake_roots'));
      assert.equal((await manager.call('fake', 'echo', { text: 'x' })).text, 'echo: x ');
      await manager.stopAll();
    } finally {
      await cleanup();
    }
  });

  it("sends nothing to a project's remote server (or the secrets in its headers) until it is trusted", async () => {
    const server = await mockServer({
      'POST /mcp': (req, res) => {
        const msg = req.body;
        if (!msg.id) {
          res.writeHead(202);
          res.end();
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: msg.method === 'initialize' ? { protocolVersion: '2025-06-18', capabilities: {} } : { tools: [] } }));
      },
    });
    servers.push(server);
    const { dir, cleanup } = await tempDir();
    try {
      process.env.MUSABAI_TEST_SECRET = 'secret-1';
      await mkdir(path.join(dir, '.cursor'), { recursive: true });
      const config = { mcpServers: { remote: { url: `${server.url}/mcp`, headers: { Authorization: 'Bearer ${env:MUSABAI_TEST_SECRET}' } } } };
      await writeFile(path.join(dir, '.cursor', 'mcp.json'), JSON.stringify(config));
      const asked: string[] = [];
      const denied = new McpManager({ root: dir, home: dir, trustProjectServer: async (c) => (asked.push(c.url ?? ''), false) });
      await denied.startAll();
      assert.deepEqual(asked, [`${server.url}/mcp`]);
      assert.equal(server.requests.length, 0);
      assert.equal(denied.status()[0].state, 'not_trusted');

      const trusted = new McpManager({ root: dir, home: dir, trustProjectServer: async () => true });
      await trusted.startAll();
      assert.equal(trusted.status()[0].state, 'ready');
      assert.equal(server.requests[0].headers.authorization, 'Bearer secret-1');
      await trusted.stopAll();
    } finally {
      await cleanup();
    }
  });
});
