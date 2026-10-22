import { realpath } from 'node:fs/promises';
import path from 'node:path';

/** Resolves a model-supplied path against the workspace; absolute paths are kept as given. */
export function resolvePath(root: string, input: string): string {
  let p = String(input || '').trim().replace(/^file:\/\//, '');
  if (p.startsWith('~/')) p = path.join(process.env.HOME || '/', p.slice(2));
  if (p === '' || p === '.') return path.resolve(root);
  return path.isAbsolute(p) ? path.normalize(p) : path.resolve(root, p);
}

export function isInside(root: string, abs: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(abs));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export function relPath(root: string, abs: string): string {
  return isInside(root, abs) ? path.relative(root, abs).split(path.sep).join('/') || '.' : abs;
}

/**
 * The real location of a path, symlinks resolved. A path that does not exist yet (a file about to be written)
 * resolves through its nearest existing parent.
 */
export async function realPathOf(abs: string): Promise<string> {
  const rest: string[] = [];
  let current = path.resolve(abs);
  for (;;) {
    try {
      return path.join(await realpath(current), ...rest);
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return path.resolve(abs);
      rest.unshift(path.basename(current));
      current = parent;
    }
  }
}

/** Like isInside, but where the path really is: a symlink inside the project that points outside it is outside. */
export async function realInside(root: string, abs: string): Promise<boolean> {
  return isInside(await realPathOf(root), await realPathOf(abs));
}

/** Splits "a,b,*.{ts,tsx}" into globs at the commas that are not inside {…} or […]. */
export function splitGlobList(value: string): string[] {
  const out: string[] = [];
  let current = '';
  let braces = 0;
  let bracket = false;
  for (const c of value) {
    if (c === '[' && !bracket) bracket = true;
    else if (c === ']' && bracket) bracket = false;
    else if (c === '{' && !bracket) braces++;
    else if (c === '}' && !bracket && braces) braces--;
    if (c === ',' && !braces && !bracket) {
      out.push(current);
      current = '';
    } else current += c;
  }
  out.push(current);
  return out.map((g) => g.trim()).filter(Boolean);
}

/** Minimal glob → RegExp for paths with '/' separators: **, *, ?, {a,b}, [abc]. Unbalanced braces are literal. */
export function globToRegExp(glob: string): RegExp {
  let g = glob.trim().replace(/\\/g, '/');
  if (g.startsWith('./')) g = g.slice(2);
  // A bare pattern without a slash matches at any depth, like .gitignore and rg -g.
  if (!g.includes('/')) g = `**/${g}`;
  // Braces that close become groups; any other brace is matched as the character itself.
  const groups = new Set<number>();
  const open: number[] = [];
  for (let i = 0; i < g.length; i++) {
    if (g[i] === '{') open.push(i);
    else if (g[i] === '}' && open.length) {
      groups.add(open.pop()!);
      groups.add(i);
    }
  }
  let re = '';
  let inGroup = 0;
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        const slash = g[i + 2] === '/';
        re += slash ? '(?:.*/)?' : '.*';
        i += slash ? 2 : 1;
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') re += '[^/]';
    else if (c === '{' && groups.has(i)) {
      inGroup++;
      re += '(?:';
    } else if (c === '}' && groups.has(i)) {
      inGroup--;
      re += ')';
    } else if (c === ',' && inGroup) re += '|';
    else if (c === '[') {
      const end = g.indexOf(']', i);
      if (end > i) {
        re += `[${g.slice(i + 1, end).replace(/^!/, '^').replace(/\\/g, '\\\\')}]`;
        i = end;
      } else re += '\\[';
    } else re += /[.+^$()|\\{}]/.test(c) ? `\\${c}` : c;
  }
  return new RegExp(`^${re}$`);
}

const globCache = new Map<string, RegExp | null>();

function compiledGlob(glob: string): RegExp | null {
  let re = globCache.get(glob);
  if (re === undefined) {
    try {
      re = globToRegExp(glob);
    } catch {
      // A pattern that still cannot compile matches nothing instead of failing the caller.
      re = null;
    }
    if (globCache.size > 500) globCache.clear();
    globCache.set(glob, re);
  }
  return re;
}

export function matchesGlob(relative: string, glob: string | string[]): boolean {
  const globs = Array.isArray(glob) ? glob : [glob];
  return globs.some((g) => Boolean(g) && compiledGlob(g)?.test(relative) === true);
}

/** Parses tool arguments, repairing only common syntax slips; never invents values. */
export function parseArgs(raw: string, truncated = false): Record<string, unknown> {
  const text = String(raw || '').trim() || '{}';
  const attempt = (s: string) => {
    const value = JSON.parse(s);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('arguments must be a JSON object');
    return value as Record<string, unknown>;
  };
  try {
    return attempt(text);
  } catch (error) {
    if (truncated) throw error;
    let fixed = text.replace(/^```(?:json)?\s*|\s*```$/g, '');
    fixed = fixed.replace(/,\s*([}\]])/g, '$1');
    try {
      return attempt(fixed);
    } catch {
      // Raw newlines and tabs inside strings are the most common slip of small models.
      let out = '';
      let inString = false;
      for (let i = 0; i < fixed.length; i++) {
        const c = fixed[i];
        if (c === '"' && fixed[i - 1] !== '\\') inString = !inString;
        if (inString && c === '\n') out += '\\n';
        else if (inString && c === '\t') out += '\\t';
        else if (inString && c === '\r') out += '';
        else out += c;
      }
      return attempt(out);
    }
  }
}

export function truncateMiddle(text: string, max: number, note = 'output'): string {
  if (text.length <= max) return text;
  const head = Math.floor(max * 0.35);
  const tail = max - head;
  return `${text.slice(0, head)}\n…[${text.length - max} characters of ${note} omitted]…\n${text.slice(-tail)}`;
}

export function clampLines(text: string, maxLines: number): { text: string; omitted: number } {
  const lines = text.split('\n');
  if (lines.length <= maxLines) return { text, omitted: 0 };
  return { text: lines.slice(0, maxLines).join('\n'), omitted: lines.length - maxLines };
}

export function isProbablyBinary(buffer: Uint8Array): boolean {
  const n = Math.min(buffer.length, 8000);
  for (let i = 0; i < n; i++) if (buffer[i] === 0) return true;
  return false;
}

export function newId(prefix = ''): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function slug(text: string, max = 40): string {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, max) || 'task'
  );
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True when release version `latest` (e.g. "v0.2.0") is newer than the installed `current`. Non-numeric or equal → false. */
export function isNewerVersion(latest: string, current: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map((n) => Number.parseInt(n, 10));
  const a = parse(latest);
  const b = parse(current);
  if (a.some(Number.isNaN) || b.some(Number.isNaN)) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}
