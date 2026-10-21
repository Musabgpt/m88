import type { ChangeTracker } from '../changes';
import type { CheckpointStore } from '../checkpoints';
import type { GitHubApi } from '../github';
import type { AgentHost, ApprovalRequest, ApprovalResult } from '../host';
import type { CommandPolicy } from '../policy';
import { CancelledError, ProviderError, isCancelled } from '../providers/errors';
import { type PoolResult, type ProviderPool, ProviderUnavailable } from '../providers/pool';
import type { Rule } from '../rules';
import { toolSpecs, toolsForMode } from '../tools';
import type { AgentEvent, IndexLike, McpLike, ModeDefinition, TodoItem, Tool, ToolContext, ToolResult } from '../tools/types';
import type { ChatMessage, ContentPart, ToolCall } from '../types';
import { parseArgs, truncateMiddle } from '../util';
import { project } from './context';
import { type PromptContext, systemPrompt } from './prompts';

export interface AgentDeps {
  pool: ProviderPool;
  host: AgentHost;
  emit: (event: AgentEvent) => void;
  policy: () => CommandPolicy;
  /** Asks the user. A key marks a request the user may "always allow". */
  approve: (request: ApprovalRequest, key?: string) => Promise<ApprovalResult>;
  environment: () => Promise<Omit<PromptContext, 'mode' | 'rulesText' | 'toolNames'>>;
  rules: (referencedFiles: string[], mentionedRules: string[]) => Promise<{ rules: Rule[]; text: string }>;
  changes?: ChangeTracker;
  checkpoints?: CheckpointStore;
  index?: IndexLike;
  mcp?: McpLike;
  github?: () => Promise<GitHubApi | undefined>;
  fetchImpl?: typeof fetch;
  disabledTools?: () => string[];
  maxSteps?: number;
  maxOutputTokens?: number;
}

export interface TurnInput {
  turnId: string;
  text: string;
  mode: ModeDefinition;
  modelId: string;
  images?: string[];
  context?: string;
  referencedFiles?: string[];
  mentionedRules?: string[];
  signal?: AbortSignal;
}

export interface TurnResult {
  reason: 'completed' | 'max_steps' | 'cancelled' | 'error';
  error?: string;
  text: string;
  modelId?: string;
}

const RESULT_LIMIT = 30_000;

