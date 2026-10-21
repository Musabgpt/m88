import path from 'node:path';
import { branchChanges, commitDiff, git } from './git';
import type { AgentHost } from './host';
import type { IndexLike } from './tools/types';
import { relPath, resolvePath, truncateMiddle } from './util';
import { webFetch, webSearch } from './web';

export type Mention =
  | { type: 'file'; path: string; startLine?: number; endLine?: number }
  | { type: 'folder'; path: string }
  | { type: 'code'; path: string; name: string; startLine: number; endLine: number }
  | { type: 'git'; value: string }
  | { type: 'web'; query: string }
  | { type: 'url'; url: string }
  | { type: 'terminal'; text: string; name?: string }
  | { type: 'problems'; text: string }
  | { type: 'rule'; name: string }
  | { type: 'codebase'; query: string }
  | { type: 'image'; dataUrl: string; name?: string }
  | { type: 'chat'; title: string; text: string }
  | { type: 'text'; title: string; text: string };

export interface ResolvedContext {
  context: string;
  images: string[];
  files: string[];
  rules: string[];
}

export interface MentionDeps {
  host: Pick<AgentHost, 'root' | 'readText' | 'stat' | 'listFiles'>;
  index?: IndexLike;
  fetchImpl?: typeof fetch;
}

const FILE_CHARS = 60_000;

function numbered(text: string, start = 1): string {
  const lines = text.split('\n');
  const width = String(start + lines.length - 1).length;
  return lines.map((l, i) => `${String(start + i).padStart(width)}| ${l}`).join('\n');
}

function block(kind: string, attrs: Record<string, string | number | undefined>, body: string): string {
  const a = Object.entries(attrs)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => ` ${k}="${String(v).replace(/"/g, '&quot;')}"`)
    .join('');
  return `<attached kind="${kind}"${a}>\n${body}\n</attached>`;
}

