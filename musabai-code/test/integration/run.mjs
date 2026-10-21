// Runs the integration suite inside a real VSCodium (or VS Code) with a scripted mock model.
// MUSABAI_VSCODE_BIN points at the editor binary (e.g. VSCodium-linux-x64/codium).
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTests } from '@vscode/test-electron';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const exe = process.env.MUSABAI_VSCODE_BIN;
if (!exe || !existsSync(exe)) {
  console.error('Set MUSABAI_VSCODE_BIN to a VSCodium/VS Code binary (download VSCodium-linux-x64-*.tar.gz from GitHub releases).');
  process.exit(2);
}

const mock = spawn(process.execPath, [path.join(root, 'test', 'fixtures', 'mock-llm.mjs'), '0'], { stdio: ['ignore', 'pipe', 'inherit'] });
const url = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('mock model did not start')), 10_000);
  mock.stdout.on('data', (d) => {
    const m = /listening on (\S+)/.exec(String(d));
    if (m) {
      clearTimeout(timer);
      resolve(m[1]);
    }
  });
});

const tmp = await mkdtemp(path.join(os.tmpdir(), 'musabai-it-'));
const ws = path.join(tmp, 'project');
await mkdir(ws, { recursive: true });
await writeFile(path.join(ws, 'hello.py'), 'print("hi")\n');
await writeFile(path.join(ws, 'AGENTS.md'), 'Run python3 hello.py to test.\n');
const git = (...args) => execFileSync('git', ['-c', 'user.name=MusabAI tests', '-c', 'user.email=tests@example.invalid', ...args], { cwd: ws, stdio: 'ignore' });
git('init', '-q', '-b', 'main');
git('add', '-A');
git('commit', '-qm', 'initial');

const userData = path.join(tmp, 'user-data');
await mkdir(path.join(userData, 'User'), { recursive: true });
await writeFile(
  path.join(userData, 'User', 'settings.json'),
  JSON.stringify(
    {
      'musabai.models.custom': [{ id: 'custom/mock-free', name: 'Mock Free Model', baseUrl: `${url}/v1`, model: 'mock', free: true, capabilities: ['text', 'tools', 'streaming', 'coding', 'vision'] }],
      'musabai.model': 'custom/mock-free',
      'musabai.models.discoverKilo': false,
      'musabai.models.discoverLocal': false,
      'musabai.agent.runMode': 'auto',
      'musabai.showWelcome': false,
      'musabai.index.enabled': true,
      'security.workspace.trust.enabled': false,
      'git.openRepositoryInParentFolders': 'always',
      'workbench.startupEditor': 'none',
    },
    null,
    2,
  ),
);

let code = 0;
try {
  await runTests({
    vscodeExecutablePath: exe,
    extensionDevelopmentPath: root,
    extensionTestsPath: path.join(root, 'dist-integration', 'suite.js'),
    launchArgs: [ws, '--user-data-dir', userData, '--extensions-dir', path.join(tmp, 'extensions'), '--disable-extensions', '--no-sandbox', '--disable-gpu', '--skip-welcome', '--skip-release-notes'],
    extensionTestsEnv: { MUSABAI_MOCK_URL: url, MUSABAI_TEST_WORKSPACE: ws, HOME: tmp },
  });
} catch (error) {
  console.error(`Integration tests failed: ${error?.message ?? error}`);
  code = 1;
} finally {
  mock.kill();
  await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
}
process.exit(code);
