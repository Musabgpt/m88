import assert from 'node:assert/strict';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { PROTECT, project } from '../../src/core/agent/context';
import { CodebaseIndex, chunkFile, tokenize } from '../../src/core/index/indexer';
import { NodeHost } from '../../src/core/host';
import { addedLines, extractCodeBlock, parseJsonLoose } from '../../src/core/oneshot';
import { loadRules, nestedDirs, parseMdc, rulesPrompt, selectRules } from '../../src/core/rules';
import type { ChatMessage } from '../../src/core/types';
import { globToRegExp, matchesGlob, parseArgs, splitGlobList } from '../../src/core/util';
import { htmlToText, parseDuckDuckGo } from '../../src/core/web';
import { tempDir } from './helpers';

describe('globs and arguments', () => {
  it('matches like .gitignore and rg -g', () => {
    assert.ok(matchesGlob('src/app/main.ts', '*.ts'));
    assert.ok(matchesGlob('src/app/main.ts', 'src/**/*.ts'));
    assert.ok(matchesGlob('main.ts', '**/*.ts'));
    assert.ok(!matchesGlob('src/app/main.tsx', '*.ts'));
    assert.ok(matchesGlob('a/b.test.js', '**/*.{test,spec}.js'));
    assert.ok(globToRegExp('docs/*.md').test('docs/a.md'));
    assert.ok(!globToRegExp('docs/*.md').test('docs/x/a.md'));
  });

  it('keeps the commas inside braces and never throws on an unbalanced brace', () => {
    assert.deepEqual(splitGlobList('src/**/*.{ts,tsx}, docs/**,*.[ch]'), ['src/**/*.{ts,tsx}', 'docs/**', '*.[ch]']);
    assert.deepEqual(splitGlobList('*.ts,*.tsx'), ['*.ts', '*.tsx']);
    assert.ok(matchesGlob('src/a/b.tsx', 'src/**/*.{ts,tsx}'));
    assert.doesNotThrow(() => globToRegExp('src/**/*.{ts'));
    assert.ok(globToRegExp('src/**/*.{ts').test('src/x.{ts'), 'an unbalanced brace is a literal character');
    assert.ok(globToRegExp('a}b').test('a}b'));
    assert.equal(matchesGlob('a.ts', ['src/**/*.{ts', '*.ts']), true);
  });

  it('repairs common JSON slips but never truncated output', () => {
    assert.deepEqual(parseArgs('{"a": 1,}'), { a: 1 });
    assert.deepEqual(parseArgs('{"code": "line1\nline2"}'), { code: 'line1\nline2' });
    assert.throws(() => parseArgs('{"a": 1,}', true));
    assert.throws(() => parseArgs('[1,2]'));
  });
});

