import { createTwoFilesPatch, diffArrays } from 'diff';

export interface Hunk {
  /** 0-based index of the first replaced line in the old text. */
  oldStart: number;
  oldLines: string[];
  /** 0-based index of the first line in the new text. */
  newStart: number;
  newLines: string[];
}

/** Splits text into lines that keep their terminators, so joining them restores the text exactly. */
export function splitLines(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

export function hunks(before: string, after: string): Hunk[] {
  const a = splitLines(before);
  const b = splitLines(after);
  const out: Hunk[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  let current: Hunk | undefined;
  for (const part of diffArrays(a, b)) {
    const count = part.value.length;
    if (part.added || part.removed) {
      current ??= { oldStart: oldIndex, oldLines: [], newStart: newIndex, newLines: [] };
      if (part.removed) {
        current.oldLines.push(...part.value);
        oldIndex += count;
      } else {
        current.newLines.push(...part.value);
        newIndex += count;
      }
    } else {
      if (current) out.push(current);
      current = undefined;
      oldIndex += count;
      newIndex += count;
    }
  }
  if (current) out.push(current);
  return out;
}

export function stats(before: string, after: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const h of hunks(before, after)) {
    added += h.newLines.length;
    removed += h.oldLines.length;
  }
  return { added, removed };
}

/** The current text with one hunk put back to its old lines. */
export function revertHunk(current: string, hunk: Hunk): string {
  const lines = splitLines(current);
  lines.splice(hunk.newStart, hunk.newLines.length, ...hunk.oldLines);
  return lines.join('');
}

/** The baseline with one hunk taken over from the new text. */
export function acceptHunk(baseline: string, hunk: Hunk): string {
  const lines = splitLines(baseline);
  lines.splice(hunk.oldStart, hunk.oldLines.length, ...hunk.newLines);
  return lines.join('');
}

export function unifiedDiff(file: string, before: string, after: string, context = 3): string {
  const lines = createTwoFilesPatch(`a/${file}`, `b/${file}`, before, after, '', '', { context }).split('\n');
  const start = lines.findIndex((l) => l.startsWith('--- '));
  return lines
    .slice(Math.max(start, 0))
    .map((l) => (l.startsWith('--- ') || l.startsWith('+++ ') ? l.replace(/\t$/, '') : l))
    .join('\n')
    .trimEnd();
}
