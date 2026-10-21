import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { NodeHost, stripAnsi } from '../../src/core/host';
import { parseTextMentions, resolveMentions } from '../../src/core/mentions';
import { tempDir } from './helpers';

async function project() {
  const t = await tempDir();
  await mkdir(path.join(t.dir, 'src'), { recursive: true });
  await mkdir(path.join(t.dir, 'node_modules', 'x'), { recursive: true });
  await writeFile(path.join(t.dir, 'src', 'main.js'), 'const answer = 42;\nconsole.log(answer);\n');
  await writeFile(path.join(t.dir, 'src', 'util.py'), 'def helper():\n    return "TODO later"\n');
  await writeFile(path.join(t.dir, 'node_modules', 'x', 'index.js'), 'TODO in dependency');
  await writeFile(path.join(t.dir, '.gitignore'), 'ignored.txt\n');
  await writeFile(path.join(t.dir, 'ignored.txt'), 'TODO ignored');
  return t;
}

describe('NodeHost', () => {
  it('lists files respecting .gitignore in a git repository and skipping node_modules elsewhere', async () => {
    const { dir, cleanup } = await project();
    try {
      const plain = new NodeHost({ root: dir });
      const walked = await plain.listFiles();
      assert.ok(walked.includes('src/main.js'));
      assert.ok(!walked.some((f) => f.startsWith('node_modules/')));
      execFileSync('git', ['init', '-q'], { cwd: dir });
      await writeFile(path.join(dir, '.gitignore'), 'ignored.txt\nnode_modules/\n');
      const host = new NodeHost({ root: dir });
      const files = await host.listFiles();
      assert.deepEqual(files.sort(), ['.gitignore', 'src/main.js', 'src/util.py']);
      assert.deepEqual(await host.listFiles({ glob: '*.py' }), ['src/util.py']);
      assert.deepEqual(await host.listFiles({ under: 'src', glob: '*.js' }), ['src/main.js']);
    } finally {
      await cleanup();
    }
  });

  it('greps with ripgrep or the JS fallback, case-insensitively by default', async () => {
    const { dir, cleanup } = await project();
    try {
      execFileSync('git', ['init', '-q'], { cwd: dir });
      await writeFile(path.join(dir, '.gitignore'), 'ignored.txt\nnode_modules/\n');
      for (const host of [new NodeHost({ root: dir }), new NodeHost({ root: dir, rgPath: '/nonexistent/rg' })]) {
        const hits = await host.grep({ pattern: 'todo' });
        assert.deepEqual(hits.map((h) => `${h.path}:${h.line}`), ['src/util.py:2']);
        const js = await host.grep({ pattern: 'answer', include: '*.js' });
        assert.equal(js.length, 2);
      }
      await assert.rejects(new NodeHost({ root: dir }).grep({ pattern: '(' }), /Invalid regex/);
    } finally {
      await cleanup();
    }
  });

  it('runs commands with exit codes, timeouts, cancellation and background processes', async () => {
    const { dir, cleanup } = await project();
    try {
      const host = new NodeHost({ root: dir });
      const ok = await host.exec('echo hi && echo err >&2 && exit 3');
      assert.equal(ok.exitCode, 3);
      assert.match(ok.output, /hi\n[\s\S]*err/);
      const slow = await host.exec('sleep 5', { timeoutMs: 300 });
      assert.equal(slow.timedOut, true);
      const controller = new AbortController();
      const pending = host.exec('sleep 5', { signal: controller.signal });
      setTimeout(() => controller.abort(), 100);
      assert.equal((await pending).killed, true);
      const bg = await host.exec('echo started; sleep 30', { background: true });
      assert.ok(bg.backgroundId);
      assert.match(host.processOutput(bg.backgroundId!)!.output, /started/);
      assert.equal(await host.killProcess(bg.backgroundId!), true);
      const chunks: string[] = [];
      await host.exec('printf "a\\nb\\n"', { onOutput: (c) => chunks.push(c) });
      assert.equal(chunks.join(''), 'a\nb\n');
      assert.equal(stripAnsi('\x1b[31mred\x1b[0m\r\nok'), 'red\nok');
    } finally {
      await cleanup();
    }
  });

  it('reports syntax errors for JS, Python and JSON', async () => {
    const { dir, cleanup } = await project();
    try {
      await writeFile(path.join(dir, 'bad.js'), 'const = 1;\n');
      await writeFile(path.join(dir, 'bad.py'), 'def f(:\n  pass\n');
      await writeFile(path.join(dir, 'bad.json'), '{"a": }');
      const host = new NodeHost({ root: dir });
      const found = await host.diagnostics(['bad.js', 'bad.py', 'bad.json', 'src/main.js'].map((f) => path.join(dir, f)));
      assert.deepEqual(found.map((d) => d.path).sort(), ['bad.js', 'bad.json', 'bad.py']);
      assert.ok(found.every((d) => d.severity === 'error'));
    } finally {
      await cleanup();
    }
  });

  it('resolves @mentions typed in the terminal and attached in the editor', async () => {
    const { dir, cleanup } = await project();
    try {
      const host = new NodeHost({ root: dir });
      const mentions = await parseTextMentions('explain @src/main.js and @src, see @https://example.com/x @rule:style @nothing', host);
      assert.deepEqual(mentions.map((m) => m.type), ['file', 'folder', 'url', 'rule']);
      const resolved = await resolveMentions(
        [
          { type: 'file', path: 'src/main.js' },
          { type: 'file', path: 'src/util.py', startLine: 2, endLine: 2 },
          { type: 'terminal', text: 'npm ERR! missing script', name: 'bash' },
          { type: 'rule', name: 'style' },
          { type: 'image', dataUrl: 'data:image/png;base64,AA==' },
        ],
        { host },
      );
      assert.match(resolved.context, /<attached kind="file" path="src\/main.js">\n1\| const answer = 42;/);
      assert.match(resolved.context, /kind="selection" path="src\/util.py" lines="2-2">\n2\|     return "TODO later"/);
      assert.match(resolved.context, /npm ERR! missing script/);
      assert.deepEqual(resolved.rules, ['style']);
      assert.deepEqual(resolved.images, ['data:image/png;base64,AA==']);
      assert.deepEqual(resolved.files, ['src/main.js', 'src/util.py']);
    } finally {
      await cleanup();
    }
  });
});
