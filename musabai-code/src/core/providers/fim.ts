import type { ModelSpec } from '../types';
import { ProviderError } from './errors';
import { USER_AGENT } from './openai';

export interface FimRequest {
  prefix: string;
  suffix: string;
  path?: string;
  language?: string;
  maxTokens?: number;
  signal?: AbortSignal;
}

async function post(url: string, body: unknown, headers: Record<string, string>, signal: AbortSignal | undefined, fetchImpl: typeof fetch) {
  const timeout = AbortSignal.timeout(15_000);
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT, ...headers },
    body: JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  const text = await res.text();
  if (!res.ok) throw new ProviderError(`HTTP ${res.status}`, res.status, text.slice(0, 2000));
  return JSON.parse(text);
}

const STOPS = ['\n\n\n', '<|endoftext|>', '<|file_separator|>', '<|fim_pad|>', '<|cursor|>'];

export async function fimComplete(spec: ModelSpec, key: string | undefined, req: FimRequest, fetchImpl: typeof fetch = fetch): Promise<string> {
  const maxTokens = req.maxTokens ?? 96;
  const base = spec.baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '');
  if (spec.provider === 'mistral-fim') {
    const data = await post(
      `${spec.baseUrl}/fim/completions`,
      { model: spec.model, prompt: req.prefix, suffix: req.suffix, max_tokens: maxTokens, temperature: 0.1, stop: ['\n\n\n'] },
      key ? { Authorization: `Bearer ${key}` } : {},
      req.signal,
      fetchImpl,
    );
    const content = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? '';
    return typeof content === 'string' ? content : '';
  }
  if (spec.id.startsWith('ollama/')) {
    const data = await post(
      `${base}/api/generate`,
      { model: spec.model, prompt: req.prefix, suffix: req.suffix, stream: false, options: { temperature: 0.1, num_predict: maxTokens, stop: STOPS } },
      {},
      req.signal,
      fetchImpl,
    );
    return String(data?.response ?? '');
  }
  if (spec.id.startsWith('llamacpp/')) {
    const data = await post(
      `${base}/infill`,
      { input_prefix: req.prefix, input_suffix: req.suffix, n_predict: maxTokens, temperature: 0.1, stop: STOPS, cache_prompt: true },
      {},
      req.signal,
      fetchImpl,
    );
    return String(data?.content ?? '');
  }
  throw new ProviderError(`${spec.id} has no fill-in-the-middle endpoint`, 404);
}

export const CHAT_FIM_SYSTEM =
  'You are a code completion engine inside an editor. The user message shows a file with the cursor marked <|cursor|>. ' +
  'Reply with ONLY the exact text to insert at the cursor: no explanation, no markdown fences, no repetition of the code ' +
  'before or after the cursor. Complete the current statement or block naturally; stop at a sensible boundary. ' +
  'If nothing useful fits, reply with an empty message.';

export function chatFimPrompt(req: FimRequest): string {
  const prefix = req.prefix.slice(-3000);
  const suffix = req.suffix.slice(0, 1200);
  return `File: ${req.path || 'untitled'}${req.language ? ` (${req.language})` : ''}\n\n${prefix}<|cursor|>${suffix}`;
}

/** Makes a raw completion safe to insert: no fences, no echo of the line before or the text after the cursor. */
export function cleanCompletion(raw: string, prefix: string, suffix: string, maxLines = 16): string {
  let text = raw.replace(/\r\n/g, '\n');
  const fence = /^\s*```[\w+-]*\n([\s\S]*?)(?:\n```\s*)?$/.exec(text);
  if (fence) text = fence[1];
  text = text.replace(/<\|cursor\|>/g, '');
  const currentLine = prefix.slice(prefix.lastIndexOf('\n') + 1);
  if (currentLine.trim() && text.startsWith(currentLine)) text = text.slice(currentLine.length);
  else if (currentLine.trim() && text.trimStart().startsWith(currentLine.trim()) && currentLine.trim().length > 3) {
    text = text.trimStart().slice(currentLine.trim().length);
  }
  const suffixHead = suffix.split('\n')[0].trim();
  if (suffixHead) {
    const at = text.lastIndexOf(suffixHead);
    if (at > 0 && at + suffixHead.length >= text.trimEnd().length) text = text.slice(0, at);
  }
  const lines = text.split('\n');
  if (lines.length > maxLines) text = lines.slice(0, maxLines).join('\n');
  if (!text.trim()) return '';
  return text.replace(/\s+$/, (tail) => (tail.includes('\n') && suffix.startsWith('\n') ? '' : tail.replace(/\n+$/, '')));
}
