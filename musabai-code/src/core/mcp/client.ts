import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import type { JsonSchema } from '../types';
import { VERSION } from '../version';

export interface McpServerConfig {
  name: string;
  type: 'stdio' | 'http' | 'sse';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
  source: 'project' | 'global';
  configFile: string;
  disabled?: boolean;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: JsonSchema;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; title?: string };
}

export interface McpCallResult {
  text: string;
  images: string[];
  isError: boolean;
}

type Message = { jsonrpc: '2.0'; id?: number | string; method?: string; params?: any; result?: any; error?: { code: number; message: string; data?: unknown } };

interface Transport {
  start(onMessage: (message: Message) => void, onClose: (error?: Error) => void): Promise<void>;
  send(message: Message): Promise<void>;
  close(): Promise<void>;
}

export const PROTOCOL_VERSION = '2025-06-18';

class StdioTransport implements Transport {
  private child?: ChildProcessWithoutNullStreams;
  stderr = '';
  constructor(private readonly config: McpServerConfig, private readonly root: string) {}

  start(onMessage: (m: Message) => void, onClose: (e?: Error) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.config.command!, this.config.args ?? [], {
        cwd: this.config.cwd || this.root,
        env: { ...process.env, ...(this.config.env ?? {}) },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      this.child = child;
      let buffer = '';
      let started = false;
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        buffer += chunk;
        let nl: number;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line.startsWith('{')) continue;
          try {
            onMessage(JSON.parse(line));
          } catch {
            // a server writing logs to stdout: ignore the line
          }
        }
      });
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => {
        this.stderr = (this.stderr + chunk).slice(-8000);
      });
      child.on('error', (error: NodeJS.ErrnoException) => {
        const err = error.code === 'ENOENT' ? new Error(`command not found: ${this.config.command} (is it installed and on PATH?)`) : error;
        if (!started) reject(err);
        else onClose(err);
      });
      child.on('spawn', () => {
        started = true;
        resolve();
      });
      child.on('close', (code) => onClose(code ? new Error(`server exited with code ${code}${this.stderr ? `: ${this.stderr.trim().split('\n').slice(-3).join(' ')}` : ''}`) : undefined));
    });
  }

  async send(message: Message): Promise<void> {
    if (!this.child || this.child.exitCode !== null) throw new Error('server is not running');
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  /** Ends the server and waits until it has exited (SIGTERM, then SIGKILL, if it ignores the closed stdin). */
  async close(): Promise<void> {
    const child = this.child;
    this.child = undefined;
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    await new Promise<void>((resolve) => {
      const term = setTimeout(() => child.kill('SIGTERM'), 1500);
      const kill = setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, 4000);
      child.once('exit', () => {
        clearTimeout(term);
        clearTimeout(kill);
        resolve();
      });
      child.stdin.end();
    });
  }
}

async function* sseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let event = 'message';
  let data: string[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).replace(/\r$/, '');
        buffer = buffer.slice(nl + 1);
        if (line === '') {
          if (data.length) yield { event, data: data.join('\n') };
          event = 'message';
          data = [];
        } else if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      }
    }
    if (data.length) yield { event, data: data.join('\n') };
  } finally {
    reader.cancel().catch(() => undefined);
  }
}

class HttpTransport implements Transport {
  private sessionId?: string;
  private onMessage!: (m: Message) => void;
  protocolVersion?: string;
  constructor(private readonly config: McpServerConfig, private readonly fetchImpl: typeof fetch) {}

  async start(onMessage: (m: Message) => void): Promise<void> {
    this.onMessage = onMessage;
  }

