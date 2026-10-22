import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { NodeHost } from '../../src/core/host';
import { MEMORY_CAP, MEMORY_FILE, composeMemory, readMemory } from '../../src/core/memory';
import { updateMemory } from '../../src/core/tools/memory';
import type { ToolContext } from '../../src/core/tools/types';
import { tempDir } from './helpers';

function ctxFor(root: string): ToolContext {
  return { host: new NodeHost({ root }), root } as unknown as ToolContext;
}

describe('project memory', () => {
  it('reads nothing when the file is missing', async () => {
    const { dir, cleanup } = await tempDir();
    try {
      assert.equal(await readMemory(dir), undefined);
    } finally {
      await cleanup();
    }
  });

  it('appends notes as bullets and reads them back', async () => {
    const { dir, cleanup } = await tempDir();
    try {
      const ctx = ctxFor(dir);
      await updateMemory.execute({ text: 'Build with npm run build' }, ctx);
      await updateMemory.execute({ text: 'Tests live in test/unit' }, ctx);
      const saved = await readFile(path.join(dir, MEMORY_FILE), 'utf8');
      assert.equal(saved, '- Build with npm run build\n- Tests live in test/unit\n');
      assert.equal(await readMemory(dir), '- Build with npm run build\n- Tests live in test/unit');
    } finally {
      await cleanup();
    }
  });

  it('replaces the whole memory when asked', async () => {
    const { dir, cleanup } = await tempDir();
    try {
      const ctx = ctxFor(dir);
      await updateMemory.execute({ text: 'first' }, ctx);
      const result = await updateMemory.execute({ text: '# Notes\n\n- only this', action: 'replace' }, ctx);
      assert.equal(result.summary, 'Rewrote project memory');
      assert.equal(await readMemory(dir), '# Notes\n\n- only this');
    } finally {
      await cleanup();
    }
  });

  it('collapses a multi-line note into one bullet and rejects empty text', async () => {
    const { dir, cleanup } = await tempDir();
    try {
      const ctx = ctxFor(dir);
      await updateMemory.execute({ text: 'line one\n   line two' }, ctx);
      assert.equal(await readMemory(dir), '- line one line two');
      await assert.rejects(updateMemory.execute({ text: '   ' }, ctx), /Nothing to save/);
    } finally {
      await cleanup();
    }
  });

  it('keeps memory under the cap, dropping the oldest whole notes', () => {
    const existing = Array.from({ length: 2000 }, (_, i) => `- note ${i}`).join('\n');
    const out = composeMemory(existing, 'the newest note', false);
    assert.ok(out.length <= MEMORY_CAP);
    assert.ok(out.endsWith('- the newest note'));
    assert.ok(!out.startsWith('- note 0'), 'the oldest notes are dropped');
    assert.ok(!/^[^-]/.test(out), 'memory still starts on a whole note, not a partial line');
  });
});
