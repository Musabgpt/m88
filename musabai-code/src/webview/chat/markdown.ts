import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import dart from 'highlight.js/lib/languages/dart';
import diff from 'highlight.js/lib/languages/diff';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import go from 'highlight.js/lib/languages/go';
import ini from 'highlight.js/lib/languages/ini';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import markdownLang from 'highlight.js/lib/languages/markdown';
import php from 'highlight.js/lib/languages/php';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import shell from 'highlight.js/lib/languages/shell';
import sql from 'highlight.js/lib/languages/sql';
import swift from 'highlight.js/lib/languages/swift';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import { Marked, type Tokens } from 'marked';

const LANGS: Record<string, unknown> = {
  bash, c, cpp, csharp, css, dart, diff, dockerfile, go, ini, java, javascript, json, kotlin, markdown: markdownLang, php, python, ruby, rust, shell, sql, swift, typescript, xml, yaml,
};
for (const [name, lang] of Object.entries(LANGS)) hljs.registerLanguage(name, lang as Parameters<typeof hljs.registerLanguage>[1]);
const ALIASES: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript', ts: 'typescript', tsx: 'typescript', py: 'python', sh: 'bash',
  zsh: 'bash', console: 'shell', html: 'xml', vue: 'xml', svg: 'xml', yml: 'yaml', toml: 'ini', rs: 'rust', kt: 'kotlin', cs: 'csharp',
  'c++': 'cpp', h: 'c', hpp: 'cpp', rb: 'ruby', md: 'markdown', docker: 'dockerfile', patch: 'diff', jsonc: 'json',
};

export const RUNNABLE = new Set(['bash', 'sh', 'shell', 'zsh', 'console', 'terminal']);

export interface CodeBlockInfo {
  lang: string;
  file?: string;
}

/** ```ts src/app.ts, ```ts:src/app.ts and ```src/app.ts all name a target file for Apply. */
export function parseInfo(info: string): CodeBlockInfo {
  const raw = info.trim();
  if (!raw) return { lang: '' };
  const [first, ...rest] = raw.split(/\s+/);
  if (first.includes(':') && !first.includes('://')) {
    const [lang, file] = first.split(':', 2);
    return { lang: lang.toLowerCase(), file: file || undefined };
  }
  if (/[/.]/.test(first) && !rest.length && /\.\w+$/.test(first)) {
    const ext = first.split('.').pop()!.toLowerCase();
    return { lang: ALIASES[ext] ?? ext, file: first };
  }
  return { lang: first.toLowerCase(), file: rest.find((r) => /[/.]\w/.test(r)) };
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

export function highlight(code: string, lang: string): string {
  const name = ALIASES[lang] ?? lang;
  try {
    if (name && hljs.getLanguage(name)) return hljs.highlight(code, { language: name, ignoreIllegals: true }).value;
    if (code.length < 20_000) return hljs.highlightAuto(code, ['typescript', 'javascript', 'python', 'bash', 'json', 'css', 'xml']).value;
  } catch {
    // plain
  }
  return escapeHtml(code);
}

const blocks = new Map<string, { code: string; info: CodeBlockInfo }>();
let scope = 'x';
let counter = 0;

const marked = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    code(token: Tokens.Code) {
      const info = parseInfo(token.lang ?? '');
      const index = `${scope}:${counter++}`;
      blocks.set(index, { code: token.text, info });
      const label = info.file ? `${escapeHtml(info.file)}` : escapeHtml(info.lang || 'text');
      const run = RUNNABLE.has(info.lang) ? `<button class="cb-btn" data-action="run" data-block="${index}" title="Run in terminal"><i class="codicon codicon-play"></i></button>` : '';
      return (
        `<div class="codeblock" data-block="${index}"><div class="cb-head"><span class="cb-lang">${label}</span><span class="cb-actions">` +
        `${run}<button class="cb-btn" data-action="copy" data-block="${index}" title="Copy"><i class="codicon codicon-copy"></i></button>` +
        `<button class="cb-btn" data-action="insert" data-block="${index}" title="Insert at cursor"><i class="codicon codicon-insert"></i></button>` +
        `<button class="cb-btn cb-apply" data-action="apply" data-block="${index}" title="Apply to file"><i class="codicon codicon-check"></i> Apply</button>` +
        `</span></div><pre><code class="hljs">${highlight(token.text, info.lang)}</code></pre></div>`
      );
    },
    html(token: Tokens.HTML | Tokens.Tag) {
      return escapeHtml(token.text);
    },
  },
});

/** Markdown from a model, rendered safely: raw HTML is escaped and the result is sanitized. */
export function renderMarkdown(text: string, key = 'x'): string {
  for (const k of blocks.keys()) if (k.startsWith(`${key}:`)) blocks.delete(k);
  scope = key;
  counter = 0;
  const html = marked.parse(text, { async: false }) as string;
  return DOMPurify.sanitize(html, {
    ALLOWED_ATTR: ['href', 'title', 'class', 'data-action', 'data-block', 'colspan', 'rowspan', 'align', 'start', 'dir'],
    FORBID_TAGS: ['style', 'form', 'input', 'textarea', 'select', 'iframe', 'object', 'embed'],
  });
}

export function codeBlock(key: string): { code: string; info: CodeBlockInfo } | undefined {
  return blocks.get(key);
}

export function forgetBlocks(prefix: string): void {
  for (const k of blocks.keys()) if (k.startsWith(prefix)) blocks.delete(k);
}
