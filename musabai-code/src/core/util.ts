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

/** Minimal glob → RegExp for paths with '/' separators: **, *, ?, {a,b}, [abc]. */
export function globToRegExp(glob: string): RegExp {
  let g = glob.trim().replace(/\\/g, '/');
  if (g.startsWith('./')) g = g.slice(2);
  // A bare pattern without a slash matches at any depth, like .gitignore and rg -g.
  if (!g.includes('/')) g = `**/${g}`;
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
    else if (c === '{') {
      inGroup++;
      re += '(?:';
    } else if (c === '}' && inGroup) {
      inGroup--;
      re += ')';
    } else if (c === ',' && inGroup) re += '|';
    else if (c === '[') {
      const end = g.indexOf(']', i);
      if (end > i) {
        re += `[${g.slice(i + 1, end).replace(/^!/, '^').replace(/\\/g, '\\\\')}]`;
        i = end;
      } else re += '\\[';
    } else re += /[.+^$()|\\]/.test(c) ? `\\${c}` : c;
  }
  return new RegExp(`^${re}$`);
}

export function matchesGlob(relative: string, glob: string | string[]): boolean {
  const globs = Array.isArray(glob) ? glob : [glob];
  return globs.some((g) => g && globToRegExp(g).test(relative));
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
