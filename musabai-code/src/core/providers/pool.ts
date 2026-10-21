import { needsKey } from '../credentials';
import type { Capability, ChatRequest, Completion, ContentPart, ModelSpec, StreamEvent } from '../types';
import {
  AUTO_MODEL_ID,
  FIM_POOL,
  FREE_POOL,
  KILO_AUTO_FREE,
  KILO_BASE,
  aiHordeSpec,
  freeLlmApiSpec,
  isExplicitlyFree,
  supports,
} from './catalog';
import { type LocalUrls, type TimedCache, kiloDiscovery, localDiscovery } from './discovery';
import { CancelledError, ProviderError, errorStatus, isCancelled, isRetryable, isTimeout, redact, safeErrorClass } from './errors';
import { HealthManager, type HealthState } from './health';
import { type TransportOptions, chatCompletion } from './openai';

export interface PoolOptions {
  resolveKey: (spec: ModelSpec) => Promise<string | undefined>;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  transport?: TransportOptions;
  customModels?: () => ModelSpec[];
  discoverKilo?: boolean;
  discoverLocal?: boolean;
  localUrls?: LocalUrls;
  kiloBase?: string;
  health?: HealthManager;
  log?: (line: string) => void;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export interface ModelInfo {
  id: string;
  name: string;
  source: ModelSpec['source'];
  free: boolean;
  keyless: boolean;
  ready: boolean;
  capabilities: Capability[];
  state?: HealthState;
  coolingDown: boolean;
  note?: string;
  secretId?: string;
}

export interface PoolChatOptions {
  required?: Capability[];
  excluded?: Set<string>;
  onStatus?: (message: string) => void;
  /** Lets the pool switch provider after visible output: the caller discards the partial draft. */
  onReset?: () => void;
  /** Throws (code invalid_tool_call) to reject a completion before any tool runs. */
  validate?: (completion: Completion) => void;
  recoveryBudgetMs?: number;
}

export interface PoolResult extends Completion {
  spec: ModelSpec;
  fallbackFrom?: string;
}

export class ProviderUnavailable extends ProviderError {
  retryAfterMs?: number;
  constructor(message: string, retryAfterMs?: number) {
    super(message, 503);
    this.name = 'ProviderUnavailable';
    this.retryAfterMs = retryAfterMs;
  }
}

function hasImage(request: ChatRequest): boolean {
  return request.messages.some((m) => Array.isArray(m.content) && m.content.some((p: ContentPart) => p.type === 'image_url'));
}

export function requestCapabilities(request: ChatRequest, extra: Capability[] = []): Set<Capability> {
  const required = new Set<Capability>(['text', 'streaming']);
  if (hasImage(request)) required.add('vision');
  if (request.tools?.length) required.add('tools');
  if (request.responseFormat) required.add('json');
  for (const cap of extra) required.add(cap);
  return required;
}

const defaultSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new CancelledError());
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new CancelledError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

export class ProviderPool {
  readonly health: HealthManager;
  private readonly kilo: TimedCache<ModelSpec[]>;
  private readonly local: TimedCache<ModelSpec[]>;
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;

  constructor(private readonly options: PoolOptions) {
    this.health = options.health ?? new HealthManager();
    this.kilo = kiloDiscovery(options.fetchImpl, options.kiloBase ?? KILO_BASE);
    this.local = localDiscovery(options.localUrls, options.fetchImpl);
    this.sleep = options.sleep ?? defaultSleep;
  }

  private log(line: string): void {
    this.options.log?.(line);
  }

  private kiloAuto(): ModelSpec {
    return this.options.kiloBase ? { ...KILO_AUTO_FREE, baseUrl: this.options.kiloBase } : KILO_AUTO_FREE;
  }

  private async kiloModels(): Promise<ModelSpec[]> {
    if (this.options.discoverKilo === false) return [];
    if (!this.health.available(`gateway:${KILO_BASE}`)) return this.kilo.peek() ?? [];
    const models = await this.kilo.get();
    return this.options.kiloBase ? models.map((m) => ({ ...m, baseUrl: this.options.kiloBase! })) : models;
  }

  private async localModels(): Promise<ModelSpec[]> {
    if (this.options.discoverLocal === false) return [];
    return this.local.get();
  }

  refresh(): void {
    this.kilo.clear();
    this.local.clear();
  }

