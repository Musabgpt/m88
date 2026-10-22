import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as vscode from 'vscode';
import { findBrowser } from '../../src/core/browser';
import { api, runAll, type Test } from './harness';

const tests: Test[] = [];
const test = (name: string, fn: () => Promise<void>) => tests.push([name, fn]);
const ws = process.env.MUSABAI_TEST_WORKSPACE!;
const hello = path.join(ws, 'hello.py');

async function waitFor<T>(what: string, fn: () => T | Promise<T>, timeout = 30_000): Promise<NonNullable<T>> {
  const until = Date.now() + timeout;
  for (;;) {
    const value = await fn();
    if (value) return value as NonNullable<T>;
    if (Date.now() > until) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 150));
  }
}

test('activates with Cursor-style commands, keybindings, chat view and theme', async () => {
  const musabai = await api();
  assert.ok(musabai.services.root, 'a workspace folder is open');
  const commands = await vscode.commands.getCommands(true);
  for (const id of ['musabai.chat.open', 'musabai.inlineEdit', 'musabai.terminal.generateCommand', 'musabai.scm.generateCommitMessage', 'musabai.github.review', 'musabai.background.new', 'musabai.openSettings', 'musabai.import', 'musabai.phone.start']) {
    assert.ok(commands.includes(id), `${id} is registered`);
  }
  const pkg = vscode.extensions.getExtension('musabai.musabai-code')!.packageJSON;
  assert.equal(pkg.contributes.viewsContainers.secondarySidebar[0].id, 'musabai');
  assert.ok(pkg.contributes.keybindings.some((k: { key: string; command: string }) => k.key === 'ctrl+k' && k.command === 'musabai.inlineEdit'));
  assert.ok(vscode.workspace.getConfiguration('terminal.integrated').get<string[]>('commandsToSkipShell')?.includes('musabai.terminal.generateCommand'));
  await vscode.commands.executeCommand('musabai.chat.open');
});

test("a repository's .vscode/settings.json cannot change the run mode or the model servers", async () => {
  const config = vscode.workspace.getConfiguration('musabai');
  assert.equal(config.get('agent.runMode'), 'auto', 'the user setting wins');
  assert.equal(config.get('local.ollamaUrl'), '');
});

test('lists the free models: keyless Kilo default, keyed free tiers and the custom endpoint', async () => {
  const models = await (await api()).services.pool.listModels();
  const ids = models.map((m) => m.id);
  for (const id of ['kilo-auto/free', 'groq/gpt-oss-120b-free', 'gemini/3.7-flash-free', 'openrouter/free', 'nvidia/nemotron-3-ultra-free', 'zhipu/glm-4.7-flash-free', 'mistral/devstral-free', 'aihorde/anonymous-free', 'custom/mock-free']) {
    assert.ok(ids.includes(id), `${id} is offered`);
  }
  assert.equal(models.find((m) => m.id === 'kilo-auto/free')?.keyless, true);
});

test('the agent edits a file, runs it in the agent terminal, and the change can be rejected', async () => {
  const musabai = await api();
  await musabai.chat.sendFromCommand('make hello.py greet the world');
  assert.equal(await readFile(hello, 'utf8'), 'print("Hello, world! مرحبا بالعالم")\n');
  const pending = await musabai.services.changes!.summary();
  assert.deepEqual(pending.map((p) => [p.rel, p.added, p.removed]), [['hello.py', 1, 1]]);
  const doc = await vscode.workspace.openTextDocument(hello);
  await vscode.window.showTextDocument(doc);
  await vscode.commands.executeCommand('musabai.review.rejectFile', doc.uri);
  await waitFor('the original content', async () => (await readFile(hello, 'utf8')) === 'print("hi")\n');
  assert.equal((await musabai.services.changes!.summary()).length, 0);
});

test('Ctrl+K inline edit shows a red/green diff that can be accepted', async () => {
  const musabai = await api();
  const doc = await vscode.workspace.openTextDocument(hello);
  const editor = await vscode.window.showTextDocument(doc);
  editor.selection = new vscode.Selection(0, 0, 0, doc.lineAt(0).text.length);
  await vscode.commands.executeCommand('musabai.inlineEdit', 'say hello instead');
  await waitFor('the inline diff', () => musabai.inline.hasSession(editor));
  assert.equal(doc.getText(), 'print("hi")\nprint("hello from Ctrl+K")\n');
  await vscode.commands.executeCommand('musabai.inlineEdit.accept');
  assert.equal(doc.getText(), 'print("hello from Ctrl+K")\n');
  assert.equal(musabai.inline.hasSession(editor), false);
  await doc.save();
});

test('Tab autocomplete completes code at the cursor', async () => {
  const musabai = await api();
  const doc = await vscode.workspace.openTextDocument({ language: 'python', content: 'def add(a, b):\n    return ' });
  const position = new vscode.Position(1, 11);
  const token = new vscode.CancellationTokenSource().token;
  const items = await musabai.tab.provideInlineCompletionItems(doc, position, { triggerKind: vscode.InlineCompletionTriggerKind.Invoke, selectedCompletionInfo: undefined }, token);
  assert.equal(items?.[0]?.insertText, 'a + b;');
});

