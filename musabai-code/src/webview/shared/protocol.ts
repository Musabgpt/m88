/* Messages between the extension host and the chat webview, and the chat-state reducer both sides share. */

export type AgentEventLite =
  | { type: 'turn_start'; turnId: string; mode: string; modelId: string }
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
  | { type: 'todos'; todos: TodoLite[] }
  | { type: 'usage'; modelId: string; promptTokens: number; completionTokens: number }
  | { type: 'step'; step: number }
  | { type: 'done'; reason: 'completed' | 'max_steps' | 'cancelled' | 'error'; error?: string };

export interface TodoLite {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
}

export interface MentionChip {
  /** core Mention, serialized */
  mention: Record<string, unknown> & { type: string };
  label: string;
  icon?: string;
}

export type UiPart =
  | { kind: 'text'; text: string }
  | { kind: 'reasoning'; text: string }
  | { kind: 'status'; text: string }
  | {
      kind: 'tool';
      callId: string;
      name: string;
      title: string;
      status: 'pending' | 'running' | 'done' | 'failed';
      summary?: string;
      detail?: string;
      output?: string;
      meta?: Record<string, unknown>;
      approval?: ApprovalView;
    };

export interface UiMessage {
  id: string;
  role: 'user' | 'assistant';
  turnId: string;
  text?: string;
  mentions?: MentionChip[];
  images?: string[];
  parts?: UiPart[];
  todos?: TodoLite[];
  model?: string;
  mode?: string;
  status?: 'streaming' | 'completed' | 'max_steps' | 'cancelled' | 'error';
  error?: string;
  /** Index of the first part of the current model step: a provider switch discards from here. */
  draftStart?: number;
  createdAt?: number;
}

export interface ChatSummary {
  id: string;
  title: string;
  updatedAt: number;
  running?: boolean;
}

export interface ChatView {
  id: string;
  title: string;
  messages: UiMessage[];
}

export interface ModelOption {
  id: string;
  name: string;
  group: string;
  ready: boolean;
  note?: string;
  vision?: boolean;
  coolingDown?: boolean;
  secretId?: string;
}

export interface ApprovalView {
  id: string;
  kind: 'command' | 'write_outside' | 'delete' | 'laptop' | 'browser' | 'mcp';
  title: string;
  detail: string;
  reason?: string;
  canAlways: boolean;
  answer?: 'allow' | 'deny' | 'always';
}

export interface ChangeFile {
  path: string;
  rel: string;
  added: number;
  removed: number;
  created: boolean;
  deleted: boolean;
}

export interface ViewState {
  modes: { id: string; label: string }[];
  mode: string;
  models: ModelOption[];
  model: string;
  language: 'ar' | 'en';
  workspaceName: string;
  hasWorkspace: boolean;
  /** False in Restricted Mode: every agent command then asks. */
  trusted: boolean;
  runMode: 'ask' | 'allowlist' | 'auto';
  version: string;
  indexStatus?: string;
}

export interface MentionItem {
  chip: MentionChip;
  detail?: string;
  group: string;
}

export type HostMessage =
  | { type: 'init'; state: ViewState; chats: ChatSummary[]; chat: ChatView; changes: ChangeFile[] }
  | { type: 'state'; state: Partial<ViewState> }
  | { type: 'chats'; chats: ChatSummary[]; activeId: string }
  | { type: 'chat'; chat: ChatView }
  | { type: 'chatEvent'; chatId: string; event: ChatEvent }
  | { type: 'mentionResults'; query: string; items: MentionItem[] }
  | { type: 'attach'; chips: MentionChip[]; focus?: boolean }
  | { type: 'changes'; files: ChangeFile[] }
  | { type: 'focusInput'; text?: string; mode?: string; send?: boolean }
  | { type: 'imagePicked'; dataUrl: string };

export type ViewMessage =
  | { type: 'ready' }
  | { type: 'send'; text: string; chips: MentionChip[]; images: string[]; mode: string; model: string }
  | { type: 'stop' }
  | { type: 'newChat' }
  | { type: 'selectChat'; id: string }
  | { type: 'deleteChat'; id: string }
  | { type: 'setMode'; mode: string }
  | { type: 'setRunMode'; mode: 'ask' | 'allowlist' | 'auto' }
  | { type: 'setModel'; model: string }
  | { type: 'mentionQuery'; query: string }
  | { type: 'approval'; id: string; answer: 'allow' | 'deny' | 'always' }
  | { type: 'acceptAll' }
  | { type: 'rejectAll' }
  | { type: 'acceptFile'; path: string }
  | { type: 'rejectFile'; path: string }
  | { type: 'reviewFile'; path: string }
  | { type: 'reviewAll' }
  | { type: 'openFile'; path: string; line?: number }
  | { type: 'restore'; turnId: string }
  | { type: 'copy'; text: string }
  | { type: 'insertCode'; code: string }
  | { type: 'applyCode'; code: string; lang?: string; file?: string }
  | { type: 'runInTerminal'; command: string }
  | { type: 'build'; messageId: string }
  | { type: 'openSettings'; section?: string }
  | { type: 'manageTrust' }
  | { type: 'openFolder' }
  | { type: 'pickImage' }
  | { type: 'slash'; command: string; text?: string };

