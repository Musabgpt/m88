import type { ChatMessage, ChatRequest, Completion, ContentPart, ModelSpec, ToolCall } from '../types';
import { CancelledError, ProviderError, parseRetryAfter } from './errors';

export const USER_AGENT = 'MusabAI-Code/0.1';

export interface TransportOptions {
  fetchImpl?: typeof fetch;
  /** Longest wait for the response headers and first stream event. */
  firstEventTimeoutMs?: number;
  /** Longest silence between stream chunks once it has started. */
  idleTimeoutMs?: number;
}

function cleanMessage(message: ChatMessage, textOnly: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = { role: message.role };
  let content: ChatMessage['content'] = message.content;
  if (textOnly && Array.isArray(content)) {
    content = content.filter((p): p is Extract<ContentPart, { type: 'text' }> => p.type === 'text').map((p) => p.text).join('\n');
  }
  out.content = content ?? '';
  if (!textOnly) {
    if (message.tool_calls?.length) out.tool_calls = message.tool_calls;
    if (message.tool_call_id) out.tool_call_id = message.tool_call_id;
  } else if (message.role === 'tool') {
    // Text-only backends know no tool role: keep the result as plain context.
    out.role = 'user';
    out.content = `Tool result:\n${typeof out.content === 'string' ? out.content : ''}`;
  }
  if (message.name && message.role !== 'tool') out.name = message.name;
  return out;
}

export function buildBody(spec: ModelSpec, model: string, request: ChatRequest): Record<string, unknown> {
  const textOnly = spec.provider === 'aihorde';
  const body: Record<string, unknown> = {
    model,
    messages: request.messages.map((m) => cleanMessage(m, textOnly)),
    stream: true,
  };
  const maxTokens = spec.maxOutputTokens ? Math.min(request.maxTokens ?? spec.maxOutputTokens, spec.maxOutputTokens) : request.maxTokens;
  if (maxTokens) body.max_tokens = maxTokens;
  if (request.temperature !== undefined) body.temperature = request.temperature;
  if (request.tools?.length && !textOnly) body.tools = request.tools;
  if (request.reasoning && spec.capabilities.includes('reasoning')) body.reasoning_effort = request.reasoning;
  if (request.responseFormat) body.response_format = request.responseFormat;
  if (!textOnly) body.stream_options = { include_usage: true };
  Object.assign(body, spec.extraBody || {});
  return body;
}

/** Incremental SSE/JSON-lines splitter that tolerates CRLF and chunk boundaries anywhere. */
export class SseLineReader {
  private buffer = '';
  push(chunk: string): string[] {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? '';
    return lines;
  }
  flush(): string[] {
    const rest = this.buffer;
    this.buffer = '';
    return rest ? [rest] : [];
  }
}

/** Routes a leading <think>…</think> block of streamed content to reasoning. */
export class ThinkSplitter {
  private state: 'start' | 'thinking' | 'content' = 'start';
  private pending = '';
  push(text: string): { reasoning: string; content: string } {
    let reasoning = '';
    let content = '';
    this.pending += text;
    while (this.pending) {
      if (this.state === 'start') {
        const trimmed = this.pending.replace(/^\s+/, '');
        if (!trimmed) return { reasoning, content };
        if ('<think>'.startsWith(trimmed) && trimmed.length < 7) return { reasoning, content };
        if (trimmed.startsWith('<think>')) {
          this.state = 'thinking';
          this.pending = trimmed.slice(7);
        } else {
          this.state = 'content';
        }
      } else if (this.state === 'thinking') {
        const end = this.pending.indexOf('</think>');
        if (end >= 0) {
          reasoning += this.pending.slice(0, end);
          this.pending = this.pending.slice(end + 8).replace(/^\s+/, '');
          this.state = 'content';
        } else {
          // Keep a possible partial closing tag for the next chunk.
          const keep = Math.min(this.pending.length, 7);
          reasoning += this.pending.slice(0, this.pending.length - keep);
          this.pending = this.pending.slice(this.pending.length - keep);
          if (!'</think>'.startsWith(this.pending) && !this.pending.includes('<')) {
            reasoning += this.pending;
            this.pending = '';
          }
          return { reasoning, content };
        }
      } else {
        content += this.pending;
        this.pending = '';
      }
    }
    return { reasoning, content };
  }
  flush(): { reasoning: string; content: string } {
    const rest = this.pending;
    this.pending = '';
    return this.state === 'thinking' ? { reasoning: rest, content: '' } : { reasoning: '', content: rest };
  }
}

