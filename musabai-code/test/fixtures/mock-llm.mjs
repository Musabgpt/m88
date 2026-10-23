#!/usr/bin/env node
// A scripted OpenAI-compatible model server for MusabAI Code tests and demos.
// The agent script: explore → edit hello.py → run it → answer. One-shot prompts (inline edit,
// commit message, Tab, review) get canned answers. Usage: node mock-llm.mjs [port]
import http from 'node:http';

const port = Number(process.argv[2] || process.env.MOCK_PORT || 0);
const log = [];

function sse(res, chunks) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  let i = 0;
  const tick = () => {
    if (i < chunks.length) {
      res.write(`data: ${JSON.stringify(chunks[i++])}\n\n`);
      setTimeout(tick, 15);
    } else {
      res.write('data: [DONE]\n\n');
      res.end();
    }
  };
  tick();
}

function text(content, pieces = 6) {
  const out = [];
  const size = Math.max(1, Math.ceil(content.length / pieces));
  for (let i = 0; i < content.length; i += size) out.push({ choices: [{ index: 0, delta: { content: content.slice(i, i + size) } }] });
  out.push({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1200, completion_tokens: 80 } });
  return out;
}

function calls(list) {
  const out = [{ choices: [{ index: 0, delta: { reasoning_content: 'Let me look at the project and make the change.' } }] }];
  list.forEach(([name, args], index) => {
    out.push({ choices: [{ index: 0, delta: { tool_calls: [{ index, id: `call_${name}_${index}`, type: 'function', function: { name, arguments: '' } }] } }] });
    out.push({ choices: [{ index: 0, delta: { tool_calls: [{ index, function: { arguments: JSON.stringify(args) } }] } }] });
  });
  out.push({ choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] });
  return out;
}

function reply(body) {
  const messages = body.messages || [];
  const system = String(messages[0]?.content || '');
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const userText = typeof lastUser?.content === 'string' ? lastUser.content : (lastUser?.content || []).map((p) => p.text || '').join(' ');
  if (system.includes('code completion engine')) return text('a + b;', 1);
  if (system.includes('You rewrite code')) {
    const selection = /<selection>\n([\s\S]*?)\n<\/selection>/.exec(userText)?.[1] ?? '';
    const rewritten = selection ? selection.replace(/print\("hi"\)/, 'print("hello from Ctrl+K")').replace(/hi/g, 'hello') : 'print("new line from Ctrl+K")';
    return text(`\`\`\`python\n${rewritten}\n\`\`\``);
  }
  if (system.includes('git commit messages')) return text('Make hello.py greet the world\n\nPrint a friendlier greeting.');
  if (system.includes('pull request titles')) return text(JSON.stringify({ title: 'Greet the world', body: '## Summary\n- Friendlier greeting\n\n## Testing\n- ran hello.py' }));
  if (system.includes('MusabAI Bugbot')) return text(JSON.stringify({ summary: 'One possible issue.', findings: [] }));
  if (system.includes('ONE shell command')) return text('ls -la | head -n 20');
  if (system.includes('merge a code snippet')) return text('```python\nprint("applied")\n```');
  // Agent: count tool rounds since the last real user request.
  const lastUserIndex = messages.map((m) => m.role).lastIndexOf('user');
  const rounds = messages.slice(lastUserIndex).filter((m) => m.role === 'assistant').length;
  if (/plan/i.test(system) && system.includes('You are in Plan mode')) {
    return text('## Plan\n\n1. Update `hello.py` to print a friendlier greeting.\n2. Run `python3 hello.py` to verify.\n\nPress **Build** to run it in Agent mode.');
  }
  if (system.includes('You are in Ask mode')) return text('`hello.py` prints a greeting with `print("hi")` — a one-line Python script.');
  // "… while I sleep": a risky command (skipped when working alone), then an ordinary one, then the report.
  if (/while I sleep/i.test(userText)) {
    if (rounds === 0) return calls([['run_terminal_cmd', { command: 'git push --force origin HEAD', explanation: 'Publish the branch' }]]);
    if (rounds === 1) return calls([['run_terminal_cmd', { command: 'python3 hello.py', explanation: 'Check the script still runs' }]]);
    return text('Done while you were away. The force-push needs your approval, so it is left for you.');
  }
  if (/hello|greet|change|edit|fix/i.test(userText)) {
    // "remember …": save a project note first (update_memory), then the usual edit.
    const remember = /remember/i.test(userText) ? 1 : 0;
    if (remember && rounds === 0) return calls([['update_memory', { text: 'The dev server runs on port 8000' }]]);
    const round = rounds - remember;
    if (round === 0) return calls([['todo_write', { todos: [{ id: '1', content: 'Read hello.py', status: 'in_progress' }, { id: '2', content: 'Change the greeting', status: 'pending' }, { id: '3', content: 'Run it to verify', status: 'pending' }] }], ['list_dir', { path: '.' }], ['read_file', { path: 'hello.py' }]]);
    if (round === 1) return calls([['edit_file', { path: 'hello.py', old_string: 'print("hi")', new_string: 'print("Hello, world! مرحبا بالعالم")' }], ['todo_write', { todos: [{ id: '1', content: 'Read hello.py', status: 'completed' }, { id: '2', content: 'Change the greeting', status: 'completed' }, { id: '3', content: 'Run it to verify', status: 'in_progress' }], merge: false }]]);
    if (round === 2) return calls([['run_terminal_cmd', { command: 'python3 hello.py', explanation: 'Run the script to check the new greeting' }]]);
    if (round === 3) return calls([['todo_write', { todos: [{ id: '1', content: 'Read hello.py', status: 'completed' }, { id: '2', content: 'Change the greeting', status: 'completed' }, { id: '3', content: 'Run it to verify', status: 'completed' }] }]]);
    return text('Done. `hello.py` now prints **"Hello, world! مرحبا بالعالم"** and running it shows the new greeting:\n\n```bash\npython3 hello.py\n```\n\nReview the change in the editor, then accept or reject it.');
  }
  return text(`مرحبًا! I am a mock model. You said: ${userText.slice(0, 120)}`);
}

const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => (raw += d));
  req.on('end', () => {
    const url = req.url || '';
    if (req.method === 'GET' && url.endsWith('/models')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ data: [{ id: 'mock' }] }));
    }
    if (req.method === 'GET' && url === '/log') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(log));
    }
    if (req.method === 'POST' && url.endsWith('/chat/completions')) {
      let body = {};
      try {
        body = JSON.parse(raw);
      } catch {
        // ignore
      }
      log.push({ at: Date.now(), system: String(body.messages?.[0]?.content || '').slice(0, 80), tools: (body.tools || []).length, messages: (body.messages || []).length });
      return sse(res, reply(body));
    }
    res.writeHead(404);
    res.end();
  });
});

server.listen(port, '127.0.0.1', () => {
  const address = server.address();
  process.stdout.write(`mock-llm listening on http://127.0.0.1:${address.port}\n`);
});