export type ChatEvent =
  | { type: 'user'; message: UiMessage }
  | { type: 'assistant'; message: UiMessage }
  | { type: 'agent'; messageId: string; event: AgentEventLite }
  | { type: 'approval'; messageId: string; approval: ApprovalView }
  | { type: 'approvalDone'; messageId: string; approvalId: string; answer: 'allow' | 'deny' | 'always' }
  | { type: 'truncate'; fromMessageId: string };

const OUTPUT_CAP = 20_000;

function findTool(message: UiMessage, callId: string) {
  return message.parts?.find((p): p is Extract<UiPart, { kind: 'tool' }> => p.kind === 'tool' && p.callId === callId);
}

/** Applies one event to a chat. Pure: the host persists chats with it and the webview renders with it. */
export function reduceChat(chat: ChatView, event: ChatEvent): UiMessage | undefined {
  if (event.type === 'user' || event.type === 'assistant') {
    chat.messages.push(event.message);
    return event.message;
  }
  if (event.type === 'truncate') {
    const at = chat.messages.findIndex((m) => m.id === event.fromMessageId);
    if (at >= 0) chat.messages.splice(at);
    return undefined;
  }
  const message = chat.messages.find((m) => m.id === event.messageId);
  if (!message) return undefined;
  const parts = (message.parts ??= []);
  if (event.type === 'approval') {
    const tool = [...parts].reverse().find((p): p is Extract<UiPart, { kind: 'tool' }> => p.kind === 'tool' && (p.status === 'running' || p.status === 'pending'));
    if (tool) tool.approval = event.approval;
    else parts.push({ kind: 'tool', callId: `approval-${event.approval.id}`, name: event.approval.kind, title: event.approval.title, status: 'running', approval: event.approval });
    return message;
  }
  if (event.type === 'approvalDone') {
    for (const p of parts) if (p.kind === 'tool' && p.approval?.id === event.approvalId) p.approval = { ...p.approval, answer: event.answer };
    return message;
  }
  const ev = event.event;
  switch (ev.type) {
    case 'step':
      message.draftStart = parts.length;
      break;
    case 'text': {
      const last = parts[parts.length - 1];
      if (last?.kind === 'text') last.text += ev.text;
      else parts.push({ kind: 'text', text: ev.text });
      break;
    }
    case 'reasoning': {
      const last = parts[parts.length - 1];
      if (last?.kind === 'reasoning') last.text += ev.text;
      else parts.push({ kind: 'reasoning', text: ev.text });
      break;
    }
    case 'reset_draft':
      parts.splice(message.draftStart ?? parts.length);
      break;
    case 'status': {
      const last = parts[parts.length - 1];
      if (!(last?.kind === 'status' && last.text === ev.message)) parts.push({ kind: 'status', text: ev.message });
      break;
    }
    case 'tool_pending':
      parts.push({ kind: 'tool', callId: ev.callId, name: ev.name, title: ev.name.replace(/_/g, ' '), status: 'pending' });
      break;
    case 'tool_start': {
      const pending = parts.find((p): p is Extract<UiPart, { kind: 'tool' }> => p.kind === 'tool' && p.status === 'pending' && p.name === ev.name);
      if (pending) Object.assign(pending, { callId: ev.callId, title: ev.title, status: 'running' });
      else parts.push({ kind: 'tool', callId: ev.callId, name: ev.name, title: ev.title, status: 'running' });
      break;
    }
    case 'tool_output': {
      const tool = findTool(message, ev.callId);
      if (tool) {
        tool.output = (tool.output ?? '') + ev.chunk;
        if (tool.output.length > OUTPUT_CAP) tool.output = tool.output.slice(-OUTPUT_CAP);
      }
      break;
    }
    case 'tool_end': {
      let tool = findTool(message, ev.callId);
      if (!tool) {
        tool = { kind: 'tool', callId: ev.callId, name: ev.name, title: ev.summary, status: 'running' };
        parts.push(tool);
      }
      tool.status = ev.ok ? 'done' : 'failed';
      tool.summary = ev.summary;
      tool.detail = ev.detail && ev.detail.length > OUTPUT_CAP ? ev.detail.slice(-OUTPUT_CAP) : ev.detail;
      tool.meta = ev.meta;
      break;
    }
    case 'todos':
      message.todos = ev.todos;
      break;
    case 'model':
      message.model = ev.name;
      break;
    case 'done':
      message.status = ev.reason;
      message.error = ev.error;
      for (const p of parts) if (p.kind === 'tool' && (p.status === 'running' || p.status === 'pending')) p.status = ev.reason === 'completed' ? 'done' : 'failed';
      break;
    default:
      break;
  }
  return message;
}
