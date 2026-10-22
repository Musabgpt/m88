import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** Where the agent's durable per-project notes live, read into every system prompt's <memory> block. */
export const MEMORY_FILE = path.join('.musabai', 'memory.md');

/** The most memory we keep; older notes are dropped so the prompt budget stays bounded. */
export const MEMORY_CAP = 8000;

/** Reads the project memory for the <memory> prompt block. Missing or empty file → undefined. */
export async function readMemory(root: string): Promise<string | undefined> {
  try {
    const text = await readFile(path.join(root, MEMORY_FILE), 'utf8');
    return text.trim() || undefined;
  } catch {
    return undefined;
  }
}

/** Appends a note to, or replaces, an existing memory body, keeping it under MEMORY_CAP. */
export function composeMemory(existing: string, text: string, replace: boolean): string {
  const note = text.trim();
  let out = replace ? note : `${existing.trim()}${existing.trim() ? '\n' : ''}- ${note.replace(/\s*\n\s*/g, ' ')}`;
  out = out.trim();
  if (out.length > MEMORY_CAP) {
    out = out.slice(out.length - MEMORY_CAP);
    const nl = out.indexOf('\n');
    if (nl >= 0) out = out.slice(nl + 1); // drop the partial first line so memory stays whole notes
  }
  return out;
}