export function mentionLabel(m: Mention): string {
  switch (m.type) {
    case 'file':
      return m.startLine ? `${path.basename(m.path)}:${m.startLine}-${m.endLine}` : path.basename(m.path);
    case 'folder':
      return `${path.basename(m.path) || m.path}/`;
    case 'code':
      return m.name;
    case 'git':
      return m.value === 'working' ? 'Git: uncommitted changes' : m.value === 'staged' ? 'Git: staged' : m.value === 'branch' ? 'Git: branch diff' : `Commit ${m.value.slice(0, 7)}`;
    case 'web':
      return `Web: ${m.query}`;
    case 'url':
      return m.url.replace(/^https?:\/\//, '').slice(0, 40);
    case 'terminal':
      return m.name || 'Terminal';
    case 'problems':
      return 'Problems';
    case 'rule':
      return `Rule: ${m.name}`;
    case 'codebase':
      return 'Codebase';
    case 'image':
      return m.name || 'Image';
    case 'chat':
      return `Chat: ${m.title}`;
    case 'text':
      return m.title;
  }
}

export async function resolveMentions(mentions: Mention[], deps: MentionDeps, request = ''): Promise<ResolvedContext> {
  const parts: string[] = [];
  const images: string[] = [];
  const files: string[] = [];
  const rules: string[] = [];
  const root = deps.host.root;
  for (const m of mentions) {
    try {
      switch (m.type) {
        case 'file': {
          const abs = resolvePath(root, m.path);
          const text = await deps.host.readText(abs);
          if (text === undefined) {
            parts.push(block('file', { path: relPath(root, abs) }, '(file not found)'));
            break;
          }
          files.push(relPath(root, abs));
          if (m.startLine && m.endLine) {
            const lines = text.split('\n').slice(m.startLine - 1, m.endLine);
            parts.push(block('selection', { path: relPath(root, abs), lines: `${m.startLine}-${m.endLine}` }, numbered(lines.join('\n'), m.startLine)));
          } else {
            parts.push(block('file', { path: relPath(root, abs) }, truncateMiddle(numbered(text), FILE_CHARS, 'file')));
          }
          break;
        }
        case 'code': {
          const abs = resolvePath(root, m.path);
          const text = (await deps.host.readText(abs)) ?? '';
          const lines = text.split('\n').slice(m.startLine - 1, m.endLine);
          files.push(relPath(root, abs));
          parts.push(block('code', { path: relPath(root, abs), symbol: m.name, lines: `${m.startLine}-${m.endLine}` }, numbered(lines.join('\n'), m.startLine)));
          break;
        }
        case 'folder': {
          const rel = relPath(root, resolvePath(root, m.path));
          const list = await deps.host.listFiles({ under: rel === '.' ? undefined : rel, limit: 300 });
          files.push(...list.slice(0, 50));
          parts.push(block('folder', { path: rel }, list.join('\n') + (list.length >= 300 ? '\n… (more files)' : '')));
          break;
        }
        case 'git': {
          let body: string;
          if (m.value === 'working' || m.value === 'staged') body = (await commitDiff(root)).diff;
          else if (m.value === 'branch') {
            const c = await branchChanges(root);
            body = `Commits since ${c.base}:\n${c.log}\n\n${c.diff}`;
          } else body = (await git(root, ['show', '--stat', '--patch', m.value])).stdout;
          parts.push(block('git', { value: m.value }, truncateMiddle(body || '(no changes)', 40_000, 'diff')));
          break;
        }
        case 'web': {
          const results = await webSearch(m.query, deps.fetchImpl, 6);
          parts.push(block('web_search', { query: m.query }, results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join('\n') || '(no results)'));
          break;
        }
        case 'url': {
          const page = await webFetch(m.url, deps.fetchImpl, 30_000);
          parts.push(block('web_page', { url: page.url, title: page.title }, page.text));
          break;
        }
        case 'terminal':
          parts.push(block('terminal', { name: m.name }, truncateMiddle(m.text, 20_000, 'terminal output')));
          break;
        case 'problems':
          parts.push(block('problems', {}, m.text || '(no problems)'));
          break;
        case 'rule':
          rules.push(m.name);
          break;
        case 'codebase': {
          const hits = deps.index ? await deps.index.search(m.query || request, 8) : [];
          files.push(...hits.map((h) => h.path));
          parts.push(
            block('codebase_search', { query: m.query || request }, hits.map((h) => `${h.path}:${h.startLine}-${h.endLine}\n${numbered(h.text, h.startLine)}`).join('\n\n') || '(nothing relevant found)'),
          );
          break;
        }
        case 'image':
          images.push(m.dataUrl);
          break;
        case 'chat':
          parts.push(block('previous_chat', { title: m.title }, truncateMiddle(m.text, 20_000, 'chat')));
          break;
        case 'text':
          parts.push(block('note', { title: m.title }, m.text));
          break;
      }
    } catch (error) {
      parts.push(block(m.type, { error: (error as Error).message }, `(could not attach: ${(error as Error).message})`));
    }
  }
  return {
    context: parts.length ? `The user attached this context:\n${parts.join('\n')}` : '',
    images,
    files: [...new Set(files)],
    rules,
  };
}

/** @mentions typed as text (terminal agent): @path, @git, @staged, @branch, @codebase, @rule:name, @https://… */
export async function parseTextMentions(text: string, host: Pick<AgentHost, 'root' | 'stat'>): Promise<Mention[]> {
  const out: Mention[] = [];
  for (const match of text.matchAll(/(^|\s)@(\S+)/g)) {
    const token = match[2].replace(/[),.;:!?]+$/, '');
    if (token === 'git' || token === 'diff') out.push({ type: 'git', value: 'working' });
    else if (token === 'staged') out.push({ type: 'git', value: 'staged' });
    else if (token === 'branch') out.push({ type: 'git', value: 'branch' });
    else if (token === 'codebase') out.push({ type: 'codebase', query: text.replace(/@\S+/g, '').trim() });
    else if (token.startsWith('rule:')) out.push({ type: 'rule', name: token.slice(5) });
    else if (/^https?:\/\//.test(token)) out.push({ type: 'url', url: token });
    else {
      const info = await host.stat(resolvePath(host.root, token));
      if (info?.type === 'file') out.push({ type: 'file', path: token });
      else if (info?.type === 'dir') out.push({ type: 'folder', path: token });
    }
  }
  return out;
}
