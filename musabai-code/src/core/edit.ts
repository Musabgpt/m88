export class EditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EditError';
  }
}

export interface EditResult {
  content: string;
  replacements: number;
  /** 1-based line of the first change. */
  line: number;
  fuzzy?: 'whitespace' | 'indentation' | 'unescaped';
}

const OMITTED_RE = /…\[\d+ characters of (?:this earlier value|output) omitted\]…/;
const PLACEHOLDER_RE =
  /^\s*(?:\/\/|#|--|\/\*|<!--|\{\/\*)\s*(?:\.{3}|…)\s*(?:existing|rest of|remaining|unchanged|other|previous|same as before|keep)[^\n]*$/im;

/** Refuses content that would write a context-saving placeholder into a real file. */
export function checkPlaceholders(text: string, original = ''): void {
  if (OMITTED_RE.test(text)) {
    throw new EditError('The text contains an "omitted" marker copied from shortened history. Read the file again and write the real content.');
  }
  const match = PLACEHOLDER_RE.exec(text);
  if (match && !original.includes(match[0].trim())) {
    throw new EditError(
      `The text contains the placeholder "${match[0].trim()}", which would be written literally. ` +
        'Include the complete code, or use edit_file with a small exact old_string instead.',
    );
  }
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let at = haystack.indexOf(needle);
  while (at !== -1) {
    count++;
    at = haystack.indexOf(needle, at + needle.length);
  }
  return count;
}

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

function leading(line: string): string {
  return /^[ \t]*/.exec(line)![0];
}

function findWindows(lines: string[], needle: string[], same: (a: string, b: string) => boolean): number[] {
  const hits: number[] = [];
  if (!needle.length || needle.length > lines.length) return hits;
  outer: for (let i = 0; i + needle.length <= lines.length; i++) {
    for (let j = 0; j < needle.length; j++) if (!same(lines[i + j], needle[j])) continue outer;
    hits.push(i);
  }
  return hits;
}

function reindent(newLines: string[], from: string, to: string): string[] {
  if (from === to) return newLines;
  return newLines.map((line) => {
    if (!line.trim()) return line;
    if (to.startsWith(from)) return to.slice(from.length) + line;
    if (from.startsWith(to)) {
      const extra = from.slice(to.length);
      return line.startsWith(extra) ? line.slice(extra.length) : line.replace(/^[ \t]+/, (ws) => ws.slice(Math.min(ws.length, extra.length)));
    }
    return line.startsWith(from) ? to + line.slice(from.length) : line;
  });
}

function closestHint(content: string, oldString: string): string {
  const lines = content.split('\n');
  const probe = oldString.split('\n').map((l) => l.trim()).find((l) => l.length > 2);
  if (!probe) return '';
  let best = -1;
  let bestScore = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line === probe) {
      best = i;
      break;
    }
    const a = new Set(probe.split(/\W+/).filter(Boolean));
    const b = line.split(/\W+/).filter(Boolean);
    const score = b.filter((w) => a.has(w)).length / Math.max(a.size, 1);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  if (best < 0 || (bestScore < 0.5 && lines[best].trim() !== probe)) return '';
  const start = Math.max(0, best - 2);
  const snippet = lines
    .slice(start, best + 6)
    .map((l, k) => `${String(start + k + 1).padStart(5)}  ${l}`)
    .join('\n');
  return `\nThe closest text in the file (line ${best + 1}):\n${snippet}`;
}

