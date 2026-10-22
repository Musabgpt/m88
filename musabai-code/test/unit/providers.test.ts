import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { FREE_POOL, KILO_AUTO_FREE, customSpec } from '../../src/core/providers/catalog';
import { parseKiloCatalog } from '../../src/core/providers/discovery';
import { ProviderError, parseRetryAfter } from '../../src/core/providers/errors';
import { cleanCompletion, fimComplete } from '../../src/core/providers/fim';
import { HealthManager, KILO_GATEWAY_ID } from '../../src/core/providers/health';
import { SseLineReader, ThinkSplitter, chatCompletion } from '../../src/core/providers/openai';
import { ProviderPool, ProviderUnavailable, requestCapabilities } from '../../src/core/providers/pool';
import type { ModelSpec, StreamEvent } from '../../src/core/types';
import { type MockServer, mockServer, sse, textChunks, toolCallChunks } from './helpers';

const servers: MockServer[] = [];
after(async () => {
  await Promise.all(servers.map((s) => s.close()));
});

async function serve(routes: Parameters<typeof mockServer>[0]) {
  const server = await mockServer(routes);
  servers.push(server);
  return server;
}

function spec(base: string, extra: Partial<ModelSpec> = {}): ModelSpec {
  return {
    id: 'test/free',
    name: 'Test Free',
    provider: 'openai',
    baseUrl: base,
    model: 'test-model',
    free: true,
    capabilities: ['text', 'tools', 'streaming', 'coding'],
    source: 'custom',
    ...extra,
  };
}

describe('stream parsing', () => {
  it('splits SSE lines across arbitrary chunk boundaries', () => {
    const reader = new SseLineReader();
    assert.deepEqual(reader.push('data: {"a"'), []);
    assert.deepEqual(reader.push(':1}\r\ndata: [DO'), ['data: {"a":1}']);
    assert.deepEqual(reader.push('NE]\n'), ['data: [DONE]']);
    assert.deepEqual(reader.flush(), []);
  });

  it('routes a leading <think> block to reasoning, even when tags are split', () => {
    const think = new ThinkSplitter();
    let reasoning = '';
    let content = '';
    for (const piece of ['  <thi', 'nk>plan it', ' carefully</th', 'ink>\nAnswer', ' here']) {
      const out = think.push(piece);
      reasoning += out.reasoning;
      content += out.content;
    }
    const rest = think.flush();
    reasoning += rest.reasoning;
    content += rest.content;
    assert.equal(reasoning, 'plan it carefully');
    assert.equal(content, 'Answer here');
  });

  it('leaves ordinary content that starts with a tag alone', () => {
    const think = new ThinkSplitter();
    const a = think.push('<th');
    const b = think.push('ead>row</thead>');
    assert.equal(a.content + b.content + think.flush().content, '<thead>row</thead>');
  });
});