function errorMessage(status: number, text: string): string {
  let detail = '';
  try {
    const data = JSON.parse(text);
    const err = data?.error ?? data;
    detail = typeof err === 'string' ? err : String(err?.message || err?.detail || '');
  } catch {
    detail = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return `HTTP ${status}${detail ? `: ${detail.slice(0, 300)}` : ''}`;
}

const hordeModels = new Map<string, { at: number; models: string[] }>();

async function resolveHordeModel(spec: ModelSpec, key: string, fetchImpl: typeof fetch, signal?: AbortSignal): Promise<string> {
  if (spec.model && spec.model !== 'auto') return spec.model;
  const cached = hordeModels.get(spec.baseUrl);
  if (cached && Date.now() - cached.at < 60_000 && cached.models.length) return cached.models[0];
  const res = await fetchImpl(`${spec.baseUrl}/models`, {
    headers: { Authorization: `Bearer ${key}`, 'User-Agent': USER_AGENT },
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new ProviderError(errorMessage(res.status, await res.text()), res.status);
  const data = (await res.json()) as { data?: { id?: string }[] };
  const models = (data.data || []).map((m) => String(m.id || '')).filter(Boolean);
  hordeModels.set(spec.baseUrl, { at: Date.now(), models });
  if (!models.length) throw new ProviderError('AI Horde has no online text model available', 503);
  return models[0];
}

export async function chatCompletion(
  spec: ModelSpec,
  apiKey: string | undefined,
  request: ChatRequest,
  options: TransportOptions = {},
): Promise<Completion> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const local = spec.source === 'local';
  const firstEventTimeoutMs = options.firstEventTimeoutMs ?? (local ? 600_000 : 120_000);
  const idleTimeoutMs = options.idleTimeoutMs ?? (local ? 300_000 : 90_000);
  if (request.signal?.aborted) throw new CancelledError();
  if (spec.provider === 'aihorde' && request.tools?.length) {
    const error = new ProviderError('AI Horde fallback does not support tool calls', 404);
    error.code = 'unsupported';
    throw error;
  }

  const controller = new AbortController();
  let stalled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = (ms: number) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      stalled = true;
      controller.abort();
    }, ms);
  };
  const onAbort = () => controller.abort();
  request.signal?.addEventListener('abort', onAbort, { once: true });

  const started = Date.now();
  let first = 0;
  const out: Completion = {
    content: '',
    reasoning: '',
    toolCalls: [],
    finishReason: '',
    usage: { promptTokens: 0, completionTokens: 0, cachedTokens: 0 },
    modelId: spec.id,
    model: spec.model,
    ttftMs: 0,
    totalMs: 0,
  };
  const calls = new Map<number, { id: string; name: string; arguments: string }>();
  const think = new ThinkSplitter();
  const emitText = (text: string) => {
    if (!text) return;
    const { reasoning, content } = think.push(text);
    if (reasoning) {
      out.reasoning += reasoning;
      request.onEvent?.({ type: 'reasoning', text: reasoning });
    }
    if (content) {
      out.content += content;
      request.onEvent?.({ type: 'text', text: content });
    }
  };

  const handleEvent = (event: Record<string, any>) => {
    if (event.error) {
      const err = event.error;
      const message = typeof err === 'string' ? err : String(err?.message || 'stream error');
      const code = Number(err?.code) || 0;
      throw new ProviderError(message, code >= 400 && code < 600 ? code : 502, JSON.stringify(err).slice(0, 2000));
    }
    if (event.usage) {
      const u = event.usage;
      out.usage.promptTokens = Number(u.prompt_tokens || 0);
      out.usage.completionTokens = Number(u.completion_tokens || 0);
      out.usage.cachedTokens = Number(u.prompt_tokens_details?.cached_tokens || 0);
    }
    for (const choice of event.choices || []) {
      const delta = choice.delta || choice.message || {};
      const reasoning = delta.reasoning_content || delta.reasoning;
      if (typeof reasoning === 'string' && reasoning) {
        first ||= Date.now();
        out.reasoning += reasoning;
        request.onEvent?.({ type: 'reasoning', text: reasoning });
      }
      if (typeof delta.content === 'string' && delta.content) {
        first ||= Date.now();
        emitText(delta.content);
      }
      const toolCalls: any[] = Array.isArray(delta.tool_calls) ? delta.tool_calls : [];
      toolCalls.forEach((tc, position) => {
        first ||= Date.now();
        const index = typeof tc.index === 'number' ? tc.index : calls.size + position;
        let call = calls.get(index);
        if (!call) {
          call = { id: '', name: '', arguments: '' };
          calls.set(index, call);
        }
        if (tc.id) call.id = String(tc.id);
        const fn = tc.function || {};
        if (fn.name) {
          // Most servers send the name once; some repeat it in every chunk.
          if (!call.name) {
            call.name = String(fn.name);
            request.onEvent?.({ type: 'tool_start', index, id: call.id, name: call.name });
          } else if (!call.name.endsWith(String(fn.name))) {
            call.name += String(fn.name);
          }
        }
        if (fn.arguments !== undefined && fn.arguments !== null) {
          const piece = typeof fn.arguments === 'string' ? fn.arguments : JSON.stringify(fn.arguments);
          call.arguments += piece;
          request.onEvent?.({ type: 'tool_args', index, delta: piece });
        }
      });
      if (choice.finish_reason) out.finishReason = String(choice.finish_reason);
    }
  };

  try {
    let model = spec.model;
    let key = apiKey;
    if (spec.provider === 'aihorde') {
      key = apiKey || spec.apiKey || '0000000000';
      model = await resolveHordeModel(spec, key, fetchImpl, request.signal);
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      'User-Agent': USER_AGENT,
      ...(spec.headers || {}),
    };
    if (key) headers.Authorization = `Bearer ${key}`;
    arm(firstEventTimeoutMs);
    let res: Response;
    try {
      res = await fetchImpl(`${spec.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(buildBody(spec, model, request)),
        signal: controller.signal,
      });
    } catch (error) {
      if (request.signal?.aborted) throw new CancelledError();
      if (stalled) {
        const err = new ProviderError('provider did not answer in time', 408);
        err.code = 'timeout';
        throw err;
      }
      const err = new ProviderError(`cannot reach ${new URL(spec.baseUrl).host}: ${(error as Error).message}`);
      err.code = 'network';
      throw err;
    }
    if (res.status >= 400) {
      const text = await res.text().catch(() => '');
      throw new ProviderError(errorMessage(res.status, text), res.status, text.slice(0, 4000),
        parseRetryAfter(res.headers.get('retry-after'), text, text));
    }
    const contentType = res.headers.get('content-type') || '';
    if (!res.body) throw new ProviderError('empty response body', 502);
    const decoder = new TextDecoder();
    const reader = res.body.getReader();
    if (!contentType.includes('text/event-stream') && contentType.includes('json')) {
      // A server that ignored stream=true and answered with one JSON object.
      let text = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        arm(idleTimeoutMs);
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
      let data: Record<string, any>;
      try {
        data = JSON.parse(text);
      } catch {
        throw new ProviderError('invalid JSON response', 502, text.slice(0, 2000));
      }
      handleEvent(data);
    } else {
      const lines = new SseLineReader();
      let done = false;
      while (!done) {
        const chunk = await reader.read();
        if (chunk.done) break;
        arm(idleTimeoutMs);
        for (const line of lines.push(decoder.decode(chunk.value, { stream: true }))) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data) continue;
          if (data === '[DONE]') {
            done = true;
            break;
          }
          let event: Record<string, any>;
          try {
            event = JSON.parse(data);
          } catch {
            continue;
          }
          handleEvent(event);
        }
      }
      if (!done) {
        for (const line of lines.flush()) {
          if (line.startsWith('data:') && line.slice(5).trim() !== '[DONE]') {
            try {
              handleEvent(JSON.parse(line.slice(5).trim()));
            } catch {
              // ignore a torn last line
            }
          }
        }
      }
      reader.cancel().catch(() => undefined);
    }
    const rest = think.flush();
    if (rest.reasoning) {
      out.reasoning += rest.reasoning;
      request.onEvent?.({ type: 'reasoning', text: rest.reasoning });
    }
    if (rest.content) {
      out.content += rest.content;
      request.onEvent?.({ type: 'text', text: rest.content });
    }
    out.toolCalls = [...calls.entries()]
      .sort((a, b) => a[0] - b[0])
      .filter(([, c]) => c.name)
      .map(([i, c]): ToolCall => ({
        id: c.id || `call_${i}_${Math.random().toString(16).slice(2, 8)}`,
        type: 'function',
        function: { name: c.name, arguments: c.arguments || '{}' },
      }));
    if (!out.content && !out.toolCalls.length && !out.reasoning) {
      throw new ProviderError('empty completion', 502);
    }
    return out;
  } catch (error) {
    if (request.signal?.aborted) throw new CancelledError();
    if (stalled && !(error instanceof ProviderError && error.code === 'timeout')) {
      const err = new ProviderError('provider stream stalled', 408);
      err.code = 'timeout';
      throw err;
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    request.signal?.removeEventListener('abort', onAbort);
    out.totalMs = Date.now() - started;
    out.ttftMs = (first || Date.now()) - started;
  }
}

export async function fetchJson<T = any>(
  url: string,
  options: { headers?: Record<string, string>; timeoutMs?: number; signal?: AbortSignal; fetchImpl?: typeof fetch; method?: string; body?: unknown } = {},
): Promise<T> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 20_000);
  const res = await fetchImpl(url, {
    method: options.method || (options.body === undefined ? 'GET' : 'POST'),
    headers: {
      'User-Agent': USER_AGENT,
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
  });
  const text = await res.text();
  if (!res.ok) throw new ProviderError(errorMessage(res.status, text), res.status, text.slice(0, 4000), parseRetryAfter(res.headers.get('retry-after'), text));
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ProviderError('invalid JSON response', 502, text.slice(0, 2000));
  }
}
