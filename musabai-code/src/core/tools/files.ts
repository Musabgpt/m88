import path from 'node:path';
import { relPath, resolvePath } from '../util';
import { type Tool, ToolError, bool, num, str } from './types';

const MAX_READ_LINES = 600;
const MAX_LINE_CHARS = 2000;

export const readFile: Tool = {
  name: 'read_file',
  category: 'files',
  readOnly: true,
  description:
    'Read a text file of the project (or an absolute path). Returns numbered lines like "  42| code"; the numbers are not part of the file. ' +
    'Reads up to 600 lines per call: use offset and limit to page through large files. Read a file before you edit it.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path, relative to the workspace root.' },
      offset: { type: 'integer', description: 'First line to read (1-based). Default 1.' },
      limit: { type: 'integer', description: 'Number of lines to read. Default 600.' },
    },
    required: ['path'],
  },
  title: (a) => `Reading ${a.path}`,
  async execute(args, ctx) {
    const abs = resolvePath(ctx.root, str(args, 'path'));
    const rel = relPath(ctx.root, abs);
    const info = await ctx.host.stat(abs);
    if (!info) throw new ToolError(`${rel} does not exist. Use file_search to find the right path.`);
    if (info.type === 'dir') throw new ToolError(`${rel} is a directory. Use list_dir.`);
    if (info.size > 5_000_000) throw new ToolError(`${rel} is ${(info.size / 1e6).toFixed(1)} MB: too large to read. Use grep_search in it.`);
    const text = await ctx.host.readText(abs);
    if (text === undefined) throw new ToolError(`${rel} does not exist.`);
    const lines = text.split('\n');
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    const offset = num(args, 'offset', 1, 1);
    const limit = num(args, 'limit', MAX_READ_LINES, 1, MAX_READ_LINES);
    const start = Math.min(offset, Math.max(lines.length, 1));
    const end = Math.min(lines.length, start + limit - 1);
    const width = String(end).length;
    const body = lines
      .slice(start - 1, end)
      .map((line, i) => `${String(start + i).padStart(width)}| ${line.length > MAX_LINE_CHARS ? `${line.slice(0, MAX_LINE_CHARS)}…` : line}`)
      .join('\n');
    ctx.touched.add(abs);
    const more = end < lines.length ? `\n(${lines.length - end} more lines: read again with offset=${end + 1})` : '';
    const header = lines.length === 0 ? `${rel} is empty.` : `${rel} — lines ${start}-${end} of ${lines.length}`;
    return {
      ok: true,
      content: `${header}\n${body}${more}`,
      summary: lines.length ? `Read ${rel} L${start}-${end}` : `Read ${rel} (empty)`,
      meta: { path: abs, rel, startLine: start, endLine: end },
    };
  },
};

export const listDir: Tool = {
  name: 'list_dir',
  category: 'files',
  readOnly: true,
  description: 'List a directory as a tree (directories end with /). Skips .git, node_modules and build output.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Directory, relative to the workspace root. Default ".".' },
      depth: { type: 'integer', description: 'How many levels to show, 1-4. Default 2.' },
    },
  },
  title: (a) => `Listing ${a.path || '.'}`,
  async execute(args, ctx) {
    const abs = resolvePath(ctx.root, str(args, 'path', false) || '.');
    const rel = relPath(ctx.root, abs);
    const depth = num(args, 'depth', 2, 1, 4);
    const info = await ctx.host.stat(abs);
    if (!info || info.type !== 'dir') throw new ToolError(`${rel} is not a directory.`);
    const skip = new Set(['.git', 'node_modules', '__pycache__', '.venv', 'venv', 'dist', 'build', 'out', '.next', 'target', '.gradle', '.cache', 'coverage']);
    const lines: string[] = [];
    let count = 0;
    const walk = async (dir: string, level: number, indent: string) => {
      let entries = await ctx.host.readDir(dir).catch(() => []);
      entries = entries.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
      for (const e of entries) {
        if (count >= 400) return;
        count++;
        if (e.type === 'dir') {
          const skipped = skip.has(e.name);
          lines.push(`${indent}${e.name}/${skipped ? ' (skipped)' : ''}`);
          if (!skipped && level < depth) await walk(path.join(dir, e.name), level + 1, `${indent}  `);
        } else {
          lines.push(`${indent}${e.name}`);
        }
      }
    };
    await walk(abs, 1, '');
    if (count >= 400) lines.push('… (listing truncated at 400 entries; list a subdirectory)');
    return { ok: true, content: `${rel}/\n${lines.join('\n') || '(empty)'}`, summary: rel === '.' ? 'Listed the project folder' : `Listed ${rel}/`, meta: { path: abs } };
  },
};

