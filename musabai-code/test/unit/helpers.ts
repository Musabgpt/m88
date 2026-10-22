import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export interface Recorded {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: any;
}

export type Handler = (req: Recorded, res: http.ServerResponse) => void | Promise<void>;

export interface MockServer {
  url: string;
  requests: Recorded[];
  close(): Promise<void>;
}

export async function mockServer(routes: Record<string, Handler | Handler[]>): Promise<MockServer> {
  const requests: Recorded[] = [];
  const counters = new Map<string, number>();
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', async () => {
      let body: any = raw;
      try {
        body = raw ? JSON.parse(raw) : undefined;
      } catch {
        // keep raw text
      }
      const record: Recorded = { method: req.method || 'GET', url: req.url || '/', headers: req.headers, body };
      requests.push(record);
      const pathname = (req.url || '/').split('?')[0];
      const key = `${req.method} ${pathname}`;
      const entry = routes[key] ?? routes[pathname];
      if (!entry) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { message: `no route ${key}` } }));
        return;
      }
      const index = counters.get(key) ?? 0;
      counters.set(key, index + 1);
      const handler = Array.isArray(entry) ? entry[Math.min(index, entry.length - 1)] : entry;
      try {
        await handler(record, res);
      } catch (error) {
        if (!res.headersSent) res.writeHead(500);
        res.end(String(error));
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

export function sse(res: http.ServerResponse, events: unknown[], options: { split?: boolean; done?: boolean } = {}): void {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  for (const event of events) {
    const line = `data: ${typeof event === 'string' ? event : JSON.stringify(event)}\n\n`;
    if (options.split) {
      const mid = Math.floor(line.length / 2);
      res.write(line.slice(0, mid));
      res.write(line.slice(mid));
    } else {
      res.write(line);
    }
  }
  if (options.done !== false) res.write('data: [DONE]\n\n');
  res.end();
}

export function textChunks(text: string, size = 5): unknown[] {
  const out: unknown[] = [];
  for (let i = 0; i < text.length; i += size) out.push({ choices: [{ index: 0, delta: { content: text.slice(i, i + size) } }] });
  out.push({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 3 } });
  return out;
}

export function toolCallChunks(calls: { id: string; name: string; args: Record<string, unknown> }[]): unknown[] {
  const out: unknown[] = [];
  calls.forEach((call, index) => {
    const args = JSON.stringify(call.args);
    const mid = Math.floor(args.length / 2);
    out.push({ choices: [{ index: 0, delta: { tool_calls: [{ index, id: call.id, type: 'function', function: { name: call.name, arguments: '' } }] } }] });
    out.push({ choices: [{ index: 0, delta: { tool_calls: [{ index, function: { arguments: args.slice(0, mid) } }] } }] });
    out.push({ choices: [{ index: 0, delta: { tool_calls: [{ index, function: { arguments: args.slice(mid) } }] } }] });
  });
  out.push({ choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] });
  return out;
}

export async function tempDir(prefix = 'musabai-test-'): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}
