/* The phone link's page: mirrors the editor chat over a WebSocket, sends prompts, answers approvals and stops a run.
   It applies the editor's own chat reducer, so the phone shows exactly what the chat view shows. */
import { h } from '../shared/dom';
import { type ApprovalView, type ChatView, type HostToPhone, type PhoneToHost, type UiMessage, reduceChat } from '../shared/protocol';

interface Strings {
  connecting: string;
  connected: string;
  reconnecting: string;
  expired: string;
  empty: string;
  send: string;
  stop: string;
  working: string;
  tool: string;
  allow: string;
  skip: string;
  allowed: string;
  skipped: string;
  stopped: string;
}

const T = JSON.parse(document.getElementById('strings')?.textContent || '{}') as Strings;

// The one-time pairing token has done its job: the session cookie keeps this phone linked, so drop it from the address bar.
if (location.search) history.replaceState(null, '', location.pathname);

const log = document.getElementById('log')!;
const input = document.getElementById('in') as HTMLTextAreaElement;
const button = document.getElementById('send') as HTMLButtonElement;
const dot = document.getElementById('dot')!;
const status = document.getElementById('st')!;
const banner = document.getElementById('notice')!;

let chat: ChatView = { id: '', title: '', messages: [] };
const elements = new Map<string, HTMLElement>();
const pending = new Set<string>();
let frame = 0;
let ws: WebSocket | undefined;
let backoff = 1000;
let connected = false;
let expired = false;
let bannerTimer: ReturnType<typeof setTimeout> | undefined;

function post(message: PhoneToHost): void {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}

function running(): boolean {
  const last = chat.messages[chat.messages.length - 1];
  return last?.role === 'assistant' && last.status === 'streaming';
}

function nearBottom(): boolean {
  return log.scrollHeight - log.scrollTop - log.clientHeight < 80;
}

function updateComposer(): void {
  const busy = running();
  button.textContent = busy ? T.stop : T.send;
  button.classList.toggle('stop', busy);
  button.disabled = !connected;
}

function setStatus(): void {
  dot.className = `dot${connected ? ' on' : ''}`;
  status.textContent = expired ? T.expired : connected ? T.connected : T.reconnecting;
  updateComposer();
}

function showNotice(text: string): void {
  banner.textContent = text;
  banner.classList.add('show');
  if (bannerTimer) clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => banner.classList.remove('show'), 6000);
}

function renderApproval(a: ApprovalView): HTMLElement {
  if (a.answer) return h('div', { class: `approval-done ${a.answer}` }, a.answer === 'deny' ? T.skipped : T.allowed);
  return h(
    'div',
    { class: 'approval' },
    h('div', { class: 'approval-title', dir: 'auto' }, `🛡 ${a.title}`),
    h('pre', { class: 'approval-detail', dir: 'auto' }, a.detail),
    a.reason ? h('div', { class: 'muted', dir: 'auto' }, a.reason) : null,
    h(
      'div',
      { class: 'approval-actions' },
      h('button', { class: 'primary', onclick: () => post({ type: 'approval', id: a.id, answer: 'allow' }) }, T.allow),
      h('button', { class: 'secondary', onclick: () => post({ type: 'approval', id: a.id, answer: 'deny' }) }, T.skip),
    ),
  );
}

function renderMessage(m: UiMessage): HTMLElement {
  const item = h('div', { class: 'item' });
  if (m.role === 'user') {
    item.append(h('div', { class: 'msg user', dir: 'auto' }, m.text || ''));
    return item;
  }
  for (const part of m.parts ?? []) {
    if (part.kind === 'text') {
      if (part.text.trim()) item.append(h('div', { class: 'msg bot', dir: 'auto' }, part.text));
    } else if (part.kind === 'status') {
      item.append(h('div', { class: 'tool muted', dir: 'auto' }, part.text));
    } else if (part.kind === 'tool') {
      const mark = part.status === 'running' || part.status === 'pending' ? '⏳' : part.status === 'failed' ? '⚠️' : '✓';
      item.append(h('div', { class: 'tool', dir: 'auto' }, h('b', null, `${mark} ${part.summary || part.title || T.tool}`)));
      if (part.approval) item.append(renderApproval(part.approval));
    }
  }
  if (m.status === 'streaming') item.append(h('div', { class: 'tool' }, `⏳ ${T.working}`));
  else if (m.status === 'error' && m.error) item.append(h('div', { class: 'tool error', dir: 'auto' }, `⚠️ ${m.error}`));
  else if (m.status === 'cancelled') item.append(h('div', { class: 'tool' }, T.stopped));
  elements.set(m.id, item);
  return item;
}

function renderAll(): void {
  elements.clear();
  pending.clear();
  log.replaceChildren(...(chat.messages.length ? chat.messages.map(renderMessage) : [h('div', { class: 'empty' }, T.empty)]));
  log.scrollTop = log.scrollHeight;
  updateComposer();
}

/** Re-renders only the messages that changed, at most once a frame, however fast the text streams in. */
function schedule(id: string): void {
  pending.add(id);
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    const stick = nearBottom();
    for (const mid of pending) {
      const message = chat.messages.find((m) => m.id === mid);
      if (!message) continue;
      const old = elements.get(mid);
      const fresh = renderMessage(message);
      if (old) old.replaceWith(fresh);
      else log.append(fresh);
    }
    pending.clear();
    if (stick) log.scrollTop = log.scrollHeight;
    updateComposer();
  });
}

function handle(m: HostToPhone): void {
  switch (m.type) {
    case 'init':
    case 'chat':
      chat = m.chat;
      renderAll();
      break;
    case 'chatEvent': {
      // Only the chat on the screen: a chat still running in the background on the laptop does not leak into it.
      if (m.chatId !== chat.id) break;
      const wasEmpty = !chat.messages.length;
      const message = reduceChat(chat, m.event);
      if (m.event.type === 'truncate' || wasEmpty) renderAll();
      else if (message) schedule(message.id);
      break;
    }
    case 'notice':
      showNotice(m.text);
      if (m.restore && !input.value.trim()) {
        input.value = m.restore;
        autosize();
      }
      break;
  }
}

function connect(): void {
  const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws = socket;
  socket.onopen = () => {
    connected = true;
    backoff = 1000;
    setStatus();
  };
  socket.onmessage = (e) => {
    try {
      handle(JSON.parse(String(e.data)) as HostToPhone);
    } catch {
      // ignore a malformed message
    }
  };
  socket.onerror = () => socket.close();
  socket.onclose = () => {
    if (ws !== socket) return;
    connected = false;
    setStatus();
    // A link that was stopped (or restarted with a new code) does not come back: stop retrying and say so.
    void fetch('/session', { cache: 'no-store', credentials: 'same-origin' })
      .then((res) => {
        if (res.status === 401 || res.status === 403) {
          expired = true;
          setStatus();
        } else retry();
      })
      .catch(retry);
  };
}

function retry(): void {
  setTimeout(connect, backoff);
  backoff = Math.min(backoff * 2, 15000);
}

function autosize(): void {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
}

function submit(): void {
  if (running()) return post({ type: 'stop' });
  const text = input.value.trim();
  if (!text || !connected) return;
  post({ type: 'send', text });
  input.value = '';
  autosize();
}

button.addEventListener('click', submit);
input.addEventListener('input', autosize);
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    if (!running()) submit();
  }
});
status.textContent = T.connecting;
renderAll();
connect();