function shortId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < 9; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function publicError(error: unknown): string {
  if (error instanceof ProviderUnavailable) {
    const wait = error.retryAfterMs ? ` Try again in about ${Math.ceil(error.retryAfterMs / 1000)} s.` : '';
    return (
      `The free AI providers that can do this are busy or unavailable right now; your progress is saved.${wait} ` +
      'For more capacity add a free key (Groq, Gemini, OpenRouter…) in MusabAI Settings, or run a local model with Ollama. ' +
      `(${error.message})`
    );
  }
  if (error instanceof ProviderError) return `The model provider failed: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}

function missingRequired(tool: Tool, args: Record<string, unknown>): string[] {
  const required = (tool.parameters.required as string[] | undefined) ?? [];
  return required.filter((key) => args[key] === undefined || args[key] === null);
}

/** One chat thread: history, todo list and the "always allow" answers of this session. */
export class AgentSession {
  history: ChatMessage[] = [];
  todos: TodoItem[] = [];
  readonly touched = new Set<string>();
  private readonly turnStarts: { turnId: string; index: number }[] = [];
  private readonly allowed = new Set<string>();
  private rules: Rule[] = [];

  constructor(private readonly deps: AgentDeps) {}

  private async approve(request: ApprovalRequest, key?: string): Promise<ApprovalResult> {
    if (key && this.allowed.has(key)) return 'allow';
    const answer = await this.deps.approve(request, key);
    if (answer === 'always' && key) this.allowed.add(key);
    return answer;
  }

  allow(key: string): void {
    this.allowed.add(key);
  }

  /** Drops this turn and everything after it from the conversation (checkpoint restore). */
  truncateFrom(turnId: string): boolean {
    const at = this.turnStarts.findIndex((t) => t.turnId === turnId);
    if (at < 0) return false;
    this.history = this.history.slice(0, this.turnStarts[at].index);
    this.turnStarts.splice(at);
    return true;
  }

  private userContent(input: TurnInput): string | ContentPart[] {
    const text = input.context ? `${input.context}\n\n<user_request>\n${input.text}\n</user_request>` : input.text;
    if (!input.images?.length) return text;
    return [{ type: 'text', text }, ...input.images.map((url): ContentPart => ({ type: 'image_url', image_url: { url } }))];
  }

  /** Images are sent while their turn runs; afterwards a short note keeps later turns text-only. */
  private dropImages(): void {
    this.history = this.history.map((m) => {
      if (!Array.isArray(m.content) || !m.content.some((p) => p.type === 'image_url')) return m;
      const parts = m.content.map((p) => (p.type === 'image_url' ? '[an image the user attached earlier]' : p.text));
      return { ...m, content: parts.join('\n') };
    });
  }

  async run(input: TurnInput): Promise<TurnResult> {
    const { pool, emit } = this.deps;
    const signal = input.signal;
    this.turnStarts.push({ turnId: input.turnId, index: this.history.length });
    this.history.push({ role: 'user', content: this.userContent(input) });
    this.deps.checkpoints?.begin(input.turnId);
    emit({ type: 'turn_start', turnId: input.turnId, mode: input.mode.id, modelId: input.modelId });

    const tools = toolsForMode(input.mode, this.deps.mcp?.tools() ?? [], this.deps.disabledTools?.() ?? []);
    const specs = toolSpecs(tools);
    const excluded = new Set<string>();
    const maxSteps = this.deps.maxSteps ?? 60;
    let invalidStreak = 0;
    let retries = 0;
    let finalText = '';
    let modelId: string | undefined;

    const finish = (reason: TurnResult['reason'], error?: string): TurnResult => {
      this.dropImages();
      emit({ type: 'done', reason, error });
      return { reason, error, text: finalText, modelId };
    };

    for (let step = 1; step <= maxSteps; step++) {
      if (signal?.aborted) return finish('cancelled');
      emit({ type: 'step', step });
      const referenced = [...(input.referencedFiles ?? []), ...this.touched];
      const { rules, text: rulesText } = await this.deps.rules(referenced, input.mentionedRules ?? []);
      this.rules = rules;
      const env = await this.deps.environment();
      const system = systemPrompt({ ...env, mode: input.mode, rulesText, toolNames: tools.map((t) => t.name) });
      const current = await pool.resolve(input.modelId);
      const messages: ChatMessage[] = [{ role: 'system', content: system }, ...project(this.history, specs, { local: current?.source === 'local' })];

      let completion: PoolResult;
      try {
        completion = await pool.chat(
          input.modelId,
          {
            messages,
            tools: specs.length ? specs : undefined,
            maxTokens: this.deps.maxOutputTokens ?? 8192,
            signal,
            onEvent: (event) => {
              if (event.type === 'text') emit({ type: 'text', text: event.text });
              else if (event.type === 'reasoning') emit({ type: 'reasoning', text: event.text });
              else if (event.type === 'tool_start') emit({ type: 'tool_pending', callId: `${step}:${event.index}`, name: event.name });
            },
          },
          {
            excluded,
            onReset: () => emit({ type: 'reset_draft' }),
            onStatus: (message) => emit({ type: 'status', message }),
          },
        );
      } catch (error) {
        if (isCancelled(error) || error instanceof CancelledError || signal?.aborted) return finish('cancelled');
        return finish('error', publicError(error));
      }
      modelId = completion.spec.id;
      emit({ type: 'model', modelId: completion.spec.id, name: completion.spec.name, fallbackFrom: completion.fallbackFrom });
      emit({ type: 'usage', modelId: completion.spec.id, promptTokens: completion.usage.promptTokens, completionTokens: completion.usage.completionTokens });

      const truncated = completion.finishReason === 'length';
      const parsed = completion.toolCalls.map((call) => {
        const tool = tools.find((t) => t.name === call.function.name);
        let args: Record<string, unknown> = {};
        let problem = '';
        if (!tool) problem = `Unknown tool "${call.function.name}". Available tools: ${tools.map((t) => t.name).join(', ')}.`;
        else {
          try {
            args = parseArgs(call.function.arguments, truncated);
            const missing = missingRequired(tool, args);
            if (missing.length) problem = `Missing required arguments: ${missing.join(', ')}.`;
          } catch (error) {
            problem = truncated
              ? 'Your output was cut off by the length limit, so these arguments are incomplete. Make smaller edits (several edit_file calls) instead of one huge one.'
              : `Arguments are not valid JSON (${(error as Error).message}).`;
          }
        }
        return { call, tool, args, problem };
      });

      const bad = parsed.filter((p) => p.problem);
      if (bad.length && invalidStreak >= 1 && retries < 3) {
        // The same model keeps sending broken calls: nothing ran, so another free model can redo this step.
        const error = new ProviderError(`invalid tool calls: ${bad[0].problem}`, 400);
        error.code = 'invalid_tool_call';
        pool.health.failure(completion.spec.id, error, completion.spec.baseUrl);
        excluded.add(completion.spec.id);
        emit({ type: 'reset_draft' });
        emit({ type: 'status', message: `${completion.spec.name} sent invalid tool calls; trying another free model` });
        retries++;
        invalidStreak = 0;
        step--;
        continue;
      }
      invalidStreak = bad.length ? invalidStreak + 1 : 0;

      const calls: ToolCall[] = parsed.map((p) => ({ ...p.call, id: shortId() }));
      this.history.push({ role: 'assistant', content: completion.content || '', tool_calls: calls.length ? calls : undefined });
      if (completion.content) finalText = completion.content;

      if (!calls.length) {
        if (!completion.content.trim() && truncated) return finish('error', 'The model stopped at its output limit without an answer. Try again or pick another model.');
        return finish('completed');
      }

      const images: string[] = [];
      for (let i = 0; i < parsed.length; i++) {
        const { tool, args, problem } = parsed[i];
        const id = calls[i].id;
        const callId = `${input.turnId}:${id}`;
        if (signal?.aborted) {
          this.history.push({ role: 'tool', tool_call_id: id, content: 'Cancelled by the user before it ran.' });
          continue;
        }
        if (!tool || problem) {
          this.history.push({ role: 'tool', tool_call_id: id, content: `Error: ${problem} No tool ran. Correct the call and try again.` });
          emit({ type: 'tool_end', callId, name: calls[i].function.name, ok: false, summary: `Invalid call to ${calls[i].function.name}`, detail: problem });
          continue;
        }
        emit({ type: 'tool_start', callId, name: tool.name, title: tool.title(args), args });
        const ctx: ToolContext = {
          host: this.deps.host,
          root: this.deps.host.root,
          turnId: input.turnId,
          callId,
          mode: input.mode.id,
          signal,
          emit,
          policy: this.deps.policy(),
          approve: (request, key) => this.approve(request, key),
          changes: this.deps.changes,
          checkpoints: this.deps.checkpoints,
          rules: this.rules,
          todos: this.todos,
          setTodos: (todos) => {
            this.todos = todos;
            emit({ type: 'todos', todos });
          },
          index: this.deps.index,
          mcp: this.deps.mcp,
          github: this.deps.github,
          fetchImpl: this.deps.fetchImpl,
          touched: this.touched,
          visionModel: completion.spec.capabilities.includes('vision'),
        };
        let result: ToolResult;
        try {
          result = await tool.execute(args, ctx);
        } catch (error) {
          if (isCancelled(error) || signal?.aborted) {
            result = { ok: false, content: 'Cancelled by the user.', summary: `${tool.title(args)} — cancelled` };
          } else {
            const message = error instanceof Error ? error.message : String(error);
            result = { ok: false, content: `Error: ${message}`, summary: `${tool.title(args)} — failed`, detail: message };
          }
        }
        this.history.push({ role: 'tool', tool_call_id: id, content: truncateMiddle(result.content, RESULT_LIMIT, 'tool output') });
        emit({ type: 'tool_end', callId, name: tool.name, ok: result.ok, summary: result.summary, detail: result.detail, meta: result.meta });
        if (result.images?.length) images.push(...result.images);
      }
      if (images.length) {
        this.history.push({
          role: 'user',
          content: [{ type: 'text', text: 'Images returned by the tools above:' }, ...images.map((url): ContentPart => ({ type: 'image_url', image_url: { url } }))],
        });
      }
      if (signal?.aborted) return finish('cancelled');
    }
    return finish('max_steps');
  }
}
