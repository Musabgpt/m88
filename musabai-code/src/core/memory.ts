import { open, stat } from 'node:fs/promises';
import path from 'node:path';
import { realInside } from './util';

/** Where the agent's durable per-project notes live, read into every system prompt's <memory> block. */
export const MEMORY_FILE = path.join('.musabai', 'memory.md');

/** The most memory we keep; older notes are dropped so the prompt budget stays bounded. */
export const MEMORY_CAP = 8000;

/** The longest single note: a note is one short fact, never a document. */
export const NOTE_CAP = 1000;

/**
 * Reads the project memory for the <memory> prompt block. Missing or empty file → undefined.
 * Only a regular file inside the project is read (a symlink to another file of the laptop is ignored), and at
 * most the newest MEMORY_CAP characters of it, however large the file has grown.
 */
export async function readMemory(root: string): Promise<string | undefined> {
  const file = path.join(root, MEMORY_FILE);
  try {
    const info = await stat(file);
    if (!info.isFile() || !(await realInside(root, file))) return undefined;
    // UTF-8 needs at most 4 bytes a character: this many bytes from the end always hold MEMORY_CAP characters.
    const bytes = Math.min(info.size, MEMORY_CAP * 4);
    const handle = await open(file, 'r');
    let text: string;
    try {
      const buffer = Buffer.alloc(bytes);
      const { bytesRead } = await handle.read(buffer, 0, bytes, info.size - bytes);
      text = buffer.subarray(0, bytesRead).toString('utf8');
    } finally {
      await handle.close();
    }
    if (info.size > bytes) text = text.slice(text.indexOf('\n') + 1);
    text = text.trim();
    if (text.length > MEMORY_CAP) text = newestNotes(text, MEMORY_CAP).body;
    return text || undefined;
  } catch {
    return undefined;
  }
}

/** The newest whole lines of `text` that fit in `cap` characters, and how many older lines did not. */
function newestNotes(text: string, cap: number): { body: string; dropped: number } {
  const lines = text.split('\n');
  let size = 0;
  let start = lines.length;
  while (start > 0 && size + lines[start - 1].length + (start === lines.length ? 0 : 1) <= cap) {
    size += lines[start - 1].length + (start === lines.length ? 0 : 1);
    start--;
  }
  return { body: lines.slice(start).join('\n').trim(), dropped: lines.slice(0, start).filter((l) => l.trim()).length };
}

export class MemoryError extends Error {}

/**
 * Appends a note to, or replaces, an existing memory body, keeping it under MEMORY_CAP by dropping the oldest
 * whole notes (never part of one). A note longer than NOTE_CAP, or a replacement longer than MEMORY_CAP, is refused
 * rather than cut, so nothing is lost silently.
 */
export function composeMemory(existing: string, text: string, replace: boolean): { body: string; dropped: number } {
  const note = text.trim();
  if (replace) {
    if (note.length > MEMORY_CAP) throw new MemoryError(`The new memory is ${note.length} characters; the limit is ${MEMORY_CAP}. Shorten it and try again.`);
    return { body: note, dropped: 0 };
  }
  const line = `- ${note.replace(/\s*\n\s*/g, ' ')}`;
  if (line.length > NOTE_CAP) throw new MemoryError(`The note is ${line.length} characters; one note may have at most ${NOTE_CAP}. Save one short fact per note.`);
  const out = `${existing.trim()}${existing.trim() ? '\n' : ''}${line}`;
  return out.length > MEMORY_CAP ? newestNotes(out, MEMORY_CAP) : { body: out, dropped: 0 };
}
