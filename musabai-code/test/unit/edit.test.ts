import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { ChangeTracker } from '../../src/core/changes';
import { CheckpointStore } from '../../src/core/checkpoints';
import { acceptHunk, hunks, revertHunk, splitLines, stats, unifiedDiff } from '../../src/core/diff';
import { EditError, applyEdit, applyEdits, checkPlaceholders } from '../../src/core/edit';
import { NodeHost } from '../../src/core/host';
import { tempDir } from './helpers';

describe('applyEdit', () => {
  const src = 'function add(a, b) {\n  return a + b;\n}\n\nfunction sub(a, b) {\n  return a - b;\n}\n';

  it('replaces a unique exact match and reports its line', () => {
    const r = applyEdit(src, '  return a - b;', '  return a - b - 0;');
    assert.equal(r.line, 6);
    assert.ok(r.content.includes('a - b - 0'));
    assert.equal(r.fuzzy, undefined);
  });

  it('refuses an ambiguous match unless replace_all', () => {
    assert.throws(() => applyEdit(src, '(a, b) {', '(x, y) {'), /appears 2 times/);
    const r = applyEdit(src, '(a, b) {', '(x, y) {', true);
    assert.equal(r.replacements, 2);
  });

  it('matches despite trailing whitespace and different indentation, re-indenting the new text', () => {
    const r = applyEdit(src, 'return a + b;   \n', 'return a + b + 1;\n');
    assert.ok(r.content.includes('  return a + b + 1;'));
    const indented = 'class A {\n    run() {\n        go();\n    }\n}\n';
    const r2 = applyEdit(indented, 'run() {\n    go();\n}', 'run() {\n    stop();\n    go();\n}');
    assert.equal(r2.fuzzy, 'indentation');
    assert.ok(r2.content.includes('    run() {\n        stop();\n        go();\n    }'));
  });

  it('keeps CRLF files CRLF', () => {
    const crlf = 'a\r\nb\r\nc\r\n';
    assert.equal(applyEdit(crlf, 'b', 'B').content, 'a\r\nB\r\nc\r\n');
  });

  it('explains a miss with the closest text', () => {
    assert.throws(() => applyEdit(src, 'return a * b;', 'x'), (e: unknown) => e instanceof EditError && /closest text/.test(e.message));
  });

  it('refuses lazy placeholders and copied omission markers', () => {
    assert.throws(() => checkPlaceholders('x\n// ... existing code ...\ny'), /placeholder/);
    assert.throws(() => checkPlaceholders('a …[120 characters of this earlier value omitted]… b'), /omitted/);
    assert.doesNotThrow(() => checkPlaceholders('// keep this comment'));
  });

  it('applies several edits all-or-nothing', () => {
    const r = applyEdits(src, [
      { old_string: 'return a + b;', new_string: 'return b + a;' },
      { old_string: 'return a - b;', new_string: 'return -(b - a);' },
    ]);
    assert.ok(r.content.includes('b + a') && r.content.includes('-(b - a)'));
    assert.throws(() => applyEdits(src, [{ old_string: 'return a + b;', new_string: 'x' }, { old_string: 'nope', new_string: 'y' }]), /Edit 2 of 2/);
  });
});

describe('diff', () => {
  const before = 'one\ntwo\nthree\nfour\n';
  const after = 'one\n2\nthree\nfour\nfive\n';

  it('finds hunks and stats', () => {
    const h = hunks(before, after);
    assert.equal(h.length, 2);
    assert.deepEqual(h[0], { oldStart: 1, oldLines: ['two\n'], newStart: 1, newLines: ['2\n'] });
    assert.deepEqual(stats(before, after), { added: 2, removed: 1 });
    assert.deepEqual(splitLines('a\nb'), ['a\n', 'b']);
  });

  it('accepts or reverts single hunks exactly', () => {
    const [first, second] = hunks(before, after);
    assert.equal(revertHunk(after, second), 'one\n2\nthree\nfour\n');
    assert.equal(revertHunk(after, first), 'one\ntwo\nthree\nfour\nfive\n');
    assert.equal(acceptHunk(before, first), 'one\n2\nthree\nfour\n');
  });

  it('prints a unified diff', () => {
    const text = unifiedDiff('src/x.txt', before, after);
    assert.match(text, /^--- a\/src\/x\.txt\n\+\+\+ b\/src\/x\.txt\n@@/);
    assert.match(text, /\n-two\n\+2\n/);
  });
});

describe('review and checkpoints', () => {
  it('rejects, accepts and splits agent changes per hunk', async () => {
    const { dir, cleanup } = await tempDir();
    try {
      const host = new NodeHost({ root: dir });
      const file = path.join(dir, 'a.txt');
      await host.writeText(file, 'one\ntwo\nthree\nfour\n');
      const changes = new ChangeTracker(host);
      changes.record(file, 'one\ntwo\nthree\nfour\n');
      await host.writeText(file, 'one\n2\nthree\nfour\nfive\n');
      const created = path.join(dir, 'new.txt');
      changes.record(created, null);
      await host.writeText(created, 'hello\n');

      let summary = await changes.summary();
      assert.deepEqual(summary.map((s) => [s.rel, s.added, s.removed, s.created]), [['a.txt', 2, 1, false], ['new.txt', 1, 0, true]]);

      await changes.rejectHunk(file, 1);
      assert.equal(await readFile(file, 'utf8'), 'one\n2\nthree\nfour\n');
      await changes.acceptHunk(file, 0);
      assert.equal(changes.has(file), false);

      await changes.reject(created);
      assert.equal(await host.stat(created), undefined);
      summary = await changes.summary();
      assert.equal(summary.length, 0);
    } finally {
      await cleanup();
    }
  });

  it('restores every file to its state before a turn, including later turns', async () => {
    const { dir, cleanup } = await tempDir();
    try {
      const host = new NodeHost({ root: dir });
      const a = path.join(dir, 'a.txt');
      const b = path.join(dir, 'b.txt');
      await host.writeText(a, 'v0');
      const store = new CheckpointStore();
      store.record('t1', a, 'v0');
      await host.writeText(a, 'v1');
      store.record('t2', a, 'v1');
      await host.writeText(a, 'v2');
      store.record('t2', b, null);
      await host.writeText(b, 'new');
      assert.deepEqual([...store.plan('t2').entries()], [[a, 'v1'], [b, null]]);
      const restored = await store.restore('t1', host);
      assert.deepEqual(restored.sort(), [a, b].sort());
      assert.equal(await readFile(a, 'utf8'), 'v0');
      assert.equal(await host.stat(b), undefined);
      assert.deepEqual(store.turnIds(), []);
    } finally {
      await cleanup();
    }
  });
});
