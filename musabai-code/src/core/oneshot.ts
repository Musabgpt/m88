import { COMMIT_SYSTEM, INLINE_EDIT_SYSTEM, PR_SYSTEM, REVIEW_SYSTEM, TERMINAL_COMMAND_SYSTEM } from './agent/prompts';
import { branchChanges, commitDiff, git } from './git';
import type { ProviderPool } from './providers/pool';
import type { ModelSpec } from './types';
import { truncateMiddle } from './util';

export async function complete(
  pool: ProviderPool,
  modelId: string,
  system: string,
  user: string,
  options: { signal?: AbortSignal; maxTokens?: number; onText?: (text: string) => void; temperature?: number } = {},
): Promise<{ text: string; spec: ModelSpec }> {
  let streamed = '';
  const result = await pool.chat(
    modelId,
    {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      maxTokens: options.maxTokens ?? 2048,
      temperature: options.temperature ?? 0.2,
      signal: options.signal,
      onEvent: (event) => {
        if (event.type === 'text') {
          streamed += event.text;
          options.onText?.(streamed);
        }
      },
    },
    { onReset: () => (streamed = '') },
  );
  return { text: result.content.trim(), spec: result.spec };
}

export function extractCodeBlock(text: string): string {
  const fences = [...text.matchAll(/```[^\n`]*\n([\s\S]*?)```/g)];
  if (fences.length) return fences.sort((a, b) => b[1].length - a[1].length)[0][1].replace(/\n$/, '');
  const open = /```[^\n`]*\n([\s\S]*)$/.exec(text);
  if (open) return open[1].replace(/\n$/, '');
  return text.trim();
}

export function parseJsonLoose<T = any>(text: string): T | undefined {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  const candidates = [cleaned];
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) candidates.push(cleaned.slice(start, end + 1));
  for (const c of candidates) {
    try {
      return JSON.parse(c) as T;
    } catch {
      // next
    }
  }
  return undefined;
}

export async function commitMessage(pool: ProviderPool, modelId: string, root: string, signal?: AbortSignal): Promise<{ message: string; staged: boolean; files: string[] }> {
  const { diff, staged, files } = await commitDiff(root);
  if (!diff.trim()) throw new Error('There are no changes to commit.');
  const recent = (await git(root, ['log', '-8', '--format=%s'])).stdout.trim();
  const user = `${recent ? `Recent commit subjects (match their style):\n${recent}\n\n` : ''}Changes to commit:\n${truncateMiddle(diff, 30_000, 'diff')}`;
  const { text } = await complete(pool, modelId, COMMIT_SYSTEM, user, { signal, maxTokens: 400 });
  const message = text.replace(/^```\w*\n?|```$/g, '').replace(/^["']|["']$/g, '').trim();
  return { message, staged, files };
}

export async function pullRequestText(pool: ProviderPool, modelId: string, root: string, base?: string, signal?: AbortSignal): Promise<{ title: string; body: string; base: string }> {
  const changes = await branchChanges(root, base);
  if (!changes.diff.trim()) throw new Error(`This branch has no changes compared with ${changes.base}.`);
  const user = `Base branch: ${changes.base}\nCommits:\n${changes.log || '(none)'}\n\nFiles:\n${changes.stat}\n\nDiff:\n${truncateMiddle(changes.diff, 40_000, 'diff')}`;
  const { text } = await complete(pool, modelId, PR_SYSTEM, user, { signal, maxTokens: 1200 });
  const data = parseJsonLoose<{ title?: string; body?: string }>(text);
  const title = String(data?.title || changes.log.split('\n')[0]?.replace(/^\w+\s/, '') || 'Update').slice(0, 120);
  const body = String(data?.body || text);
  return { title, body: `${body}\n\n---\n_Description written by MusabAI Code with a free model._`, base: changes.base };
}

export interface ReviewFinding {
  file: string;
  line: number;
  severity: 'high' | 'medium' | 'low';
  title: string;
  explanation: string;
  suggestion: string;
}

export interface ReviewResult {
  summary: string;
  findings: ReviewFinding[];
  model: string;
}

/** Added lines per file of a unified diff: findings may only point at code the change touched. */
export function addedLines(diff: string): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  let file = '';
  let line = 0;
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++ ')) {
      file = raw.slice(4).replace(/^b\//, '').trim();
      if (file === '/dev/null') file = '';
      if (file && !out.has(file)) out.set(file, new Set());
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      line = Number(hunk[1]);
      continue;
    }
    if (!file || raw.startsWith('--- ')) continue;
    if (raw.startsWith('+')) {
      out.get(file)!.add(line);
      line++;
    } else if (raw.startsWith(' ')) line++;
  }
  return out;
}

export async function reviewDiff(pool: ProviderPool, modelId: string, diff: string, context = '', signal?: AbortSignal): Promise<ReviewResult> {
  if (!diff.trim()) return { summary: 'No changes to review.', findings: [], model: '' };
  const user = `${context ? `${context}\n\n` : ''}Diff to review:\n${truncateMiddle(diff, 60_000, 'diff')}`;
  const { text, spec } = await complete(pool, modelId, REVIEW_SYSTEM, user, { signal, maxTokens: 3000, temperature: 0.1 });
  const data = parseJsonLoose<{ summary?: string; findings?: Partial<ReviewFinding>[] }>(text);
  const added = addedLines(diff);
  const findings: ReviewFinding[] = [];
  for (const f of data?.findings ?? []) {
    const file = String(f.file || '').replace(/^b\//, '');
    const lines = added.get(file);
    if (!lines) continue;
    let line = Number(f.line) || 0;
    if (!lines.has(line)) {
      // Snap to the nearest added line of that file, so a comment always lands on changed code.
      const sorted = [...lines].sort((a, b) => Math.abs(a - line) - Math.abs(b - line));
      if (!sorted.length) continue;
      line = sorted[0];
    }
    findings.push({
      file,
      line,
      severity: f.severity === 'high' || f.severity === 'low' ? f.severity : 'medium',
      title: String(f.title || 'Possible issue').slice(0, 200),
      explanation: String(f.explanation || ''),
      suggestion: String(f.suggestion || ''),
    });
  }
  return { summary: String(data?.summary || (data ? '' : text.slice(0, 500))), findings, model: spec.name };
}

export function reviewMarkdown(result: ReviewResult): string {
  const icon = { high: '🔴', medium: '🟠', low: '🟡' };
  const lines = [`### MusabAI Bugbot review`, '', result.summary || (result.findings.length ? '' : 'No problems found.')];
  for (const f of result.findings) {
    lines.push('', `${icon[f.severity]} **${f.title}** — \`${f.file}:${f.line}\``, '', f.explanation);
    if (f.suggestion) lines.push('', `Suggestion: ${f.suggestion}`);
  }
  if (result.model) lines.push('', `_Reviewed with ${result.model} (free)._`);
  return lines.join('\n');
}

export interface InlineEditRequest {
  file: string;
  language: string;
  before: string;
  selection: string;
  after: string;
  instruction: string;
}

export async function inlineEdit(pool: ProviderPool, modelId: string, req: InlineEditRequest, signal?: AbortSignal, onText?: (partial: string) => void): Promise<string> {
  const user =
    `File: ${req.file} (${req.language})\n\n` +
    `<code_before>\n${req.before.slice(-6000)}\n</code_before>\n` +
    `<selection>\n${req.selection}\n</selection>\n` +
    `<code_after>\n${req.after.slice(0, 3000)}\n</code_after>\n\n` +
    `Instruction: ${req.instruction}\n\nReply with the replacement for <selection> only, in one code block.`;
  const { text } = await complete(pool, modelId, INLINE_EDIT_SYSTEM, user, {
    signal,
    maxTokens: 4096,
    onText: onText ? (partial) => onText(extractCodeBlock(partial)) : undefined,
  });
  return extractCodeBlock(text);
}

export async function terminalCommand(pool: ProviderPool, modelId: string, request: string, cwd: string, signal?: AbortSignal): Promise<string> {
  const { text } = await complete(pool, modelId, TERMINAL_COMMAND_SYSTEM, `Current directory: ${cwd}\nRequest: ${request}`, { signal, maxTokens: 300, temperature: 0 });
  return text
    .replace(/^```\w*\n?|```$/g, '')
    .split('\n')
    .map((l) => l.replace(/^\$\s*/, '').trim())
    .filter(Boolean)
    .join(' && ');
}
