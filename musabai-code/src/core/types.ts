export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface TextPart {
  type: 'text';
  text: string;
}

export interface ImagePart {
  type: 'image_url';
  image_url: { url: string };
}

export type ContentPart = TextPart | ImagePart;

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: Role;
  content: string | ContentPart[] | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export type JsonSchema = {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  additionalProperties?: boolean | JsonSchema;
  default?: unknown;
  [key: string]: unknown;
};

export interface ToolSpec {
  type: 'function';
  function: { name: string; description: string; parameters: JsonSchema };
}

export type Capability =
  | 'text'
  | 'vision'
  | 'tools'
  | 'streaming'
  | 'json'
  | 'reasoning'
  | 'long_context'
  | 'coding'
  | 'fim';

export type ProviderKind = 'openai' | 'aihorde' | 'ollama' | 'llamacpp' | 'mistral-fim';

export type ModelSource = 'builtin' | 'kilo' | 'local' | 'custom' | 'gateway';

export interface ModelSpec {
  id: string;
  name: string;
  provider: ProviderKind;
  baseUrl: string;
  model: string;
  free: boolean;
  capabilities: Capability[];
  source: ModelSource;
  apiKey?: string;
  apiKeyEnvs?: string[];
  secretId?: string;
  headers?: Record<string, string>;
  extraBody?: Record<string, unknown>;
  contextWindow?: number;
  maxOutputTokens?: number;
  note?: string;
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
}

export interface Completion {
  content: string;
  reasoning: string;
  toolCalls: ToolCall[];
  finishReason: string;
  usage: Usage;
  modelId: string;
  model: string;
  ttftMs: number;
  totalMs: number;
}

export type StreamEvent =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'tool_start'; index: number; id: string; name: string }
  | { type: 'tool_args'; index: number; delta: string };

export interface ChatRequest {
  messages: ChatMessage[];
  tools?: ToolSpec[];
  maxTokens?: number;
  temperature?: number;
  reasoning?: 'low' | 'medium' | 'high';
  responseFormat?: Record<string, unknown>;
  signal?: AbortSignal;
  onEvent?: (event: StreamEvent) => void;
}

export interface KeyResolver {
  (spec: ModelSpec): string | undefined | Promise<string | undefined>;
}
