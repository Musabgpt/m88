export class ProviderError extends Error {
  status: number;
  body: string;
  retryAfter?: number;
  /** True once any visible stream event reached the caller; switching providers then needs a reset. */
  emitted = false;
  providerId?: string;
  code?: 'timeout' | 'invalid_tool_call' | 'unsupported' | 'network';

  constructor(message: string, status = 0, body = '', retryAfter?: number) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
    this.body = body;
    this.retryAfter = retryAfter;
  }
}

export class CancelledError extends Error {
  constructor(message = 'Cancelled') {
    super(message);
    this.name = 'CancelledError';
  }
}

export function isCancelled(error: unknown): boolean {
  return error instanceof CancelledError || (error instanceof Error && error.name === 'AbortError');
}

const RETRYABLE = new Set([404, 408, 429, 500, 502, 503, 504]);

export function errorStatus(error: unknown): number {
  return error instanceof ProviderError ? error.status : 0;
}

export function isTimeout(error: unknown): boolean {
  if (error instanceof ProviderError && (error.code === 'timeout' || error.status === 408 || error.status === 504)) return true;
  const text = String((error as Error)?.message || error).toLowerCase();
  return text.includes('timeout') || text.includes('timed out') || text.includes('stalled');
}

export function isRetryable(error: unknown): boolean {
  if (error instanceof ProviderError) {
    if (error.code === 'invalid_tool_call' || error.code === 'network' || error.code === 'timeout') return true;
    if (RETRYABLE.has(error.status)) return true;
  }
  const text = String((error as Error)?.message || error).toLowerCase();
  return [
    'overload', 'temporarily unavailable', 'service unavailable', 'timeout', 'timed out', 'stalled',
    'rate limit', 'too many requests', 'connection reset', 'cannot reach', 'connection refused', 'fetch failed',
  ].some((word) => text.includes(word));
}

/** A short user-safe class for a provider failure; raw backend bodies stay in diagnostics. */
export function safeErrorClass(error: unknown): string {
  const status = errorStatus(error);
  const text = String((error as Error)?.message || error).toLowerCase();
  if (error instanceof ProviderError && error.code === 'invalid_tool_call') return 'invalid tool call';
  if (status === 401 || status === 403) return 'authentication failed';
  if (status === 404 || (error instanceof ProviderError && error.code === 'unsupported')) return 'capability unavailable';
  if (isTimeout(error)) return 'timed out';
  if (status === 429 || text.includes('rate limit') || text.includes('too many requests')) return 'rate limited';
  if ([500, 502, 503, 504].includes(status) || text.includes('overload') || text.includes('temporarily unavailable')) return 'temporarily unavailable';
  if (status === 400) return 'request rejected';
  if (text.includes('fetch failed') || text.includes('cannot reach') || text.includes('econnrefused')) return 'connection failed';
  return 'request failed';
}

export function redact(text: string): string {
  return String(text || '')
    .replace(/((?:api[_-]?key|authorization|token|secret)\s*[=:]\s*)([^\s,;"]+)/gi, '$1<redacted>')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer <redacted>')
    .slice(0, 2000);
}

/** Retry-After from a header value, a JSON body or the message, bounded to 1..1800 seconds. */
export function parseRetryAfter(header: string | null | undefined, body = '', message = ''): number | undefined {
  const values: unknown[] = [header];
  if (body) {
    try {
      const find = (value: unknown): unknown => {
        if (Array.isArray(value)) {
          for (const item of value) {
            const found = find(item);
            if (found !== undefined) return found;
          }
        } else if (value && typeof value === 'object') {
          const record = value as Record<string, unknown>;
          for (const key of ['retry_after', 'retry_after_seconds', 'retryAfter']) if (key in record) return record[key];
          for (const nested of Object.values(record)) {
            const found = find(nested);
            if (found !== undefined) return found;
          }
        }
        return undefined;
      };
      values.push(find(JSON.parse(body)));
    } catch {
      // not JSON
    }
  }
  const match = /retry(?:-|\s*)after[^0-9]{0,12}(\d+(?:\.\d+)?)/i.exec(message);
  if (match) values.push(match[1]);
  for (const raw of values) {
    if (raw === undefined || raw === null || raw === '') continue;
    let seconds = Number(raw);
    if (!Number.isFinite(seconds)) {
      const date = Date.parse(String(raw));
      if (Number.isNaN(date)) continue;
      seconds = (date - Date.now()) / 1000;
    }
    if (Number.isFinite(seconds) && seconds >= 0) return Math.max(1, Math.min(Math.ceil(seconds), 1800));
  }
  return undefined;
}
