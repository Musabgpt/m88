import type { ChangeTracker } from '../changes';
import type { CheckpointStore } from '../checkpoints';
import type { AgentHost, ApprovalRequest, ApprovalResult } from '../host';
import type { CommandPolicy } from '../policy';
import type { Rule } from '../rules';
import type { ContentPart, JsonSchema } from '../types';

export type ModeName = 'agent' | 'plan' | 'ask' | 'manual' | string;

export interface ModeDefinition {
  id: ModeName;
  label: string;
  /** Tool names, or categories prefixed with '#'. */
  tools: string[];
  instructions: string;
}

export interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
}

export type AgentEvent =
  | { type: 'turn_start'; turnId: string; mode: ModeName; modelId: string }
  | { type: 'status'; message: string }
  | { type: 'model'; modelId: string; name: string; fallbackFrom?: string }
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'reset_draft' }
  | { type: 'tool_pending'; callId: string; name: string }
  | { type: 'tool_start'; callId: string; name: string; title: string; args: Record<string, unknown> }
  | { type: 'tool_output'; callId: string; chunk: string }
  | { type: 'tool_end'; callId: string; name: string; ok: boolean; summary: string; detail?: string; meta?: Record<string, unknown> }
  | { type: 'file_changed'; path: string; rel: string; added: number; removed: number; created?: boolean; deleted?: boolean }
  | { type: 'todos'; todos: TodoItem[] }
  | { type: 'usage'; modelId: string; promptTokens: number; completionTokens: number }
  | { type: 'step'; step: number }
  | { type: 'done'; reason: 'completed' | 'max_steps' | 'cancelled' | 'error'; error?: string };

export interface ToolResult {
  ok: boolean;
  /** What the model reads. */
  content: string;
  /** One line for the chat, e.g. "Edited src/a.ts (+3 −1)". */
  summary: string;
  /** Longer text the user can expand (command output, a diff). */
  detail?: string;
  meta?: Record<string, unknown>;
  /** data: URLs a vision model should see next. */
  images?: string[];
}

export interface McpToolRef {
  server: string;
  name: string;
  description: string;
  inputSchema: JsonSchema;
  readOnlyHint?: boolean;
}

export interface McpLike {
  tools(): McpToolRef[];
  call(server: string, tool: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<{ text: string; images: string[]; isError: boolean }>;
}

export interface IndexLike {
  search(query: string, limit: number): Promise<{ path: string; startLine: number; endLine: number; text: string; score: number }[]>;
}

export interface ToolContext {
  host: AgentHost;
  root: string;
  turnId: string;
  callId: string;
  mode: ModeName;
  signal?: AbortSignal;
  emit: (event: AgentEvent) => void;
  policy: CommandPolicy;
  /** Asks the user unless an earlier "always" covers the request. */
  approve: (request: ApprovalRequest, key?: string) => Promise<ApprovalResult>;
  changes?: ChangeTracker;
  checkpoints?: CheckpointStore;
  rules: Rule[];
  todos: TodoItem[];
  setTodos: (todos: TodoItem[]) => void;
  index?: IndexLike;
  mcp?: McpLike;
  github?: () => Promise<import('../github').GitHubApi | undefined>;
  fetchImpl?: typeof fetch;
  /** Files the agent read or changed in this session, newest last. */
  touched: Set<string>;
  visionModel: boolean;
  /** The folder whose .musabai/memory.md holds the project notes; default root. */
  memoryRoot?: string;
  /** Review tracking for memory changes when they land outside root (see memoryRoot); default changes. */
  memoryChanges?: ChangeTracker;
}

export interface Tool {
  name: string;
  description: string;
  parameters: JsonSchema;
  /** Allowed in read-only modes (Ask, Plan). */
  readOnly: boolean;
  category: 'files' | 'search' | 'edit' | 'terminal' | 'web' | 'git' | 'github' | 'laptop' | 'browser' | 'mcp' | 'meta';
  title(args: Record<string, unknown>): string;
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}

export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
  }
}

export function str(args: Record<string, unknown>, key: string, required = true): string {
  const value = args[key];
  if (value === undefined || value === null || value === '') {
    if (required) throw new ToolError(`Missing required argument "${key}".`);
    return '';
  }
  return typeof value === 'string' ? value : String(value);
}

export function num(args: Record<string, unknown>, key: string, fallback: number, min = -Infinity, max = Infinity): number {
  const value = args[key];
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new ToolError(`Argument "${key}" must be a number.`);
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export function bool(args: Record<string, unknown>, key: string, fallback = false): boolean {
  const value = args[key];
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

export function contentText(content: string | ContentPart[] | null): string {
  if (typeof content === 'string') return content;
  if (!content) return '';
  return content.map((p) => (p.type === 'text' ? p.text : '[image]')).join('\n');
}