describe('rules', () => {
  it('parses .mdc front matter in its common shapes', () => {
    const a = parseMdc('---\ndescription: React components\nglobs: src/**/*.tsx, src/**/*.jsx\nalwaysApply: false\n---\nUse hooks.');
    assert.deepEqual(a.meta, { description: 'React components', globs: ['src/**/*.tsx', 'src/**/*.jsx'], alwaysApply: false });
    assert.equal(a.body, 'Use hooks.');
    const b = parseMdc('---\nglobs:\n  - "**/*.py"\n  - tests/**\nalwaysApply: true\n---\nbody');
    assert.deepEqual(b.meta.globs, ['**/*.py', 'tests/**']);
    assert.equal(b.meta.alwaysApply, true);
    assert.deepEqual(parseMdc('just text').meta, {});
    // Cursor's brace globs stay whole, in every front-matter shape.
    assert.deepEqual(parseMdc('---\nglobs: src/**/*.{ts,tsx}\n---\nx').meta.globs, ['src/**/*.{ts,tsx}']);
    assert.deepEqual(parseMdc('---\nglobs: "*.{js,jsx}", docs/**\n---\nx').meta.globs, ['*.{js,jsx}', 'docs/**']);
    assert.deepEqual(parseMdc('---\nglobs: ["app/**/*.{vue,ts}", "*.css"]\n---\nx').meta.globs, ['app/**/*.{vue,ts}', '*.css']);
  });

  it('loads and attaches a rule with brace globs instead of failing every chat', async () => {
    const { dir, cleanup } = await tempDir();
    try {
      await mkdir(path.join(dir, '.cursor', 'rules'), { recursive: true });
      await writeFile(path.join(dir, '.cursor', 'rules', 'ts.mdc'), '---\nglobs: src/**/*.{ts,tsx}\n---\nTypeScript rule');
      await writeFile(path.join(dir, '.cursor', 'rules', 'odd.mdc'), '---\nglobs: src/**/*.{ts\n---\nOdd rule');
      const rules = await loadRules(dir);
      const sel = selectRules(rules, ['src/app/view.tsx']);
      assert.deepEqual(sel.attached.map((r) => r.name), ['ts']);
      assert.match(rulesPrompt(sel), /TypeScript rule/);
    } finally {
      await cleanup();
    }
  });

  it('does not read rule files that are links to files outside the project', async () => {
    const { dir, cleanup } = await tempDir();
    const outside = await tempDir();
    try {
      await writeFile(path.join(outside.dir, 'secret.txt'), 'API_KEY=sk-secret');
      await mkdir(path.join(dir, '.cursor', 'rules'), { recursive: true });
      await symlink(path.join(outside.dir, 'secret.txt'), path.join(dir, 'AGENTS.md'));
      await symlink(path.join(outside.dir, 'secret.txt'), path.join(dir, '.cursorrules'));
      await symlink(path.join(outside.dir, 'secret.txt'), path.join(dir, '.cursor', 'rules', 'leak.mdc'));
      await writeFile(path.join(dir, 'real.md'), 'Inside rule');
      await symlink(path.join(dir, 'real.md'), path.join(dir, '.cursor', 'rules', 'inside.mdc'));
      const rules = await loadRules(dir);
      assert.deepEqual(rules.map((r) => r.name), ['inside'], 'a link inside the project is fine; links out are skipped');
      assert.ok(rules.every((r) => !r.body.includes('sk-secret')));
    } finally {
      await cleanup();
      await outside.cleanup();
    }
  });

  it('loads Cursor rules, .cursorrules, AGENTS.md (nested too) and user rules, and selects them', async () => {
    const { dir, cleanup } = await tempDir();
    try {
      await mkdir(path.join(dir, '.cursor', 'rules'), { recursive: true });
      await mkdir(path.join(dir, 'api'), { recursive: true });
      await writeFile(path.join(dir, '.cursor', 'rules', 'always.mdc'), '---\nalwaysApply: true\n---\nAlways rule');
      await writeFile(path.join(dir, '.cursor', 'rules', 'py.mdc'), '---\nglobs: "**/*.py"\n---\nPython rule');
      await writeFile(path.join(dir, '.cursor', 'rules', 'db.mdc'), '---\ndescription: Database migrations\n---\nDB rule');
      await writeFile(path.join(dir, '.cursor', 'rules', 'manual.mdc'), 'Manual rule');
      await writeFile(path.join(dir, '.cursorrules'), 'Legacy rule');
      await writeFile(path.join(dir, 'AGENTS.md'), 'npm test runs the tests');
      await writeFile(path.join(dir, 'api', 'AGENTS.md'), 'API notes');
      const rules = await loadRules(dir, ['Answer in Arabic'], nestedDirs(dir, ['api/server.py']));
      assert.deepEqual(rules.map((r) => `${r.name}:${r.kind}`).sort(), [
        'AGENTS.md:always', 'always:always', 'api/AGENTS.md:auto', 'cursorrules:always', 'db:agent', 'manual:manual', 'py:auto', 'user-rule-1:always',
      ]);
      const sel = selectRules(rules, ['api/server.py'], ['manual']);
      assert.deepEqual(sel.attached.map((r) => r.name).sort(), ['api/AGENTS.md', 'py']);
      assert.deepEqual(sel.mentioned.map((r) => r.name), ['manual']);
      assert.deepEqual(sel.requestable.map((r) => r.name), ['db']);
      const text = rulesPrompt(sel);
      assert.match(text, /Always rule/);
      assert.match(text, /Python rule/);
      assert.match(text, /Answer in Arabic/);
      assert.match(text, /fetch_rules[\s\S]*db: Database migrations/);
      assert.doesNotMatch(text, /DB rule/);
    } finally {
      await cleanup();
    }
  });
});

