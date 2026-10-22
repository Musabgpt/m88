import type { Capability, ModelSpec } from '../types';
import { KILO_BASE, LLAMACPP_BASE, LMSTUDIO_BASE, OLLAMA_BASE } from './catalog';
import { fetchJson } from './openai';

const PREFERRED_KILO_ROUTE = 'stepfun/step-5-preview-free';
const STRICT_ZERO_FIELDS = ['prompt', 'completion'];
const OPTIONAL_ZERO_FIELDS = ['request', 'image', 'internal_reasoning', 'web_search', 'input_cache_read', 'input_cache_write'];

function price(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Actual zero-price tool models from Kilo's catalogue; free access is never inferred from a name. */
export function parseKiloCatalog(data: unknown, limit = 16): ModelSpec[] {
  const rows: ModelSpec[] = [];
  const items = (data as { data?: unknown[] })?.data;
  if (!Array.isArray(items)) return rows;
  for (const raw of items) {
    const item = raw as Record<string, any>;
    const pricing = (item.pricing || {}) as Record<string, unknown>;
    if (STRICT_ZERO_FIELDS.some((k) => price(pricing[k], -1) !== 0)) continue;
    if (OPTIONAL_ZERO_FIELDS.some((k) => price(pricing[k], 0) !== 0)) continue;
    const params: string[] = Array.isArray(item.supported_parameters) ? item.supported_parameters.map(String) : [];
    const id = String(item.id || '');
    if (!id || id === 'kilo-auto/free' || !params.includes('tools')) continue;
    const caps: Capability[] = ['text', 'tools', 'streaming', 'coding'];
    const modalities: string[] = item.architecture?.input_modalities || [];
    if (Array.isArray(modalities) && modalities.includes('image')) caps.push('vision');
    if (params.includes('reasoning')) caps.push('reasoning');
    if (params.includes('response_format')) caps.push('json');
    const contextWindow = Number(item.context_length || item.top_provider?.context_length || 0) || undefined;
    rows.push({
      id,
      name: String(item.name || id),
      provider: 'openai',
      baseUrl: KILO_BASE,
      model: id,
      free: true,
      capabilities: caps,
      source: 'kilo',
      contextWindow,
      note: 'No key needed',
    });
  }
  rows.sort((a, b) => Number(a.id !== PREFERRED_KILO_ROUTE) - Number(b.id !== PREFERRED_KILO_ROUTE));
  return rows.slice(0, limit);
}

export class TimedCache<T> {
  private value: T | undefined;
  private until = 0;
  private inflight: Promise<T> | undefined;
  constructor(private readonly loader: () => Promise<T>, private readonly ttlMs: number, private readonly failureTtlMs: number, private readonly fallback: T) {}

  async get(force = false): Promise<T> {
    if (!force && this.value !== undefined && Date.now() < this.until) return this.value;
    if (this.inflight) return this.inflight;
    this.inflight = this.loader()
      .then((value) => {
        this.value = value;
        this.until = Date.now() + this.ttlMs;
        return value;
      })
      .catch(() => {
        this.value = this.fallback;
        this.until = Date.now() + this.failureTtlMs;
        return this.fallback;
      })
      .finally(() => {
        this.inflight = undefined;
      });
    return this.inflight;
  }

  peek(): T | undefined {
    return this.value;
  }

  clear(): void {
    this.value = undefined;
    this.until = 0;
  }
}

export function kiloDiscovery(fetchImpl?: typeof fetch, base = KILO_BASE): TimedCache<ModelSpec[]> {
  return new TimedCache(
    async () => parseKiloCatalog(await fetchJson(`${base}/models`, { timeoutMs: 10_000, fetchImpl })),
    5 * 60_000,
    30_000,
    [],
  );
}

export interface LocalUrls {
  ollama?: string;
  lmstudio?: string;
  llamacpp?: string;
}

async function ollamaModels(base: string, fetchImpl?: typeof fetch): Promise<ModelSpec[]> {
  const tags = await fetchJson<{ models?: { name?: string; model?: string }[] }>(`${base}/api/tags`, { timeoutMs: 1200, fetchImpl });
  const names = (tags.models || []).map((m) => String(m.name || m.model || '')).filter(Boolean).slice(0, 24);
  return Promise.all(
    names.map(async (name): Promise<ModelSpec> => {
      let caps: string[] | undefined;
      try {
        const show = await fetchJson<{ capabilities?: string[] }>(`${base}/api/show`, { body: { model: name }, timeoutMs: 1500, fetchImpl });
        caps = Array.isArray(show.capabilities) ? show.capabilities : undefined;
      } catch {
        caps = undefined;
      }
      const capabilities: Capability[] = ['text', 'streaming', 'coding'];
      if (!caps || caps.includes('tools')) capabilities.push('tools');
      if (caps?.includes('vision')) capabilities.push('vision');
      if (caps?.includes('insert') || /coder|codestral|starcoder|deepseek-coder|codegemma/i.test(name)) capabilities.push('fim');
      if (caps?.includes('thinking')) capabilities.push('reasoning');
      return {
        id: `ollama/${name}`,
        name: `${name} (Ollama, local)`,
        provider: 'openai',
        baseUrl: `${base}/v1`,
        model: name,
        free: true,
        capabilities,
        source: 'local',
        note: 'Runs on this laptop',
      };
    }),
  );
}

async function openAiListModels(base: string, prefix: string, label: string, extra: Capability[], fetchImpl?: typeof fetch): Promise<ModelSpec[]> {
  const data = await fetchJson<{ data?: { id?: string }[] }>(`${base}/models`, { timeoutMs: 1200, fetchImpl });
  return (data.data || [])
    .map((m) => String(m.id || ''))
    .filter(Boolean)
    .slice(0, 24)
    .map((id) => ({
      id: `${prefix}/${id}`,
      name: `${id} (${label}, local)`,
      provider: 'openai' as const,
      baseUrl: base,
      model: id,
      free: true,
      capabilities: ['text', 'streaming', 'tools', 'coding', ...extra],
      source: 'local' as const,
      note: 'Runs on this laptop',
    }));
}

export function localDiscovery(urls: LocalUrls = {}, fetchImpl?: typeof fetch): TimedCache<ModelSpec[]> {
  const ollama = (urls.ollama || OLLAMA_BASE).replace(/\/+$/, '').replace(/\/v1$/, '');
  const lmstudio = (urls.lmstudio || LMSTUDIO_BASE).replace(/\/+$/, '');
  const llamacpp = (urls.llamacpp || LLAMACPP_BASE).replace(/\/+$/, '').replace(/\/v1$/, '');
  return new TimedCache(
    async () => {
      const settled = await Promise.allSettled([
        ollamaModels(ollama, fetchImpl),
        openAiListModels(lmstudio, 'lmstudio', 'LM Studio', [], fetchImpl),
        openAiListModels(`${llamacpp}/v1`, 'llamacpp', 'llama.cpp', ['fim'], fetchImpl),
      ]);
      return settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    },
    30_000,
    15_000,
    [],
  );
}