describe('chatCompletion', () => {
  it('streams text keyless: no Authorization header, OpenAI body with usage', async () => {
    const server = await serve({ 'POST /chat/completions': (_req, res) => sse(res, textChunks('Hello from Kilo'), { split: true }) });
    const events: StreamEvent[] = [];
    const out = await chatCompletion(spec(server.url), undefined, {
      messages: [{ role: 'user', content: 'hi' }],
      onEvent: (e) => events.push(e),
    });
    assert.equal(out.content, 'Hello from Kilo');
    assert.equal(out.usage.promptTokens, 10);
    assert.equal(server.requests[0].headers.authorization, undefined);
    assert.equal(server.requests[0].body.stream, true);
    assert.deepEqual(server.requests[0].body.stream_options, { include_usage: true });
    assert.equal(events.filter((e) => e.type === 'text').map((e) => (e as { text: string }).text).join(''), 'Hello from Kilo');
  });

  it('assembles tool calls whose arguments arrive in pieces and sends the key', async () => {
    const server = await serve({
      'POST /chat/completions': (_req, res) =>
        sse(res, toolCallChunks([
          { id: 'call_a', name: 'read_file', args: { path: 'src/a.ts' } },
          { id: 'call_b', name: 'grep_search', args: { query: 'TODO', include: '*.ts' } },
        ])),
    });
    const out = await chatCompletion(spec(server.url), 'sk-test', {
      messages: [{ role: 'user', content: 'go' }],
      tools: [{ type: 'function', function: { name: 'read_file', description: 'r', parameters: { type: 'object' } } }],
    });
    assert.equal(server.requests[0].headers.authorization, 'Bearer sk-test');
    assert.equal(server.requests[0].body.tools.length, 1);
    assert.equal(out.toolCalls.length, 2);
    assert.deepEqual(JSON.parse(out.toolCalls[0].function.arguments), { path: 'src/a.ts' });
    assert.equal(out.toolCalls[1].function.name, 'grep_search');
    assert.equal(out.finishReason, 'tool_calls');
  });

  it('reports HTTP errors with status and Retry-After', async () => {
    const server = await serve({
      'POST /chat/completions': (_req, res) => {
        res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '7' });
        res.end(JSON.stringify({ error: { message: 'Rate limit exceeded' } }));
      },
    });
    await assert.rejects(chatCompletion(spec(server.url), undefined, { messages: [{ role: 'user', content: 'x' }] }), (error: unknown) => {
      assert.ok(error instanceof ProviderError);
      assert.equal(error.status, 429);
      assert.equal(error.retryAfter, 7);
      assert.match(error.message, /Rate limit exceeded/);
      return true;
    });
  });

  it('accepts a server that ignores stream=true and answers with JSON', async () => {
    const server = await serve({
      'POST /chat/completions': (_req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: 'plain json' }, finish_reason: 'stop' }] }));
      },
    });
    const out = await chatCompletion(spec(server.url), undefined, { messages: [{ role: 'user', content: 'x' }] });
    assert.equal(out.content, 'plain json');
  });

  it('turns a silent stream into a timeout error', async () => {
    const server = await serve({
      'POST /chat/completions': (_req, res) => {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'a' } }] })}\n\n`);
      },
    });
    await assert.rejects(
      chatCompletion(spec(server.url), undefined, { messages: [{ role: 'user', content: 'x' }] }, { idleTimeoutMs: 150, firstEventTimeoutMs: 2000 }),
      (error: unknown) => error instanceof ProviderError && error.code === 'timeout',
    );
  });

  it('flattens content for the text-only AI Horde adapter and resolves its model', async () => {
    const server = await serve({
      'GET /models': (_req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ data: [{ id: 'koboldcpp/some-model' }] }));
      },
      'POST /chat/completions': (_req, res) => sse(res, textChunks('horde says hi')),
    });
    const horde: ModelSpec = { ...spec(server.url), id: 'aihorde/anonymous-free', provider: 'aihorde', model: 'auto', capabilities: ['text', 'streaming'] };
    const out = await chatCompletion(horde, undefined, {
      messages: [{ role: 'user', content: [{ type: 'text', text: 'a' }, { type: 'image_url', image_url: { url: 'data:x' } }] }],
    });
    assert.equal(out.content, 'horde says hi');
    const body = server.requests.find((r) => r.method === 'POST')!.body;
    assert.equal(body.model, 'koboldcpp/some-model');
    assert.equal(body.messages[0].content, 'a');
    assert.equal(server.requests.find((r) => r.method === 'POST')!.headers.authorization, 'Bearer 0000000000');
  });
});

describe('Kilo zero-price discovery', () => {
  it('admits only verified zero-price tool models and prefers the verified route', () => {
    const rows = parseKiloCatalog({
      data: [
        { id: 'paid/model', pricing: { prompt: '0.000001', completion: '0' }, supported_parameters: ['tools'] },
        { id: 'missing/price', pricing: {}, supported_parameters: ['tools'] },
        { id: 'free/no-tools', pricing: { prompt: '0', completion: '0' }, supported_parameters: ['temperature'] },
        { id: 'free/request-fee', pricing: { prompt: '0', completion: '0', request: '0.01' }, supported_parameters: ['tools'] },
        { id: 'kilo-auto/free', pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools'] },
        {
          id: 'free/vision',
          pricing: { prompt: '0', completion: '0' },
          supported_parameters: ['tools', 'reasoning', 'response_format'],
          architecture: { input_modalities: ['text', 'image'] },
        },
        { id: 'stepfun/step-5-preview-free', pricing: { prompt: 0, completion: 0 }, supported_parameters: ['tools'] },
      ],
    });
    assert.deepEqual(rows.map((r) => r.id), ['stepfun/step-5-preview-free', 'free/vision']);
    assert.ok(rows[1].capabilities.includes('vision'));
    assert.ok(rows[1].capabilities.includes('json'));
    assert.ok(rows[1].capabilities.includes('reasoning'));
    assert.ok(rows.every((r) => r.free && r.source === 'kilo' && !r.apiKeyEnvs));
  });
});

describe('catalogue', () => {
  it('keeps MusabAI free providers, ids and key variables', () => {
    assert.deepEqual(FREE_POOL.map((s) => s.id), [
      'groq/gpt-oss-120b-free',
      'gemini/3.7-flash-free',
      'openrouter/free',
      'nvidia/nemotron-3-ultra-free',
      'zhipu/glm-4.7-flash-free',
      'mistral/devstral-free',
    ]);
    assert.equal(KILO_AUTO_FREE.baseUrl, 'https://api.kilo.ai/api/gateway');
    assert.equal(KILO_AUTO_FREE.apiKeyEnvs, undefined);
    assert.ok(FREE_POOL.every((s) => s.free && s.apiKeyEnvs?.length));
  });

  it('only treats a custom endpoint as a fallback when it declares itself free', () => {
    assert.equal(customSpec({ baseUrl: 'https://x.example/v1', model: 'm' })?.free, false);
    assert.equal(customSpec({ baseUrl: 'https://x.example/v1', model: 'm', free: true })?.free, true);
    assert.equal(customSpec({ baseUrl: 'ftp://x', model: 'm' }), undefined);
  });
});

describe('health', () => {
  it('cools the whole Kilo gateway on an account limit but not on an upstream limit', () => {
    const health = new HealthManager();
    const upstream = new ProviderError('busy', 429, JSON.stringify({ error: { metadata: { limit_source: 'upstream_provider' } } }));
    health.failure('kilo/a', upstream, 'https://api.kilo.ai/api/gateway');
    assert.equal(health.available(KILO_GATEWAY_ID), true);
    health.failure('kilo/b', new ProviderError('limit', 429, '{}'), 'https://api.kilo.ai/api/gateway');
    assert.equal(health.available(KILO_GATEWAY_ID), false);
    assert.equal(health.available('kilo/c', 'https://api.kilo.ai/api/gateway'), false);
  });

  it('parses bounded Retry-After values from headers, bodies and text', () => {
    assert.equal(parseRetryAfter('12'), 12);
    assert.equal(parseRetryAfter(undefined, JSON.stringify({ error: { retry_after: 99999 } })), 1800);
    assert.equal(parseRetryAfter(undefined, '', 'please retry after 3.2 seconds'), 4);
    assert.equal(parseRetryAfter(undefined, 'not json', 'nothing'), undefined);
  });
});

describe('ProviderPool', () => {
  const noKeys = async () => undefined;

  it('uses the keyless Kilo default with no account at all', async () => {
    const kilo = await serve({ 'POST /chat/completions': (_req, res) => sse(res, textChunks('kilo ok')) });
    const pool = new ProviderPool({ resolveKey: noKeys, env: {}, kiloBase: kilo.url, discoverKilo: false, discoverLocal: false });
    const out = await pool.chat('kilo-auto/free', { messages: [{ role: 'user', content: 'hi' }] });
    assert.equal(out.content, 'kilo ok');
    assert.equal(out.spec.id, 'kilo-auto/free');
    assert.equal(kilo.requests[0].body.model, 'kilo-auto/free');
  });

  it('fails over to the next free provider before any output and records the cooldown', async () => {
    const kilo = await serve({
      'POST /chat/completions': (_req, res) => {
        res.writeHead(503, { 'content-type': 'application/json' });
        res.end('{"error":{"message":"overloaded"}}');
      },
    });
    const backup = await serve({ 'POST /chat/completions': (_req, res) => sse(res, textChunks('backup ok')) });
    const statuses: string[] = [];
    const pool = new ProviderPool({
      resolveKey: noKeys,
      env: {},
      kiloBase: kilo.url,
      discoverKilo: false,
      discoverLocal: false,
      customModels: () => [spec(backup.url, { id: 'custom/free-backup', name: 'Backup' })],
      sleep: async () => undefined,
    });
    const out = await pool.chat('kilo-auto/free', { messages: [{ role: 'user', content: 'hi' }] }, { onStatus: (s) => statuses.push(s) });
    assert.equal(out.content, 'backup ok');
    assert.equal(out.fallbackFrom, 'kilo-auto/free');
    assert.equal(pool.health.get('kilo-auto/free')?.state, 'overloaded');
    assert.ok(statuses.some((s) => s.includes('Backup')));
    // The free keyed providers were skipped because no key exists: nothing reached the network for them.
    assert.ok(kilo.requests.length >= 1);
  });

  it('never routes a tool request to text-only AI Horde', async () => {
    const pool = new ProviderPool({ resolveKey: noKeys, env: {}, kiloBase: 'http://127.0.0.1:9', discoverKilo: false, discoverLocal: false });
    const required = requestCapabilities({ messages: [], tools: [{ type: 'function', function: { name: 'x', description: '', parameters: {} } }] });
    const ids = (await pool.candidates(undefined, required)).map((c) => c.spec.id);
    assert.ok(!ids.includes('aihorde/anonymous-free'));
    assert.ok(ids.includes('kilo-auto/free'));
    const textIds = (await pool.candidates(undefined, requestCapabilities({ messages: [] }))).map((c) => c.spec.id);
    assert.ok(textIds.includes('aihorde/anonymous-free'));
  });

  it('includes keyed providers only when their key exists', async () => {
    const pool = new ProviderPool({
      resolveKey: async (s) => (s.secretId === 'groq' ? 'gsk' : undefined),
      env: {},
      discoverKilo: false,
      discoverLocal: false,
    });
    const ids = (await pool.candidates(undefined, requestCapabilities({ messages: [] }))).map((c) => c.spec.id);
    assert.equal(ids[0], 'groq/gpt-oss-120b-free');
    assert.ok(!ids.includes('gemini/3.7-flash-free'));
  });

  it('switches provider after partial output only when the caller can reset its draft', async () => {
    const broken = await serve({
      'POST /chat/completions': (_req, res) => {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'partial' } }] })}\n\n`);
        res.write('data: {"error":{"message":"upstream overloaded","code":503}}\n\n');
        res.end();
      },
    });
    const backup = await serve({ 'POST /chat/completions': (_req, res) => sse(res, textChunks('complete answer')) });
    const make = () =>
      new ProviderPool({
        resolveKey: noKeys,
        env: {},
        kiloBase: broken.url,
        discoverKilo: false,
        discoverLocal: false,
        customModels: () => [spec(backup.url, { id: 'custom/free-backup' })],
        sleep: async () => undefined,
      });
    let resets = 0;
    const out = await make().chat('kilo-auto/free', { messages: [{ role: 'user', content: 'x' }] }, { onReset: () => resets++ });
    assert.equal(resets, 1);
    assert.equal(out.content, 'complete answer');
    await assert.rejects(make().chat('kilo-auto/free', { messages: [{ role: 'user', content: 'x' }] }), (e: unknown) => e instanceof ProviderError && e.emitted);
  });

  it('rejects an invalid tool call before it runs and moves on', async () => {
    const bad = await serve({ 'POST /chat/completions': (_req, res) => sse(res, toolCallChunks([{ id: 'c1', name: 'edit_file', args: {} }])) });
    const good = await serve({ 'POST /chat/completions': (_req, res) => sse(res, toolCallChunks([{ id: 'c2', name: 'edit_file', args: { path: 'a' } }])) });
    const pool = new ProviderPool({
      resolveKey: noKeys,
      env: {},
      kiloBase: bad.url,
      discoverKilo: false,
      discoverLocal: false,
      customModels: () => [spec(good.url, { id: 'custom/free-good' })],
      sleep: async () => undefined,
    });
    const out = await pool.chat(
      'kilo-auto/free',
      { messages: [{ role: 'user', content: 'x' }], tools: [{ type: 'function', function: { name: 'edit_file', description: '', parameters: {} } }] },
      {
        onReset: () => undefined,
        validate: (c) => {
          if (c.toolCalls.some((t) => !JSON.parse(t.function.arguments).path)) {
            const error = new ProviderError('missing path', 400);
            error.code = 'invalid_tool_call';
            throw error;
          }
        },
      },
    );
    assert.equal(out.spec.id, 'custom/free-good');
    assert.equal(pool.health.get('kilo-auto/free')?.state, 'invalid_tool_response');
  });

  it('explains when nothing can serve the request', async () => {
    const pool = new ProviderPool({ resolveKey: noKeys, env: {}, discoverKilo: false, discoverLocal: false });
    await assert.rejects(
      pool.chat('kilo-auto/free', { messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:' } }] }], tools: [{ type: 'function', function: { name: 'x', description: '', parameters: {} } }] }),
      (e: unknown) => e instanceof ProviderUnavailable && /vision/.test(e.message),
    );
  });
});

describe('Tab completion helpers', () => {
  it('cleans fences, echoed line starts and duplicated suffix', () => {
    assert.equal(cleanCompletion('```ts\nreturn a + b;\n```', '  ', '\n}'), 'return a + b;');
    assert.equal(cleanCompletion('const total = items.length;', 'const total = ', ';\n'), 'items.length');
    assert.equal(cleanCompletion('   ', 'x', ''), '');
  });

  it('calls Ollama generate with prefix and suffix', async () => {
    const server = await serve({
      'POST /api/generate': (req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ response: req.body.prompt.endsWith('(') ? 'a, b)' : '' }));
      },
    });
    const out = await fimComplete(
      { ...spec(`${server.url}/v1`), id: 'ollama/qwen2.5-coder:1.5b', model: 'qwen2.5-coder:1.5b', source: 'local' },
      undefined,
      { prefix: 'add(', suffix: '\n' },
    );
    assert.equal(out, 'a, b)');
    assert.equal(server.requests[0].body.suffix, '\n');
    assert.equal(server.requests[0].body.stream, false);
  });
});
