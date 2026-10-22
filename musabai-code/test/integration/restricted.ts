import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import * as vscode from 'vscode';
import { policy } from '../../src/vscode/config';
import { api, runAll, type Test } from './harness';

// Runs in an untrusted folder (Restricted Mode) whose user settings choose auto-run and whose .cursor/mcp.json
// declares a server that would create MUSABAI_MCP_MARKER if it ever started.
const tests: Test[] = [];
const test = (name: string, fn: () => Promise<void>) => tests.push([name, fn]);

test('every agent command asks in Restricted Mode, although the user chose auto-run', async () => {
  await api();
  assert.equal(vscode.workspace.isTrusted, false, 'the folder opens in Restricted Mode');
  assert.equal(vscode.workspace.getConfiguration('musabai').get('agent.runMode'), 'auto');
  assert.equal(policy().mode, 'ask');
});

test("the project's MCP servers stay off", async () => {
  const mcp = (await api()).services.mcp!;
  await mcp.startAll();
  assert.deepEqual(mcp.status().map((s) => [s.name, s.state]), [['marker', 'not_trusted']]);
  assert.equal(existsSync(process.env.MUSABAI_MCP_MARKER!), false, 'the server command never ran');
});

test('background agents do not start', async () => {
  const musabai = await api();
  await vscode.commands.executeCommand('musabai.background.new', 'make hello.py greet the world');
  assert.deepEqual(musabai.background.list(), []);
});

export function run(): Promise<void> {
  return runAll(tests);
}