  /** Every model MusabAI knows, in canonical failover order. */
  async allSpecs(): Promise<ModelSpec[]> {
    const env = this.options.env ?? process.env;
    const [kilo, local] = await Promise.all([this.kiloModels(), this.localModels()]);
    const gateway = freeLlmApiSpec(env);
    const custom = this.options.customModels?.() ?? [];
    return [
      ...(gateway ? [gateway] : []),
      ...FREE_POOL,
      this.kiloAuto(),
      ...kilo,
      ...custom,
      ...local,
      aiHordeSpec(env),
    ];
  }

  async resolve(id: string): Promise<ModelSpec | undefined> {
    if (!id || id === AUTO_MODEL_ID) return undefined;
    const specs = await this.allSpecs();
    return specs.find((s) => s.id === id) ?? specs.find((s) => s.model === id);
  }

  async listModels(): Promise<ModelInfo[]> {
    const specs = await this.allSpecs();
    return Promise.all(
      specs.map(async (spec) => {
        const key = await this.options.resolveKey(spec);
        const record = this.health.get(spec.id);
        return {
          id: spec.id,
          name: spec.name,
          source: spec.source,
          free: isExplicitlyFree(spec),
          keyless: !needsKey(spec),
          ready: !needsKey(spec) || Boolean(key),
          capabilities: spec.capabilities,
          state: record?.state,
          coolingDown: !this.health.available(spec.id, spec.baseUrl),
          note: spec.note,
          secretId: spec.secretId,
        };
      }),
    );
  }

  /** Configured, credentialed, explicitly free fallbacks in canonical order. */
  async candidates(
    current: ModelSpec | undefined,
    required: Set<Capability>,
    options: { includeCooling?: boolean; excluded?: Set<string> } = {},
  ): Promise<{ spec: ModelSpec; key?: string }[]> {
    const seenIds = new Set<string>(current ? [current.id] : []);
    const seenBases = new Set<string>(current ? [current.baseUrl] : []);
    const out: { spec: ModelSpec; key?: string }[] = [];
    for (const spec of await this.allSpecs()) {
      if (seenIds.has(spec.id) || options.excluded?.has(spec.id)) continue;
      // One fallback per provider endpoint, except Kilo's many independently priced free routes.
      if (seenBases.has(spec.baseUrl) && spec.baseUrl !== KILO_BASE && spec.baseUrl !== this.options.kiloBase) continue;
      if (!isExplicitlyFree(spec)) continue;
      if (!supports(spec, required)) continue;
      if (!options.includeCooling && !this.health.available(spec.id, spec.baseUrl)) continue;
      const key = await this.options.resolveKey(spec);
      if (needsKey(spec) && !key) continue;
      seenIds.add(spec.id);
      seenBases.add(spec.baseUrl);
      out.push({ spec, key });
    }
    return out;
  }

  private nextRetryMs(specs: ModelSpec[]): number | undefined {
    const waits: number[] = [];
    for (const spec of specs) {
      const record = this.health.get(spec.id);
      if (record && (record.state === 'auth_error' || record.state === 'capability_mismatch' || record.status === 400)) continue;
      let left = this.health.cooldownLeftMs(spec.id);
      if (spec.baseUrl === KILO_BASE) left = Math.max(left, this.health.cooldownLeftMs(`gateway:${KILO_BASE}`));
      if (left > 0) waits.push(left);
    }
    return waits.length ? Math.min(...waits) : undefined;
  }

  private async order(modelId: string, required: Set<Capability>, excluded: Set<string>, errors: string[]) {
    const current = await this.resolve(modelId);
    const order: { spec: ModelSpec; key?: string }[] = [];
    if (current) {
      const key = await this.options.resolveKey(current);
      const missing = [...required].filter((c) => !current.capabilities.includes(c));
      if (missing.length) errors.push(`${current.id}: does not support ${missing.join(', ')}`);
      else if (needsKey(current) && !key) errors.push(`${current.id}: no API key configured`);
      else if (excluded.has(current.id)) errors.push(`${current.id}: failed earlier in this request`);
      else if (!this.health.available(current.id, current.baseUrl)) errors.push(`${current.id}: cooling down`);
      else order.push({ spec: current, key });
    } else if (modelId && modelId !== AUTO_MODEL_ID) {
      errors.push(`${modelId}: unknown model`);
    }
    order.push(...(await this.candidates(current, required, { excluded })));
    return { current, order };
  }