describe('context projection', () => {
  it('shortens old tool results first and keeps the latest calls whole', () => {
    const history: ChatMessage[] = [{ role: 'user', content: 'do it' }];
    for (let i = 0; i < PROTECT + 4; i++) {
      history.push({ role: 'assistant', content: '', tool_calls: [{ id: `c${i}`, type: 'function', function: { name: 'read_file', arguments: JSON.stringify({ path: `f${i}`, content: 'x'.repeat(2000) }) } }] });
      history.push({ role: 'tool', tool_call_id: `c${i}`, content: `result ${i} ` + 'y'.repeat(9000) });
    }
    const out = project(history, [], { budget: 60_000 });
    assert.equal(out.length, history.length);
    const results = out.filter((m) => m.role === 'tool').map((m) => String(m.content));
    assert.match(results[0], /characters of this earlier value omitted/);
    assert.ok(results.slice(-PROTECT).every((r) => !r.includes('omitted')));
    assert.ok(out.every((m, i) => m.role === history[i].role && m.tool_call_id === history[i].tool_call_id));
    assert.equal(project(history, [], { local: true }), history);
  });
});

describe('codebase index', () => {
  it('tokenizes identifiers and finds code by meaning-ish words', async () => {
    assert.ok(tokenize('getUserName').includes('user'));
    assert.ok(tokenize('MAX_RETRY_COUNT').includes('retry'));
    const chunks = chunkFile('a.ts', Array.from({ length: 150 }, (_, i) => `line ${i}`).join('\n'));
    assert.ok(chunks.length >= 3 && chunks[0].startLine === 1);
    const { dir, cleanup } = await tempDir();
    try {
      await mkdir(path.join(dir, 'src'), { recursive: true });
      await writeFile(path.join(dir, 'src', 'auth.ts'), 'export function validateSessionToken(token: string) {\n  return token.length > 10 && !isExpired(token);\n}\n');
      await writeFile(path.join(dir, 'src', 'price.ts'), 'export const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;\n');
      await writeFile(path.join(dir, 'logo.png'), 'binary');
      const index = new CodebaseIndex(new NodeHost({ root: dir }));
      await index.build();
      assert.equal(index.status.files, 2);
      const hits = await index.search('where is the session token validated?', 3);
      assert.equal(hits[0].path, 'src/auth.ts');
      assert.equal((await index.search('format price', 3))[0].path, 'src/price.ts');
      await writeFile(path.join(dir, 'src', 'price.ts'), 'export const nothingHere = 1;\n');
      await index.updateFile('src/price.ts');
      const after = await index.search('format price', 3);
      assert.ok(after.every((h) => !h.text.includes('formatPrice')));
    } finally {
      await cleanup();
    }
  });
});

describe('web and one-shot parsing', () => {
  it('turns HTML into readable text', () => {
    const { title, text } = htmlToText('<html><head><title>Docs &amp; API</title><style>x{}</style></head><body><nav>menu</nav><h2>Install</h2><p>Run <code>npm i x</code>.</p><pre>npm i x</pre><ul><li>One</li></ul><script>evil()</script></body></html>');
    assert.equal(title, 'Docs & API');
    assert.match(text, /## Install/);
    assert.match(text, /`npm i x`/);
    assert.match(text, /- One/);
    assert.doesNotMatch(text, /evil|menu/);
  });

  it('parses DuckDuckGo HTML results', () => {
    const html = '<div class="result results_links"><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdocs&rut=x">Example <b>Docs</b></a><a class="result__snippet">The best &amp; docs</a></div>';
    assert.deepEqual(parseDuckDuckGo(html), [{ title: 'Example Docs', url: 'https://example.com/docs', snippet: 'The best & docs' }]);
  });

  it('extracts code blocks and JSON from model replies', () => {
    assert.equal(extractCodeBlock('Here:\n```ts\nconst a = 1;\n```\n'), 'const a = 1;');
    assert.equal(extractCodeBlock('```py\nprint(1)'), 'print(1)');
    assert.deepEqual(parseJsonLoose('Sure! {"title": "Fix", "body": "x"} done'), { title: 'Fix', body: 'x' });
  });

  it('knows which new-file lines a diff added', () => {
    const diff = '--- a/x.ts\n+++ b/x.ts\n@@ -1,3 +1,4 @@\n a\n-b\n+B\n+C\n c\n';
    assert.deepEqual([...addedLines(diff).get('x.ts')!], [2, 3]);
  });
});
