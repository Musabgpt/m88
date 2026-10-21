import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { AgentSession, type AgentDeps } from '../../src/core/agent/agent';
import { ChangeTracker } from '../../src/core/changes';
import { CheckpointStore } from '../../src/core/checkpoints';
import { type ApprovalRequest, NodeHost } from '../../src/core/host';
import type { CommandPolicy } from '../../src/core/policy';
import { ProviderPool } from '../../src/core/providers/pool';
import { BUILTIN_MODES } from '../../src/core/tools';
import type { AgentEvent } from '../../src/core/tools/types';
import { environmentProvider, rulesProvider } from '../../src/core/workspace';
import { type MockServer, mockServer, sse, tempDir, textChunks, toolCallChunks } from './helpers';

const servers: MockServer[] = [];
const cleanups: (() => Promise<void>)[] = [];
after(async () => {
  await Promise.all(servers.map((s) => s.close()));
  await Promise.all(cleanups.map((c) => c()));
});

async function setup(script: unknown[][], options: { policy?: CommandPolicy; backup?: unknown[][] } = {}) {
  const server = await mockServer({ 'POST /chat/completions': script.map((events) => (_req, res) => sse(res, events)) });
  servers.push(server);
  let backup: MockServer | undefined;
  if (options.backup) {
    backup = await mockServer({ 'POST /chat/completions': options.backup.map((events) => (_req, res) => sse(res, events)) });
    servers.push(backup);
  }
  const { dir, cleanup } = await tempDir();
  cleanups.push(cleanup);
  await writeFile(path.join(dir, 'hello.py'), 'print("hi")\n');
  await writeFile(path.join(dir, 'AGENTS.md'), 'Run python3 hello.py to test.');
  const host = new NodeHost({ root: dir });
  const events: AgentEvent[] = [];
  const approvals: ApprovalRequest[] = [];
  const changes = new ChangeTracker(host);
  const checkpoints = new CheckpointStore();
  const pool = new ProviderPool({
    resolveKey: async () => undefined,
    env: {},
    kiloBase: server.url,
    discoverKilo: false,
    discoverLocal: false,
    sleep: async () => undefined,
    customModels: () =>
      backup
        ? [{ id: 'custom/backup-free', name: 'Backup', provider: 'openai', baseUrl: backup.url, model: 'b', free: true, capabilities: ['text', 'tools', 'streaming', 'coding'], source: 'custom' }]
        : [],
  });
  const deps: AgentDeps = {
    pool,
    host,
    emit: (e) => events.push(e),
    policy: () => options.policy ?? { mode: 'ask', allow: [], deny: [] },
    approve: async (request) => {
      approvals.push(request);
      return 'allow';
    },
    environment: environmentProvider(dir, 'terminal'),
    rules: rulesProvider(dir, () => []),
    changes,
    checkpoints,
  };
  return { server, backup, dir, host, events, approvals, changes, checkpoints, pool, session: new AgentSession(deps) };
}

const agent = BUILTIN_MODES.find((m) => m.id === 'agent')!;
const plan = BUILTIN_MODES.find((m) => m.id === 'plan')!;