  async send(message: Message): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(this.config.headers ?? {}),
    };
    if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;
    if (this.protocolVersion) headers['MCP-Protocol-Version'] = this.protocolVersion;
    const res = await this.fetchImpl(this.config.url!, { method: 'POST', headers, body: JSON.stringify(message), signal: AbortSignal.timeout(180_000) });
    const session = res.headers.get('mcp-session-id');
    if (session) this.sessionId = session;
    if (res.status === 202 || res.status === 204) return;
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const error = new Error(`HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`) as Error & { status?: number };
      error.status = res.status;
      throw error;
    }
    const type = res.headers.get('content-type') || '';
    if (type.includes('text/event-stream') && res.body) {
      for await (const { data } of sseEvents(res.body)) {
        try {
          const parsed = JSON.parse(data);
          for (const m of Array.isArray(parsed) ? parsed : [parsed]) {
            this.onMessage(m);
            if (message.id !== undefined && m.id === message.id && (m.result !== undefined || m.error)) return;
          }
        } catch {
          // ignore keep-alives
        }
      }
      return;
    }
    const text = await res.text();
    if (!text.trim()) return;
    const parsed = JSON.parse(text);
    for (const m of Array.isArray(parsed) ? parsed : [parsed]) this.onMessage(m);
  }

  async close(): Promise<void> {
    if (!this.sessionId) return;
    await this.fetchImpl(this.config.url!, { method: 'DELETE', headers: { 'Mcp-Session-Id': this.sessionId, ...(this.config.headers ?? {}) } }).catch(() => undefined);
  }
}

class SseTransport implements Transport {
  private endpoint?: string;
  private controller = new AbortController();
  constructor(private readonly config: McpServerConfig, private readonly fetchImpl: typeof fetch) {}