export function applyEdit(original: string, oldString: string, newString: string, replaceAll = false): EditResult {
  const crlfCount = (original.match(/\r\n/g) || []).length;
  const crlf = crlfCount > 0 && crlfCount >= (original.match(/\n/g) || []).length - crlfCount;
  const content = original.replace(/\r\n/g, '\n');
  let oldText = String(oldString ?? '').replace(/\r\n/g, '\n');
  let newText = String(newString ?? '').replace(/\r\n/g, '\n');
  const finish = (text: string, result: Omit<EditResult, 'content'>): EditResult => ({
    content: crlf ? text.replace(/\n/g, '\r\n') : text,
    ...result,
  });

  checkPlaceholders(newText, oldText);
  if (oldText === newText) throw new EditError('old_string and new_string are identical: nothing would change.');
  if (!oldText) {
    if (!content.trim()) return finish(newText, { replacements: 1, line: 1 });
    throw new EditError('old_string is empty. Give the exact text to replace (or use write_file to create a new file).');
  }

  const exact = countOccurrences(content, oldText);
  if (exact === 1 || (exact > 1 && replaceAll)) {
    const at = content.indexOf(oldText);
    const updated = replaceAll ? content.split(oldText).join(newText) : content.slice(0, at) + newText + content.slice(at + oldText.length);
    return finish(updated, { replacements: replaceAll ? exact : 1, line: lineOf(content, at) });
  }
  if (exact > 1) {
    throw new EditError(
      `old_string appears ${exact} times in the file. Include more surrounding lines so it is unique, or set replace_all to change every occurrence.`,
    );
  }

  const lines = content.split('\n');
  const oldLines = oldText.replace(/\n$/, '').split('\n');
  const newLines = newText.replace(/\n$/, '').split('\n');
  const tryWindows = (same: (a: string, b: string) => boolean, kind: EditResult['fuzzy'], indent: boolean): EditResult | undefined => {
    const hits = findWindows(lines, oldLines, same);
    if (!hits.length) return undefined;
    if (hits.length > 1 && !replaceAll) {
      throw new EditError(`old_string matches ${hits.length} places (ignoring whitespace). Include more surrounding lines so it is unique.`);
    }
    const out = [...lines];
    for (const start of [...hits].reverse()) {
      const firstOld = oldLines.find((l) => l.trim()) ?? '';
      const firstFile = out.slice(start, start + oldLines.length).find((l) => l.trim()) ?? '';
      const replacement = indent ? reindent(newLines, leading(firstOld), leading(firstFile)) : newLines;
      out.splice(start, oldLines.length, ...replacement);
    }
    return finish(out.join('\n'), { replacements: hits.length, line: hits[0] + 1, fuzzy: kind });
  };

  const fuzzy =
    tryWindows((a, b) => a.trimEnd() === b.trimEnd(), 'whitespace', false) ??
    tryWindows((a, b) => a.trim() === b.trim(), 'indentation', true);
  if (fuzzy) return fuzzy;

  if (!oldText.includes('\n') && /\\n|\\t|\\"/.test(oldText)) {
    const unescape = (s: string) => s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"');
    oldText = unescape(oldText);
    newText = unescape(newText);
    if (countOccurrences(content, oldText) === 1) {
      const at = content.indexOf(oldText);
      return finish(content.slice(0, at) + newText + content.slice(at + oldText.length), { replacements: 1, line: lineOf(content, at), fuzzy: 'unescaped' });
    }
  }

  throw new EditError(`old_string was not found in the file. Read the file again and copy the exact current text.${closestHint(content, oldText)}`);
}

export function applyEdits(original: string, edits: { old_string: string; new_string: string; replace_all?: boolean }[]): EditResult {
  if (!edits.length) throw new EditError('edits is empty.');
  let content = original;
  let replacements = 0;
  let line = Number.MAX_SAFE_INTEGER;
  edits.forEach((edit, index) => {
    try {
      const result = applyEdit(content, edit.old_string, edit.new_string, Boolean(edit.replace_all));
      content = result.content;
      replacements += result.replacements;
      line = Math.min(line, result.line);
    } catch (error) {
      throw new EditError(`Edit ${index + 1} of ${edits.length} failed (no edit was applied): ${(error as Error).message}`);
    }
  });
  return { content, replacements, line: line === Number.MAX_SAFE_INTEGER ? 1 : line };
}