describe('agent loop', () => {
  it('reads, edits, runs an approved command and answers, with review and checkpoints', async () => {
    const t = await setup([
      toolCallChunks([
        { id: 'call_read_1', name: 'read_file', args: { path: 'hello.py' } },
        { id: 'call_list_1', name: 'list_dir', args: {} },
      ]),
      toolCallChunks([{ id: 'call_edit_1', name: 'edit_file', args: { path: 'hello.py', old_string: 'print("hi")', new_string: 'print("hello")' } }]),
      toolCallChunks([{ id: 'call_run_1', name: 'run_terminal_cmd', args: { command: 'python3 hello.py', explanation: 'Check the output' } }]),
      textChunks('Done: hello.py now prints hello.'),
    ]);
    const result = await t.session.run({ turnId: 't1', text: 'make it say hello', mode: agent, modelId: 'kilo-auto/free' });
    assert.equal(result.reason, 'completed');
    assert.equal(result.text, 'Done: hello.py now prints hello.');
    assert.equal(await readFile(path.join(t.dir, 'hello.py'), 'utf8'), 'print("hello")\n');

    assert.equal(t.approvals.length, 1);
    assert.equal((t.approvals[0] as { command: string }).command, 'python3 hello.py');

    const ends = t.events.filter((e): e is Extract<AgentEvent, { type: 'tool_end' }> => e.type === 'tool_end');
    assert.deepEqual(ends.map((e) => [e.name, e.ok]), [['read_file', true], ['list_dir', true], ['edit_file', true], ['run_terminal_cmd', true]]);
    assert.equal(ends[2].summary, 'Edited hello.py (+1 −1)');
    assert.match(ends[3].detail ?? '', /hello/);
    assert.ok(t.events.some((e) => e.type === 'file_changed' && e.rel === 'hello.py'));
    assert.ok(t.events.some((e) => e.type === 'tool_output' && e.chunk.includes('hello')));
    assert.equal(t.events.at(-1)!.type, 'done');

    const first = t.server.requests[0].body;
    assert.equal(first.messages[0].role, 'system');
    assert.match(first.messages[0].content, /You are MusabAI/);
    assert.match(first.messages[0].content, /Run python3 hello.py to test/);
    assert.ok(first.tools.some((tool: any) => tool.function.name === 'edit_file'));
    const second = t.server.requests[1].body.messages;
    const assistant = second.find((m: any) => m.role === 'assistant');
    assert.equal(assistant.tool_calls.length, 2);
    assert.ok(assistant.tool_calls.every((c: any) => /^[A-Za-z0-9]{9}$/.test(c.id)));
    const toolMsgs = second.filter((m: any) => m.role === 'tool');
    assert.deepEqual(toolMsgs.map((m: any) => m.tool_call_id), assistant.tool_calls.map((c: any) => c.id));
    assert.match(toolMsgs[0].content, /1\| print\("hi"\)/);

    assert.deepEqual((await t.changes.summary()).map((c) => c.rel), ['hello.py']);
    await t.checkpoints.restore('t1', t.host);
    assert.equal(await readFile(path.join(t.dir, 'hello.py'), 'utf8'), 'print("hi")\n');
    assert.equal(t.session.truncateFrom('t1'), true);
    assert.equal(t.session.history.length, 0);
  });

  it('offers only read-only tools in Plan mode', async () => {
    const t = await setup([textChunks('1. Change hello.py\n2. Run it')]);
    const result = await t.session.run({ turnId: 'p1', text: 'plan it', mode: plan, modelId: 'kilo-auto/free' });
    assert.equal(result.reason, 'completed');
    const names = t.server.requests[0].body.tools.map((tool: any) => tool.function.name);
    assert.ok(names.includes('read_file') && names.includes('todo_write') && names.includes('codebase_search'));
    assert.ok(!names.includes('edit_file') && !names.includes('run_terminal_cmd') && !names.includes('write_file'));
    assert.match(t.server.requests[0].body.messages[0].content, /Plan mode/);
  });

  it('answers a broken call with an error, then moves to another free model when it repeats', async () => {
    const broken = toolCallChunks([{ id: 'x', name: 'edit_file', args: { path: 'hello.py' } }]);
    const t = await setup([broken, broken], { backup: [textChunks('Fixed it differently.')] });
    const result = await t.session.run({ turnId: 'b1', text: 'edit', mode: agent, modelId: 'kilo-auto/free' });
    assert.equal(result.reason, 'completed');
    assert.equal(result.text, 'Fixed it differently.');
    assert.equal(result.modelId, 'custom/backup-free');
    assert.equal(t.pool.health.get('kilo-auto/free')?.state, 'invalid_tool_response');
    const toolResult = t.session.history.find((m) => m.role === 'tool');
    assert.match(String(toolResult?.content), /Missing required arguments: old_string, new_string/);
    assert.ok(t.events.some((e) => e.type === 'status' && /invalid tool calls/.test(e.message)));
  });

  it('stops a running command when the user cancels', async () => {
    const t = await setup([toolCallChunks([{ id: 'c', name: 'run_terminal_cmd', args: { command: 'sleep 20' } }]), textChunks('never')], {
      policy: { mode: 'auto', allow: [], deny: [] },
    });
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 400);
    const started = Date.now();
    const result = await t.session.run({ turnId: 'c1', text: 'wait', mode: agent, modelId: 'kilo-auto/free', signal: controller.signal });
    assert.equal(result.reason, 'cancelled');
    assert.ok(Date.now() - started < 5000);
    assert.equal(t.approvals.length, 0);
    const last = t.session.history.at(-1)!;
    assert.equal(last.role, 'tool');
  });
});