test('Generate Commit Message fills the Source Control input', async () => {
  const gitExt = vscode.extensions.getExtension<{ getAPI(v: 1): { repositories: { rootUri: vscode.Uri; inputBox: { value: string } }[] } }>('vscode.git')!;
  const git = (await gitExt.activate()).getAPI(1);
  const repo = await waitFor('the git repository', () => git.repositories.find((r) => r.rootUri.fsPath === ws));
  await vscode.commands.executeCommand('musabai.scm.generateCommitMessage', { rootUri: repo.rootUri });
  assert.equal(repo.inputBox.value, 'Make hello.py greet the world\n\nPrint a friendlier greeting.');
});

test('a background agent works on its own git worktree', async () => {
  const musabai = await api();
  const before = await readFile(hello, 'utf8');
  await vscode.commands.executeCommand('musabai.background.new', 'make hello.py greet the world');
  // Wait until it is both finished and its changed-file list is filled in (status flips a tick before files are set).
  const agent = await waitFor('the background agent', () => musabai.background.list().find((a) => a.status !== 'running' && a.files !== undefined), 60_000);
  assert.equal(agent.status, 'done', agent.error);
  assert.deepEqual(agent.files, ['hello.py']);
  assert.equal(await readFile(path.join(agent.worktree, 'hello.py'), 'utf8'), 'print("Hello, world! مرحبا بالعالم")\n');
  assert.equal(await readFile(hello, 'utf8'), before, 'the workspace is untouched');
  await musabai.background.discard(agent.id, false);
  await assert.rejects(stat(agent.worktree));
});

test("a background agent's notes go to the project memory, and Apply still brings its changes in", async () => {
  const musabai = await api();
  // Project memory is untracked: the agent's worktree (made from HEAD) does not have it.
  const memory = path.join(ws, '.musabai', 'memory.md');
  await mkdir(path.dirname(memory), { recursive: true });
  await writeFile(memory, '- Old note\n');
  const before = await readFile(hello, 'utf8');
  // The committed hello.py (an earlier test leaves its Ctrl+K edit), so the agent's patch applies cleanly.
  await writeFile(hello, 'print("hi")\n');
  await vscode.commands.executeCommand('musabai.background.new', 'remember the port, then make hello.py greet the world');
  const agent = await waitFor('the background agent', () => musabai.background.list().find((a) => a.status !== 'running' && a.files !== undefined && a.prompt.startsWith('remember')), 60_000);
  assert.equal(agent.status, 'done', agent.error);
  assert.deepEqual(agent.files, ['hello.py'], 'the memory file is not one of its changes');
  assert.equal(await readFile(memory, 'utf8'), '- Old note\n- The dev server runs on port 8000\n', 'the note landed in the project memory');
  await assert.rejects(stat(path.join(agent.worktree, '.musabai', 'memory.md')));
  assert.ok((await musabai.services.changes!.summary()).some((c) => c.rel === '.musabai/memory.md'), 'the note waits for review like any change');
  await vscode.commands.executeCommand('musabai.background.apply', agent.id);
  assert.equal(await readFile(hello, 'utf8'), 'print("Hello, world! مرحبا بالعالم")\n', 'Apply worked although the project has a memory file');
  await musabai.background.discard(agent.id, false);
  await musabai.services.changes!.rejectAll();
  await writeFile(hello, before);
  await rm(path.dirname(memory), { recursive: true, force: true });
});

test('the agent browser opens a page, reads it, clicks and screenshots (when a browser is installed)', async () => {
  const musabai = await api();
  const which = async (c: string) => {
    try {
      const { execFileSync } = await import('node:child_process');
      return execFileSync('which', [c], { encoding: 'utf8' }).trim() || undefined;
    } catch {
      return undefined;
    }
  };
  if (!(await findBrowser({ which }))) {
    console.log('    (no Chromium-family browser installed; skipping the browser test)');
    return;
  }
  const page = '<!doctype html><title>Agent Browser Test</title><body><h1 id="h">start</h1><button onclick="document.getElementById(\'h\').textContent=\'clicked\'">Run it</button></body>';
  const server = createServer((_q, r) => (r.writeHead(200, { 'content-type': 'text/html' }), r.end(page)));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
  try {
    const browser = musabai.services.host!.browser!();
    let opened;
    try {
      opened = await browser.open(url);
    } catch (error) {
      await browser.close().catch(() => undefined);
      // An installed browser that fails to start is a regression. Only a sandbox known to block it may opt out.
      if (!process.env.MUSABAI_ALLOW_BROWSER_SKIP) throw error;
      console.log(`    (MUSABAI_ALLOW_BROWSER_SKIP: the browser could not start here, skipping: ${(error as Error).message})`);
      return;
    }
    assert.equal(opened.title, 'Agent Browser Test');
    assert.ok(opened.text.includes('start'));
    assert.equal(await browser.click('Run it'), true);
    assert.ok((await browser.state()).text.includes('clicked'), 'clicking changed the page');
    assert.match(await browser.screenshot(), /^data:image\/png;base64,/);
    await browser.close();
  } finally {
    server.close();
  }
});

test('Settings, the model picker and the welcome tour open', async () => {
  await vscode.commands.executeCommand('musabai.openSettings', 'models');
  await vscode.commands.executeCommand('musabai.walkthrough');
  await writeFile(hello, 'print("hi")\n');
});

export function run(): Promise<void> {
  return runAll(tests);
}