  async start(onMessage: (m: Message) => void, onClose: (e?: Error) => void): Promise<void> {
    const res = await this.fetchImpl(this.config.url!, { headers: { Accept: 'text/event-stream', ...(this.config.headers ?? {}) }, signal: this.controller.signal });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} opening the SSE stream`);
    const events = sseEvents(res.body);
    const first = await Promise.race([
      events.next(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('no endpoint event from the SSE server')), 15_000)),
    ]);
    if (first.done || first.value.event !== 'endpoint') throw new Error('the SSE server did not send its endpoint');
    this.endpoint = new URL(first.value.data.trim(), this.config.url).toString();
    void (async () => {
      try {
        for await (const { event, data } of events) {
          if (event !== 'message') continue;
          try {
            onMessage(JSON.parse(data));
          } catch {
            // ignore
          }
        }
        onClose();
      } catch (error) {
        if (!this.controller.signal.aborted) onClose(error as Error);
      }
    })();
  }

  async send(message: Message): Promise<void> {
    const res = await this.fetchImpl(this.endpoint!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(this.config.headers ?? {}) },
      body: JSON.stringify(message),
    });
    if (!res.ok && res.status !== 202) throw new Error(`HTTP ${res.status}`);
  }

  async close(): Promise<void> {
    this.controller.abort();
  }
}

export type McpState = 'stopped' | 'starting' | 'ready' | 'error';

export class McpClient {
  state: McpState = 'stopped';
  error = '';
  tools: McpTool[] = [];
  serverInfo?: { name?: string; version?: string };
  private transport?: Transport;
  private nextId = 1;
  private readonly pending = new Map<number | string, { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();

  constructor(
    readonly config: McpServerConfig,
    private readonly options: { root: string; fetchImpl?: typeof fetch; clientVersion?: string; log?: (line: string) => void },
  ) {}

  private handle(message: Message): void {
    if (message.id !== undefined && (message.result !== undefined || message.error) && this.pending.has(message.id)) {
      const entry = this.pending.get(message.id)!;
      this.pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.error) entry.reject(new Error(`${message.error.message} (MCP error ${message.error.code})`));
      else entry.resolve(message.result);
      return;
    }
    if (message.method && message.id !== undefined) {
      // A request from the server.
      let response: Message;
      if (message.method === 'ping') response = { jsonrpc: '2.0', id: message.id, result: {} };
      else if (message.method === 'roots/list') response = { jsonrpc: '2.0', id: message.id, result: { roots: [{ uri: `file://${this.options.root}`, name: 'workspace' }] } };
      else response = { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: `MusabAI does not support ${message.method}` } };
      void this.transport?.send(response).catch(() => undefined);
      return;
    }
    if (message.method === 'notifications/tools/list_changed') void this.refreshTools().catch(() => undefined);
  }

  private onClose(error?: Error): void {
    const wasReady = this.state === 'ready' || this.state === 'starting';
    this.state = error ? 'error' : 'stopped';
    if (error) this.error = error.message;
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(error ?? new Error('MCP server closed'));
    }
    this.pending.clear();
    if (wasReady) this.options.log?.(`MCP ${this.config.name} closed${error ? `: ${error.message}` : ''}`);
  }

  request<T = any>(method: string, params: unknown, timeoutMs = 60_000): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out after ${Math.round(timeoutMs / 1000)} s`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.transport!.send({ jsonrpc: '2.0', id, method, params }).catch((error: Error) => {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      });
    });
  }

  private async connect(transport: Transport): Promise<void> {
    this.transport = transport;
    // Events of a transport that was already replaced (a restart, a stop) are ignored: the old process exiting
    // later must not mark the new connection closed or fail its requests.
    await transport.start(
      (m) => {
        if (this.transport === transport) this.handle(m);
      },
      (e) => {
        if (this.transport === transport) this.onClose(e);
      },
    );
    const init = await this.request<{ protocolVersion?: string; serverInfo?: { name?: string; version?: string } }>(
      'initialize',
      { protocolVersion: PROTOCOL_VERSION, capabilities: { roots: { listChanged: false } }, clientInfo: { name: 'musabai-code', version: this.options.clientVersion ?? VERSION } },
      90_000,
    );
    this.serverInfo = init?.serverInfo;
    if (transport instanceof HttpTransport) transport.protocolVersion = init?.protocolVersion || PROTOCOL_VERSION;
    await transport.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  }

  async start(): Promise<void> {
    if (this.state === 'ready' || this.state === 'starting') return;
    this.state = 'starting';
    this.error = '';
    const fetchImpl = this.options.fetchImpl ?? fetch;
    try {
      if (this.config.type === 'stdio') {
        if (!this.config.command) throw new Error('no command configured');
        await this.connect(new StdioTransport(this.config, this.options.root));
      } else if (this.config.type === 'sse') {
        await this.connect(new SseTransport(this.config, fetchImpl));
      } else {
        try {
          await this.connect(new HttpTransport(this.config, fetchImpl));
        } catch (error) {
          const status = (error as { status?: number }).status;
          if (status !== 404 && status !== 405 && status !== 400) throw error;
          await this.connect(new SseTransport(this.config, fetchImpl));
        }
      }
      await this.refreshTools();
      this.state = 'ready';
    } catch (error) {
      this.state = 'error';
      this.error = (error as Error).message;
      await this.transport?.close().catch(() => undefined);
      throw error;
    }
  }

  async refreshTools(): Promise<void> {
    const tools: McpTool[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 20; page++) {
      const res = await this.request<{ tools?: McpTool[]; nextCursor?: string }>('tools/list', cursor ? { cursor } : {}, 30_000);
      tools.push(...(res?.tools ?? []));
      cursor = res?.nextCursor;
      if (!cursor) break;
    }
    this.tools = tools.filter((t) => t && typeof t.name === 'string');
  }

  async callTool(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<McpCallResult> {
    if (this.state !== 'ready') await this.start();
    const call = this.request<{ content?: any[]; isError?: boolean; structuredContent?: unknown }>('tools/call', { name, arguments: args }, 300_000);
    const result = signal
      ? await Promise.race([
          call,
          new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('Cancelled'), { name: 'AbortError' })), { once: true })),
        ])
      : await call;
    const texts: string[] = [];
    const images: string[] = [];
    for (const part of result?.content ?? []) {
      if (part?.type === 'text') texts.push(String(part.text ?? ''));
      else if (part?.type === 'image' && part.data) images.push(`data:${part.mimeType || 'image/png'};base64,${part.data}`);
      else if (part?.type === 'resource' && part.resource) texts.push(`[${part.resource.uri}]\n${part.resource.text ?? '(binary resource)'}`);
      else if (part?.type === 'resource_link') texts.push(`[resource] ${part.name || ''} ${part.uri}`);
      else if (part?.type === 'audio') texts.push('[audio result]');
    }
    if (!texts.length && result?.structuredContent !== undefined) texts.push(JSON.stringify(result.structuredContent, null, 2));
    return { text: texts.join('\n'), images, isError: Boolean(result?.isError) };
  }

  async stop(): Promise<void> {
    const transport = this.transport;
    this.transport = undefined;
    this.state = 'stopped';
    this.tools = [];
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error(`MCP server ${this.config.name} was stopped`));
    }
    this.pending.clear();
    await transport?.close().catch(() => undefined);
  }
}
