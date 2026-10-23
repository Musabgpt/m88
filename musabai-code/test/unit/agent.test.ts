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

async function setup(script: unknown[][], options: { policy?: CommandPolicy; backup?: unknown[][]; maxSteps?: number; rules?: AgentDeps['rules'] } = {}) {
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
    rules: options.rules ?? rulesProvider(dir, () => []),
    changes,
    checkpoints,
    maxSteps: options.maxSteps,
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

  it('reports max_steps when the step budget runs out, and a continued run finishes the task', async () => {
    const keepGoing = toolCallChunks([{ id: 'c', name: 'list_dir', args: {} }]);
    // 3 steps of tool calls exhaust the budget; a later call returns the final answer.
    const t = await setup([keepGoing, keepGoing, keepGoing, textChunks('All done.')], { maxSteps: 3, policy: { mode: 'auto', allow: [], deny: [] } });
    const first = await t.session.run({ turnId: 'm1', text: 'do a long task', mode: agent, modelId: 'kilo-auto/free' });
    assert.equal(first.reason, 'max_steps');
    assert.equal(t.server.requests.length, 3);
    // The host continues the same turn instead of asking the user to type "continue".
    const second = await t.session.run({ turnId: 'm1', text: 'Continue working toward the goal.', mode: agent, modelId: 'kilo-auto/free' });
    assert.equal(second.reason, 'completed');
    assert.equal(second.text, 'All done.');
  });

  it('keeps working when the project rules cannot be loaded, and says so once', async () => {
    let loads = 0;
    const t = await setup([toolCallChunks([{ id: 'c', name: 'read_file', args: { path: 'hello.py' } }]), textChunks('Read it.')], {
      rules: async () => {
        loads++;
        throw new SyntaxError('Invalid regular expression: Unterminated group');
      },
    });
    const result = await t.session.run({ turnId: 'r1', text: 'look', mode: agent, modelId: 'kilo-auto/free' });
    assert.equal(result.reason, 'completed');
    assert.equal(result.text, 'Read it.');
    assert.equal(loads, 2, 'tried again once the files in play changed');
    assert.equal(t.events.filter((e) => e.type === 'status' && /Project rules could not be loaded/.test(e.message)).length, 1);
  });

  it('reads the rules again only when the files in play change or a tool may have changed files', async () => {
    let loads = 0;
    const t = await setup(
      [
        toolCallChunks([{ id: 'a', name: 'list_dir', args: {} }]),
        toolCallChunks([{ id: 'b', name: 'list_dir', args: { depth: 1 } }]),
        toolCallChunks([{ id: 'c', name: 'edit_file', args: { path: 'hello.py', old_string: 'print("hi")', new_string: 'print("x")' } }]),
        textChunks('Done.'),
      ],
      { rules: async () => (loads++, { rules: [], text: '' }) },
    );
    const result = await t.session.run({ turnId: 'k1', text: 'go', mode: agent, modelId: 'kilo-auto/free' });
    assert.equal(result.reason, 'completed');
    // Step 1 loads; steps 2 and 3 follow read-only listings and reuse them; step 4 follows the edit and loads again.
    assert.equal(loads, 2);
    assert.equal(t.server.requests.length, 4);
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

describe('working alone', () => {
  const ends = (events: AgentEvent[]) => events.filter((e): e is Extract<AgentEvent, { type: 'tool_end' }> => e.type === 'tool_end');
  const statuses = (events: AgentEvent[]) => events.filter((e): e is Extract<AgentEvent, { type: 'status' }> => e.type === 'status').map((e) => e.message);

  it('never waits for the user: what needs approval is skipped, the rest runs, and the skips are listed', async () => {
    const outside = await tempDir();
    cleanups.push(outside.cleanup);
    const target = path.join(outside.dir, 'outside.txt');
    const t = await setup(
      [
        toolCallChunks([
          { id: 'c1', name: 'run_terminal_cmd', args: { command: 'git push --force origin main' } },
          { id: 'c2', name: 'run_terminal_cmd', args: { command: 'python3 hello.py' } },
          { id: 'c3', name: 'write_file', args: { path: target, content: 'x\n' } },
        ]),
        textChunks('Done; the force-push is left for you.'),
      ],
      { policy: { mode: 'auto', allow: [], deny: [], unattended: true } },
    );
    const result = await t.session.run({ turnId: 'u1', text: 'ship it', mode: agent, modelId: 'kilo-auto/free' });
    assert.equal(result.reason, 'completed');
    assert.equal(t.approvals.length, 0, 'nothing waited for an answer');
    assert.deepEqual(ends(t.events).map((e) => [e.name, e.ok]), [['run_terminal_cmd', false], ['run_terminal_cmd', true], ['write_file', false]]);
    await assert.rejects(readFile(target), 'nothing was written outside the project');

    const toolMsgs = t.server.requests[1].body.messages.filter((m: any) => m.role === 'tool');
    assert.match(toolMsgs[0].content, /^Skipped running `git push --force origin main` \(force-pushes\): .*the user is away/);
    assert.match(toolMsgs[1].content, /hi/);
    assert.match(toolMsgs[2].content, /^Error: Skipped changing .*outside\.txt \(outside the project\): .*the user is away/);

    const list = statuses(t.events).find((m) => m.startsWith('Skipped while working alone'));
    assert.ok(list, 'the user gets the list of what was skipped');
    assert.match(list!, /git push --force origin main/);
    assert.match(list!, /outside\.txt/);
    assert.match(t.server.requests[0].body.messages[0].content, /<working_alone>/);
  });

  it('keeps what the user allowed beforehand, and skips the rest even when every command would ask', async () => {
    const t = await setup(
      [
        toolCallChunks([
          { id: 'c1', name: 'run_terminal_cmd', args: { command: 'python3 hello.py' } },
          { id: 'c2', name: 'run_terminal_cmd', args: { command: 'ls' } },
        ]),
        textChunks('ok'),
      ],
      // Restricted Mode: every command asks, so working alone every command is skipped unless allowed before.
      { policy: { mode: 'ask', allow: [], deny: [], unattended: true } },
    );
    t.session.allow('cmd=python3 hello.py');
    await t.session.run({ turnId: 'u2', text: 'run it', mode: agent, modelId: 'kilo-auto/free' });
    assert.equal(t.approvals.length, 0);
    assert.deepEqual(ends(t.events).map((e) => [e.name, e.ok]), [['run_terminal_cmd', true], ['run_terminal_cmd', false]]);
    assert.match(statuses(t.events).find((m) => m.startsWith('Skipped while working alone')) ?? '', /run `ls`/);
  });

  it('asks as before when the user is there', async () => {
    const t = await setup([toolCallChunks([{ id: 'c1', name: 'run_terminal_cmd', args: { command: 'git push --dry-run nowhere' } }]), textChunks('ok')], {
      policy: { mode: 'auto', allow: [], deny: [] },
    });
    await t.session.run({ turnId: 'u3', text: 'push', mode: agent, modelId: 'kilo-auto/free' });
    assert.equal(t.approvals.length, 1);
    assert.doesNotMatch(t.server.requests[0].body.messages[0].content, /<working_alone>/);
    assert.ok(!statuses(t.events).some((m) => m.startsWith('Skipped while working alone')));
  });
});
