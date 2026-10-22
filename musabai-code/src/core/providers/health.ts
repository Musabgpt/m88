import { KILO_BASE } from './catalog';
import { ProviderError, errorStatus, isTimeout, parseRetryAfter, safeErrorClass } from './errors';

export type HealthState =
  | 'available'
  | 'auth_error'
  | 'capability_mismatch'
  | 'timeout'
  | 'rate_limited'
  | 'overloaded'
  | 'invalid_tool_response'
  | 'cooldown';

export interface HealthRecord {
  state: HealthState;
  failures: number;
  cooldownUntil: number;
  lastError: string;
  status: number;
  latencyMs?: number;
  updatedAt: number;
}

export const KILO_GATEWAY_ID = `gateway:${KILO_BASE}`;

function retryAfterOf(error: unknown): number | undefined {
  if (error instanceof ProviderError) return error.retryAfter ?? parseRetryAfter(undefined, error.body, error.message);
  return undefined;
}

export function cooldownSeconds(error: unknown, failures: number): number {
  const status = errorStatus(error);
  const text = String((error as Error)?.message || error).toLowerCase();
  let base = 20;
  if (error instanceof ProviderError && error.code === 'invalid_tool_call') base = 180;
  else if (status === 404 || (error instanceof ProviderError && error.code === 'unsupported')) base = 90;
  else if (status === 429 || text.includes('rate limit')) base = 30;
  else if ([502, 503, 504].includes(status) || text.includes('overload')) base = 60;
  else if (status === 401 || status === 403) base = 300;
  else if (status === 400) base = 180;
  else if (status === 408 || isTimeout(error)) base = 20;
  if (failures >= 3) base = Math.max(base, 120);
  return Math.max(base, retryAfterOf(error) ?? 0);
}

function stateOf(error: unknown): HealthState {
  const status = errorStatus(error);
  if (error instanceof ProviderError && error.code === 'invalid_tool_call') return 'invalid_tool_response';
  if (status === 401 || status === 403) return 'auth_error';
  if (status === 404 || (error instanceof ProviderError && error.code === 'unsupported')) return 'capability_mismatch';
  if (isTimeout(error)) return 'timeout';
  if (status === 429) return 'rate_limited';
  if ([500, 502, 503, 504].includes(status) || String((error as Error)?.message).toLowerCase().includes('overload')) return 'overloaded';
  return 'cooldown';
}

/** Per-provider circuit breaker shared by every request in the process. */
export class HealthManager {
  private readonly records = new Map<string, HealthRecord>();
  constructor(private readonly now: () => number = () => Date.now()) {}

  get(id: string): HealthRecord | undefined {
    return this.records.get(id);
  }

  cooldownLeftMs(id: string): number {
    const record = this.records.get(id);
    return record ? Math.max(0, record.cooldownUntil - this.now()) : 0;
  }

  available(id: string, baseUrl?: string): boolean {
    if (this.cooldownLeftMs(id) > 0) return false;
    if (baseUrl === KILO_BASE && this.cooldownLeftMs(KILO_GATEWAY_ID) > 0) return false;
    return true;
  }

  success(id: string, latencyMs: number): void {
    this.records.set(id, { state: 'available', failures: 0, cooldownUntil: 0, lastError: '', status: 0, latencyMs: Math.round(latencyMs), updatedAt: this.now() });
  }

  failure(id: string, error: unknown, baseUrl?: string): void {
    const old = this.records.get(id);
    const failures = (old?.failures ?? 0) + 1;
    this.records.set(id, {
      state: stateOf(error),
      failures,
      cooldownUntil: this.now() + cooldownSeconds(error, failures) * 1000,
      lastError: safeErrorClass(error),
      status: errorStatus(error),
      latencyMs: old?.latencyMs,
      updatedAt: this.now(),
    });
    // A Kilo account or gateway limit applies to every model behind it; only an explicit
    // upstream (single-model) capacity limit permits trying another Kilo route.
    if (baseUrl === KILO_BASE && [401, 403, 429].includes(errorStatus(error))) {
      let source = '';
      try {
        source = String(JSON.parse((error as ProviderError).body || '{}')?.error?.metadata?.limit_source || '');
      } catch {
        source = '';
      }
      if (!source.startsWith('upstream_')) this.failure(KILO_GATEWAY_ID, error);
    }
  }

  snapshot(): Record<string, HealthRecord & { coolingDown: boolean }> {
    const out: Record<string, HealthRecord & { coolingDown: boolean }> = {};
    for (const [id, record] of this.records) out[id] = { ...record, coolingDown: record.cooldownUntil > this.now() };
    return out;
  }

  forget(id: string): void {
    this.records.delete(id);
  }

  clear(): void {
    this.records.clear();
  }
}