export const fileSearch: Tool = {
  name: 'file_search',
  category: 'search',
  readOnly: true,
  description: 'Find files by name: a part of the name ("user_service") or a glob ("**/*.test.ts", "src/**/config.*"). Respects .gitignore.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Part of a file name, or a glob pattern.' },
      limit: { type: 'integer', description: 'Maximum results. Default 50.' },
    },
    required: ['query'],
  },
  title: (a) => `Searching files for ${a.query}`,
  async execute(args, ctx) {
    const query = str(args, 'query').trim();
    const limit = num(args, 'limit', 50, 1, 500);
    let files: string[];
    if (/[*?{[]/.test(query)) {
      files = await ctx.host.listFiles({ glob: query, limit });
    } else {
      const q = query.toLowerCase();
      const all = await ctx.host.listFiles({ limit: 100_000 });
      files = all
        .filter((f) => f.toLowerCase().includes(q))
        .sort((a, b) => {
          const an = path.basename(a).toLowerCase();
          const bn = path.basename(b).toLowerCase();
          const score = (name: string, full: string) => (name === q ? 0 : name.startsWith(q) ? 1 : name.includes(q) ? 2 : 3) * 1000 + full.length;
          return score(an, a) - score(bn, b);
        })
        .slice(0, limit);
    }
    return {
      ok: true,
      content: files.length ? files.join('\n') : `No files match "${query}".`,
      summary: `Found ${files.length} file${files.length === 1 ? '' : 's'} for "${query}"`,
    };
  },
};

export const grepSearch: Tool = {
  name: 'grep_search',
  category: 'search',
  readOnly: true,
  description:
    'Search file contents with a regular expression (ripgrep syntax), for exact symbols, strings or error messages. ' +
    'Use codebase_search instead for questions about behaviour or concepts.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Regex to search for. Escape special characters (\\. \\( \\[) for literal text, or set fixed_strings.' },
      path: { type: 'string', description: 'Directory or file to search in. Default: the whole project.' },
      include: { type: 'string', description: 'Comma-separated globs of files to include, e.g. "*.ts,*.tsx".' },
      exclude: { type: 'string', description: 'Comma-separated globs to skip.' },
      case_sensitive: { type: 'boolean', description: 'Default false.' },
      fixed_strings: { type: 'boolean', description: 'Treat query as plain text. Default false.' },
      context: { type: 'integer', description: 'Lines of context around each match, 0-3. Default 0.' },
    },
    required: ['query'],
  },
  title: (a) => `Grepping for ${a.query}`,
  async execute(args, ctx) {
    const query = str(args, 'query');
    const matches = await ctx.host.grep({
      pattern: query,
      path: str(args, 'path', false) || undefined,
      include: str(args, 'include', false) || undefined,
      exclude: str(args, 'exclude', false) || undefined,
      caseSensitive: bool(args, 'case_sensitive'),
      fixedStrings: bool(args, 'fixed_strings'),
      context: num(args, 'context', 0, 0, 3),
      maxResults: 120,
    });
    if (!matches.length) return { ok: true, content: `No matches for /${query}/.`, summary: `No matches for ${query}` };
    const byFile = new Map<string, string[]>();
    for (const m of matches) {
      const list = byFile.get(m.path) ?? [];
      list.push(`${String(m.line).padStart(5)}${m.context ? '-' : ':'} ${m.text}`);
      byFile.set(m.path, list);
    }
    const hits = matches.filter((m) => !m.context).length;
    const body = [...byFile.entries()].map(([file, lines]) => `${file}\n${lines.join('\n')}`).join('\n\n');
    return {
      ok: true,
      content: `${hits} match${hits === 1 ? '' : 'es'} in ${byFile.size} file${byFile.size === 1 ? '' : 's'}${hits >= 120 ? ' (limit reached: narrow the search)' : ''}\n${body}`,
      summary: `Grepped ${query}: ${hits} match${hits === 1 ? '' : 'es'} in ${byFile.size} file${byFile.size === 1 ? '' : 's'}`,
    };
  },
};

export const codebaseSearch: Tool = {
  name: 'codebase_search',
  category: 'search',
  readOnly: true,
  description:
    'Search the indexed codebase by meaning: describe what you are looking for in words ("where are user sessions validated?", ' +
    '"function that formats prices"). Returns the most relevant code snippets with file paths and line ranges.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'What to find, in natural language with likely identifiers.' },
      limit: { type: 'integer', description: 'Number of snippets. Default 8.' },
    },
    required: ['query'],
  },
  title: (a) => `Searching codebase for "${a.query}"`,
  async execute(args, ctx) {
    const query = str(args, 'query');
    const limit = num(args, 'limit', 8, 1, 20);
    const search = ctx.index?.search.bind(ctx.index) ?? ctx.host.codebaseSearch?.bind(ctx.host);
    if (!search) throw new ToolError('The codebase index is not available; use grep_search and file_search.');
    const hits = await search(query, limit);
    if (!hits.length) return { ok: true, content: `Nothing relevant found for "${query}". Try grep_search with exact identifiers.`, summary: `Searched codebase: nothing for "${query}"` };
    const body = hits
      .map((h) => {
        const lines = h.text.split('\n').map((l, i) => `${String(h.startLine + i).padStart(5)}| ${l}`);
        return `${h.path}:${h.startLine}-${h.endLine}\n${lines.join('\n')}`;
      })
      .join('\n\n');
    return { ok: true, content: body, summary: `Searched codebase for "${query}": ${hits.length} results`, meta: { files: [...new Set(hits.map((h) => h.path))] } };
  },
};