  async chat(modelId: string, request: ChatRequest, options: PoolChatOptions = {}): Promise<PoolResult> {
    const required = requestCapabilities(request, options.required);
    const excluded = new Set(options.excluded ?? []);
    const errors: string[] = [];
    const deadline = Date.now() + (options.recoveryBudgetMs ?? 90_000);
    let { current, order } = await this.order(modelId, required, excluded, errors);
    if (!order.length) {
      const all = await this.allSpecs();
      const wait = this.nextRetryMs(all.filter((s) => supports(s, required)));
      if (wait === undefined) {
        throw new ProviderUnavailable(
          `No configured free AI provider supports this request (requires: ${[...required].sort().join(', ')})` +
            (errors.length ? ` [${errors.join(' | ')}]` : ''),
        );
      }
    }
    const first = current?.id ?? order[0]?.spec.id;

    for (let round = 0; round < 3; round++) {
      for (const { spec, key } of order) {
        if (excluded.has(spec.id)) continue;
        for (let attempt = 0; attempt < 2; attempt++) {
          let emitted = false;
          const onEvent = (event: StreamEvent) => {
            emitted = true;
            request.onEvent?.(event);
          };
          const started = Date.now();
          try {
            const result = await chatCompletion(spec, key, { ...request, onEvent }, this.options.transport);
            options.validate?.(result);
            this.health.success(spec.id, Date.now() - started);
            if (first && spec.id !== first) options.onStatus?.(`Continuing with ${spec.name}`);
            return { ...result, spec, fallbackFrom: first && spec.id !== first ? first : undefined };
          } catch (error) {
            if (isCancelled(error) || request.signal?.aborted) throw new CancelledError();
            this.health.failure(spec.id, error, spec.baseUrl);
            this.log(`provider failure id=${spec.id} status=${errorStatus(error)} detail=${redact(String((error as Error).message))}`);
            const label = `${spec.id}: ${safeErrorClass(error)}`;
            if (!errors.includes(label)) errors.push(label);
            if (emitted) {
              if (!options.onReset) {
                if (error instanceof ProviderError) {
                  error.emitted = true;
                  error.providerId = spec.id;
                }
                throw error;
              }
              options.onReset();
              options.onStatus?.(`${spec.name} stopped mid-answer (${safeErrorClass(error)}); switching to another free model`);
              excluded.add(spec.id);
              break;
            }
            const status = errorStatus(error);
            const quickRetry =
              attempt === 0 &&
              isRetryable(error) &&
              !isTimeout(error) &&
              status !== 404 &&
              status !== 429 &&
              !(error instanceof ProviderError && (error.code === 'invalid_tool_call' || error.code === 'unsupported'));
            if (!quickRetry) break;
            await this.sleep(250 + Math.random() * 150, request.signal);
          }
        }
      }
      const all = await this.allSpecs();
      const wait = this.nextRetryMs(all.filter((s) => supports(s, required) && !excluded.has(s.id)));
      if (wait === undefined || Date.now() + wait > deadline || wait > 45_000) break;
      options.onStatus?.(`Free providers are busy; retrying in ${Math.ceil(wait / 1000)} s (progress is kept)`);
      await this.sleep(wait + 50, request.signal);
      ({ current, order } = await this.order(modelId, required, excluded, []));
    }
    const all = await this.allSpecs();
    throw new ProviderUnavailable(
      `Free AI providers are temporarily unavailable (${errors.join(' | ').slice(0, 900)})`,
      this.nextRetryMs(all.filter((s) => supports(s, required))),
    );
  }

  /** Fill-in-the-middle endpoints usable now: keyed Codestral, then local coder models. */
  async fimCandidates(): Promise<{ spec: ModelSpec; key?: string }[]> {
    const out: { spec: ModelSpec; key?: string }[] = [];
    for (const spec of FIM_POOL) {
      const key = await this.options.resolveKey(spec);
      if (key && this.health.available(spec.id)) out.push({ spec, key });
    }
    for (const spec of await this.localModels()) {
      if (spec.capabilities.includes('fim') && this.health.available(spec.id)) out.push({ spec });
    }
    return out;
  }
}
