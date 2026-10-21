import type { Capability, ModelSpec } from '../types';

/**
 * MusabAI's free model catalogue. Ids, endpoints, models and key variables match the
 * MusabAI desktop/Android provider pool (connectors/provider_pool.py, free_provider_adapters.py,
 * apply_cursor.py) so a key configured once works the same everywhere.
 */

export const KILO_BASE = 'https://api.kilo.ai/api/gateway';
export const AIHORDE_BASE = 'https://oai.aihorde.net/v1';
export const AIHORDE_ANONYMOUS_KEY = '0000000000';
export const FREELLMAPI_DEFAULT_BASE = 'http://127.0.0.1:3001/v1';
export const OLLAMA_BASE = 'http://127.0.0.1:11434';
export const LMSTUDIO_BASE = 'http://127.0.0.1:1234/v1';
export const LLAMACPP_BASE = 'http://127.0.0.1:8080';

export const AUTO_MODEL_ID = 'auto';
export const DEFAULT_MODEL_ID = 'kilo-auto/free';

/** The keyless default, as on MusabAI for Linux and Android: no account and no key needed. */
export const KILO_AUTO_FREE: ModelSpec = {
  id: 'kilo-auto/free',
  name: 'Kilo Auto Free',
  provider: 'openai',
  baseUrl: KILO_BASE,
  model: 'kilo-auto/free',
  free: true,
  capabilities: ['text', 'tools', 'streaming', 'reasoning', 'coding'],
  source: 'builtin',
  note: 'No key needed',
};

/** Keyed free tiers, in MusabAI's canonical failover order. */
export const FREE_POOL: ModelSpec[] = [
  {
    id: 'groq/gpt-oss-120b-free',
    name: 'Groq Free (gpt-oss-120b)',
    provider: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'openai/gpt-oss-120b',
    apiKeyEnvs: ['GROQ_API_KEY'],
    secretId: 'groq',
    free: true,
    capabilities: ['text', 'tools', 'streaming', 'json', 'reasoning', 'long_context', 'coding'],
    source: 'builtin',
  },
  {
    id: 'gemini/3.7-flash-free',
    name: 'Google Gemini Free',
    provider: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-3.7-flash',
    apiKeyEnvs: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
    secretId: 'gemini',
    free: true,
    capabilities: ['text', 'vision', 'tools', 'streaming', 'json', 'reasoning', 'long_context', 'coding'],
    source: 'builtin',
  },
  {
    id: 'openrouter/free',
    name: 'OpenRouter Free',
    provider: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openrouter/free',
    apiKeyEnvs: ['OPENROUTER_API_KEY'],
    secretId: 'openrouter',
    free: true,
    capabilities: ['text', 'vision', 'tools', 'streaming', 'json', 'reasoning', 'long_context', 'coding'],
    source: 'builtin',
    headers: { 'HTTP-Referer': 'https://github.com/Musabgpt/m88', 'X-Title': 'MusabAI Code' },
  },
  {
    id: 'nvidia/nemotron-3-ultra-free',
    name: 'NVIDIA Free Endpoint',
    provider: 'openai',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    model: 'nvidia/nemotron-3-ultra-550b-a55b',
    apiKeyEnvs: ['NVIDIA_API_KEY', 'NVAPI_KEY'],
    secretId: 'nvidia',
    free: true,
    capabilities: ['text', 'tools', 'streaming', 'reasoning', 'long_context', 'coding'],
    source: 'builtin',
  },
  {
    id: 'zhipu/glm-4.7-flash-free',
    name: 'Zhipu GLM-4.7-Flash Free',
    provider: 'openai',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4.7-flash',
    apiKeyEnvs: ['ZHIPU_API_KEY', 'ZAI_API_KEY'],
    secretId: 'zhipu',
    free: true,
    capabilities: ['text', 'tools', 'streaming', 'json', 'reasoning', 'long_context', 'coding'],
    source: 'builtin',
  },
  {
    id: 'mistral/devstral-free',
    name: 'Mistral Devstral (Experiment plan)',
    provider: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    model: 'devstral-small-latest',
    apiKeyEnvs: ['MISTRAL_API_KEY'],
    secretId: 'mistral',
    free: true,
    capabilities: ['text', 'tools', 'streaming', 'json', 'long_context', 'coding'],
    source: 'builtin',
  },
];

/** Fill-in-the-middle endpoints used by Tab autocomplete when a key is present. */
export const FIM_POOL: ModelSpec[] = [
  {
    id: 'mistral/codestral-fim',
    name: 'Codestral (free key)',
    provider: 'mistral-fim',
    baseUrl: 'https://codestral.mistral.ai/v1',
    model: 'codestral-latest',
    apiKeyEnvs: ['CODESTRAL_API_KEY'],
    secretId: 'codestral',
    free: true,
    capabilities: ['fim', 'coding'],
    source: 'builtin',
  },
  {
    id: 'mistral/codestral-fim-experiment',
    name: 'Codestral via Mistral Experiment plan',
    provider: 'mistral-fim',
    baseUrl: 'https://api.mistral.ai/v1',
    model: 'codestral-latest',
    apiKeyEnvs: ['MISTRAL_API_KEY'],
    secretId: 'mistral',
    free: true,
    capabilities: ['fim', 'coding'],
    source: 'builtin',
  },
];

