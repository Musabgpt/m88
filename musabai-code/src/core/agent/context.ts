import type { ChatMessage, ToolCall, ToolSpec } from '../types';

/**
 * Non-destructive request projection (port of MusabAI's request_context.py). When a thread outgrows the working
 * budget, older tool results and the long arguments of older calls are shortened in place: every call keeps its id,
 * name and valid JSON arguments, and every result stays a tool message right after its call. The latest PROTECT
 * calls keep their results whole. Stored history is never changed.
 */
export const PROTECT = 6;
export const RESULT_KEEP = 600;
export const ARG_KEEP = 300;
export const TEXT_KEEP = 4000;
const RESULT_NOTE = '\n(Earlier result shortened to save space: read the file or run the command again if you need all of it.)';
export const OMITTED_RE = /…\[\d+ characters of this earlier value omitted\]…/;

function size(value: unknown): number {
  return JSON.stringify(value).length;
}

export function shorten(text: string, keep: number): string {
  if (text.length <= keep + 80) return text;
  const head = Math.floor((keep * 2) / 3);
  const tail = keep - head;
  return `${text.slice(0, head)}\n…[${text.length - head - tail} characters of this earlier value omitted]…\n${text.slice(-tail)}`;
}

function shortCall(call: ToolCall): ToolCall {
  const raw = call.function.arguments;
  if (typeof raw !== 'string' || raw.length <= ARG_KEEP + 80) return call;
  let args: unknown;
  try {
    args = JSON.parse(raw);
  } catch {
    return call;
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)) return call;
  const short: Record<string, unknown> = {};
  let changed = false;
  for (const [k, v] of Object.entries(args as Record<string, unknown>)) {
    if (typeof v === 'string') {
      const s = shorten(v, ARG_KEEP);
      changed ||= s !== v;
      short[k] = s;
    } else short[k] = v;
  }
  return changed ? { ...call, function: { ...call.function, arguments: JSON.stringify(short) } } : call;
}

type Group = ChatMessage[];

function complete(group: Group): boolean {
  const calls = group[0].tool_calls || [];
  if (!calls.length) return false;
  const ids = new Set(calls.map((c) => c.id));
  const answered = new Set(group.slice(1).map((m) => m.tool_call_id));
  return ids.size === answered.size && [...ids].every((id) => answered.has(id));
}

function shortResults(group: Group): Group {
  return [
    group[0],
    ...group.slice(1).map((m) =>
      typeof m.content === 'string' && m.content.length > RESULT_KEEP + 200 && !OMITTED_RE.test(m.content)
        ? { ...m, content: shorten(m.content, RESULT_KEEP) + RESULT_NOTE }
        : m,
    ),
  ];
}

function shortCalls(group: Group): Group {
  return [{ ...group[0], tool_calls: group[0].tool_calls!.map(shortCall) }, ...group.slice(1)];
}

export function workingBudget(tools: ToolSpec[] = []): number {
  return Math.max(24_000, 96_000 - size(tools));
}

export function project(messages: ChatMessage[], tools: ToolSpec[] = [], options: { local?: boolean; budget?: number } = {}): ChatMessage[] {
  if (options.local) return messages;
  const budget = options.budget ?? workingBudget(tools);
  const before = size(messages);
  if (before <= budget) return messages;
  const groups: Group[] = [];
  for (let i = 0; i < messages.length; ) {
    const message = messages[i++];
    const group: Group = [message];
    if (message.role === 'assistant' && message.tool_calls?.length) {
      while (i < messages.length && messages[i].role === 'tool') group.push(messages[i++]);
    }
    groups.push(group);
  }
  const withCalls = groups.map((g, i) => (g[0].tool_calls?.length ? i : -1)).filter((i) => i >= 0);
  const recent = new Set(withCalls.slice(-PROTECT));
  let total = before;
  const apply = (index: number, replacement: Group) => {
    const saving = size(groups[index]) - size(replacement);
    if (saving > 0) {
      groups[index] = replacement;
      total -= saving;
    }
  };
  // 1. Older calls, oldest first: their results and long arguments; long older assistant texts.
  for (let index = 0; index < groups.length && total > budget; index++) {
    if (recent.has(index)) continue;
    const group = groups[index];
    if (complete(group)) apply(index, shortCalls(shortResults(group)));
    else if (group.length === 1 && group[0].role === 'assistant' && !group[0].tool_calls?.length && typeof group[0].content === 'string' && group[0].content.length > 6000) {
      apply(index, [{ ...group[0], content: shorten(group[0].content, TEXT_KEEP) }]);
    }
  }
  // 2. Still over: the long arguments of the recent calls (a file written), never their results.
  for (const index of [...recent].sort((a, b) => a - b)) {
    if (total <= budget) break;
    if (complete(groups[index])) apply(index, shortCalls(groups[index]));
  }
  return groups.flat();
}