export function freeLlmApiSpec(env: NodeJS.ProcessEnv = process.env): ModelSpec | undefined {
  const key = String(env.FREELLMAPI_API_KEY || '').trim();
  if (!key) return undefined;
  return {
    id: 'freellmapi/auto-free',
    name: 'FreeLLMAPI',
    provider: 'openai',
    baseUrl: String(env.FREELLMAPI_BASE_URL || FREELLMAPI_DEFAULT_BASE).replace(/\/+$/, ''),
    model: String(env.FREELLMAPI_MODEL || 'auto'),
    apiKey: key,
    free: true,
    capabilities: ['text', 'vision', 'tools', 'streaming', 'json'],
    source: 'gateway',
  };
}

/** Independent anonymous last resort: text only, never tools. */
export function aiHordeSpec(env: NodeJS.ProcessEnv = process.env): ModelSpec {
  return {
    id: 'aihorde/anonymous-free',
    name: 'AI Horde Free (text only)',
    provider: 'aihorde',
    baseUrl: AIHORDE_BASE,
    model: String(env.AIHORDE_MODEL || 'auto'),
    apiKey: String(env.AIHORDE_API_KEY || AIHORDE_ANONYMOUS_KEY).trim() || AIHORDE_ANONYMOUS_KEY,
    free: true,
    capabilities: ['text', 'streaming'],
    source: 'builtin',
    maxOutputTokens: 1024,
    note: 'No key needed',
  };
}

export const PROVIDER_KEYS: { id: string; name: string; envs: string[]; url: string }[] = [
  { id: 'groq', name: 'Groq', envs: ['GROQ_API_KEY'], url: 'https://console.groq.com/keys' },
  { id: 'gemini', name: 'Google Gemini', envs: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'], url: 'https://aistudio.google.com/apikey' },
  { id: 'openrouter', name: 'OpenRouter', envs: ['OPENROUTER_API_KEY'], url: 'https://openrouter.ai/keys' },
  { id: 'nvidia', name: 'NVIDIA', envs: ['NVIDIA_API_KEY', 'NVAPI_KEY'], url: 'https://build.nvidia.com/' },
  { id: 'zhipu', name: 'Zhipu GLM', envs: ['ZHIPU_API_KEY', 'ZAI_API_KEY'], url: 'https://open.bigmodel.cn/usercenter/apikeys' },
  { id: 'mistral', name: 'Mistral', envs: ['MISTRAL_API_KEY'], url: 'https://console.mistral.ai/api-keys' },
  { id: 'codestral', name: 'Codestral (Tab)', envs: ['CODESTRAL_API_KEY'], url: 'https://console.mistral.ai/codestral' },
];

export interface CustomModelConfig {
  id?: string;
  name?: string;
  baseUrl?: string;
  base_url?: string;
  model?: string;
  apiKey?: string;
  apiKeyEnv?: string;
  free?: boolean;
  capabilities?: string[];
  headers?: Record<string, string>;
}

const KNOWN_CAPS = new Set<Capability>(['text', 'vision', 'tools', 'streaming', 'json', 'reasoning', 'long_context', 'coding', 'fim']);

export function customSpec(raw: CustomModelConfig): ModelSpec | undefined {
  const baseUrl = String(raw.baseUrl || raw.base_url || '').trim().replace(/\/+$/, '');
  const model = String(raw.model || '').trim();
  if (!/^https?:\/\//.test(baseUrl) || !model) return undefined;
  const caps = (raw.capabilities || ['text', 'tools', 'streaming', 'coding'])
    .map((c) => String(c).toLowerCase() as Capability)
    .filter((c) => KNOWN_CAPS.has(c));
  return {
    id: String(raw.id || `custom/${model}`),
    name: String(raw.name || model),
    provider: 'openai',
    baseUrl,
    model,
    apiKey: raw.apiKey ? String(raw.apiKey) : undefined,
    apiKeyEnvs: raw.apiKeyEnv ? [String(raw.apiKeyEnv)] : undefined,
    // A user endpoint joins automatic failover only when it says it is free, so a fallback never bills silently.
    free: raw.free === true || /\/free$|:free$/.test(String(raw.id || model)),
    capabilities: caps.length ? caps : ['text', 'streaming'],
    source: 'custom',
    headers: raw.headers,
  };
}

export function isExplicitlyFree(spec: Pick<ModelSpec, 'free' | 'id' | 'model'>): boolean {
  if (spec.free === true) return true;
  const id = spec.id.toLowerCase();
  const model = spec.model.toLowerCase();
  return id.endsWith('/free') || model.endsWith(':free') || model === 'openrouter/free';
}

export function supports(spec: Pick<ModelSpec, 'capabilities'>, required: Iterable<Capability>): boolean {
  const caps = new Set(spec.capabilities);
  for (const cap of required) if (!caps.has(cap)) return false;
  return true;
}
