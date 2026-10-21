import { readFile } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { AgentSession } from '../core/agent/agent';
import { ChangeTracker } from '../core/changes';
import { CheckpointStore } from '../core/checkpoints';
import { AUTO_MODEL_ID, type CustomModelConfig, PROVIDER_KEYS, customSpec } from '../core/providers/catalog';
import { configDir, credentialsPath, keyResolver, readCredentials, writeCredential } from '../core/credentials';
import { unifiedDiff } from '../core/diff';
import { git, gitInfo, branchChanges, commitDiff } from '../core/git';
import { GitHubApi, envOrGhToken, parseRemote } from '../core/github';
import { type ApprovalRequest, type ApprovalResult, NodeHost } from '../core/host';
import { CodebaseIndex } from '../core/index/indexer';
import { LAPTOP_ACTIONS, type LaptopAction, laptopAction } from '../core/laptop';
import { McpManager } from '../core/mcp/manager';
import { parseTextMentions, resolveMentions } from '../core/mentions';
import { commitMessage, pullRequestText, reviewDiff, reviewMarkdown } from '../core/oneshot';
import type { CommandPolicy, RunMode } from '../core/policy';
import { ProviderPool } from '../core/providers/pool';
import { BUILTIN_MODES } from '../core/tools';
import type { AgentEvent, ModeDefinition } from '../core/tools/types';
import { newId, relPath } from '../core/util';
import { environmentProvider, rulesProvider } from '../core/workspace';

const VERSION = '0.1.0';
const color = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code: string) => (text: string) => (color ? `\x1b[${code}m${text}\x1b[0m` : text);
const dim = c('2');
const bold = c('1');
const cyan = c('36');
const green = c('32');
const red = c('31');
const yellow = c('33');
const magenta = c('35');

interface Options {
  prompt?: string;
  print: boolean;
  mode: string;
  model: string;
  yes: boolean;
  cwd: string;
  format: 'text' | 'json' | 'stream-json';
  maxSteps: number;
  showThinking: boolean;
  command?: string;
  rest: string[];
  flags: Record<string, string | boolean>;
}

const HELP = `${bold('musabai')} — MusabAI terminal agent: a free, Cursor-style coding agent for your terminal.

${bold('Usage')}
  musabai                       start an interactive session in this folder
  musabai "fix the failing test" start with a first request
  musabai -p "explain src/app.ts" [--mode ask] [--output-format text|json|stream-json]
  musabai review [--base main] [--pr 12 --post]   Bugbot review of your changes or a pull request
  musabai commit [-y] [-a]      write a commit message (and commit with -y; -a stages everything)
  musabai pr [--base main] [--draft]   push the branch and open a pull request with a written description
  musabai models                list the free models and their status
  musabai keys [list | set <provider> [key] | rm <provider>]
  musabai mcp                   list MCP servers and their tools
  musabai search "query"        search the codebase index
  musabai laptop <action> [target] [--text ...]   control this laptop (system_info, open, notify, screenshot…)

${bold('Options')}
  -p, --print            run once without interaction and print the answer
  -m, --model <id>       model id or "auto" (default: kilo-auto/free, no key needed)
      --base-url <url>   use any OpenAI-compatible server (Ollama, llama.cpp, LM Studio…) with --model
      --mode <mode>      agent | plan | ask | manual (default: agent)
  -y, --yes              run commands without asking (risky ones are still refused in --print mode)
  -C, --cwd <dir>        project folder (default: current directory)
      --max-steps <n>    tool steps per request (default 60)
      --thinking         show the model's reasoning
  -v, --version, -h, --help

Settings: ~/.config/musabai/config.json ({"model", "customModels", "runMode", "allowList", "rules"}); keys: musabai keys.
In a session: type a request; @path adds a file or folder, @git your uncommitted diff, @https://… a page.
Commands: /mode /model /models /new /undo /diff /accept /reject /review /commit /rules /mcp /image <file> /help /exit`;

function parse(argv: string[]): Options {
  const o: Options = { print: false, mode: 'agent', model: process.env.MUSABAI_MODEL || 'kilo-auto/free', yes: false, cwd: process.cwd(), format: 'text', maxSteps: 60, showThinking: false, rest: [], flags: {} };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i] ?? '';
    if (a === '-p' || a === '--print') o.print = true;
    else if (a === '-m' || a === '--model') o.model = next();
    else if (a === '--mode') o.mode = next();
    else if (a === '-y' || a === '--yes' || a === '--auto') o.yes = true;
    else if (a === '-C' || a === '--cwd') o.cwd = path.resolve(next());
    else if (a === '--output-format') o.format = next() as Options['format'];
    else if (a === '--max-steps') o.maxSteps = Number(next()) || 60;
    else if (a === '--thinking') o.showThinking = true;
    else if (a === '-h' || a === '--help') o.command = 'help';
    else if (a === '-v' || a === '--version') o.command = 'version';
    else if (a.startsWith('--')) {
      const key = a.slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith('-') ? next() : true;
      o.flags[key] = value;
    } else if (a === '-a') o.flags.all = true;
    else positional.push(a);
  }
  const commands = ['review', 'commit', 'pr', 'models', 'keys', 'mcp', 'search', 'laptop', 'help', 'version'];
  if (!o.command && positional.length && commands.includes(positional[0])) o.command = positional.shift();
  if (o.command && o.command !== 'help' && o.command !== 'version') o.rest = positional;
  else if (positional.length) o.prompt = positional.join(' ');
  return o;
}

interface CliConfig {
  model?: string;
  customModels?: CustomModelConfig[];
  runMode?: RunMode;
  allowList?: string[];
  denyList?: string[];
  rules?: string[];
  discoverKilo?: boolean;
  discoverLocal?: boolean;
}

let config: CliConfig = {};

/** ~/.config/musabai/config.json: the terminal agent's settings (the editor keeps its own in VS Code settings). */
async function loadConfig(): Promise<CliConfig> {
  try {
    const data = JSON.parse(await readFile(path.join(configDir(), 'config.json'), 'utf8'));
    return data && typeof data === 'object' ? (data as CliConfig) : {};
  } catch {
    return {};
  }
}

function makePool(extra: CustomModelConfig[] = []): ProviderPool {
  const custom = [...(config.customModels ?? []), ...extra].map((c) => customSpec(c)).filter((s): s is NonNullable<typeof s> => Boolean(s));
  return new ProviderPool({
    resolveKey: keyResolver(),
    customModels: () => custom,
    discoverKilo: config.discoverKilo !== false,
    discoverLocal: config.discoverLocal !== false,
    log: process.env.MUSABAI_DEBUG ? (l) => process.stderr.write(dim(`[debug] ${l}\n`)) : undefined,
  });
}

function adHocModel(o: Options): CustomModelConfig[] {
  const base = typeof o.flags['base-url'] === 'string' ? o.flags['base-url'] : process.env.MUSABAI_BASE_URL;
  if (!base) return [];
  const model = o.model && o.model !== 'kilo-auto/free' ? o.model : 'default';
  o.model = 'custom/cli';
  return [{ id: 'custom/cli', name: `${model} @ ${base}`, baseUrl: base, model, apiKey: process.env.MUSABAI_API_KEY, free: true, capabilities: ['text', 'tools', 'streaming', 'coding'] }];
}

async function githubApi(root: string): Promise<GitHubApi> {
  return new GitHubApi(() => envOrGhToken(root));
}

async function repoRef(root: string) {
  if (process.env.GITHUB_REPOSITORY?.includes('/')) {
    const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
    return { owner, repo };
  }
  return parseRemote((await gitInfo(root)).remoteUrl);
}

// ---- interactive / print session ------------------------------------------------------------------

class Session {
  readonly host: NodeHost;
  readonly pool: ProviderPool;
  readonly changes: ChangeTracker;
  readonly checkpoints = new CheckpointStore();
  readonly index: CodebaseIndex;
  readonly mcp: McpManager;
  readonly agent: AgentSession;
  mode: ModeDefinition;
  model: string;
  runMode: RunMode;
  private rl?: readline.Interface;
  private controller?: AbortController;
  private lastTurn?: string;
  private images: string[] = [];
  private atLineStart = true;
  private inThinking = false;

  constructor(private readonly options: Options, pool: ProviderPool) {
    this.pool = pool;
    this.mode = BUILTIN_MODES.find((m) => m.id === options.mode) ?? BUILTIN_MODES[0];
    this.model = options.model;
    this.runMode = options.yes ? 'auto' : config.runMode ?? (options.print ? 'allowlist' : 'ask');
    this.host = new NodeHost({ root: options.cwd, approve: (r) => this.approve(r) });
    this.changes = new ChangeTracker(this.host);
    this.index = new CodebaseIndex(this.host);
    this.mcp = new McpManager({
      root: options.cwd,
      trustProjectServer: async (config) => {
        if (options.print) return options.yes;
        const detail = config.url ?? `${config.command} ${(config.args ?? []).join(' ')}`;
        return (await this.ask(`${yellow('?')} Start the project's MCP server "${config.name}" (${detail})? [y/N] `)).toLowerCase().startsWith('y');
      },
    });
    const policy = (): CommandPolicy => ({ mode: this.runMode, allow: config.allowList ?? ['npm test', 'npm run test', 'npm run lint', 'npm run build', 'pytest', 'python3 -m pytest', 'cargo test', 'go test', 'make test'], deny: config.denyList ?? [] });
    this.agent = new AgentSession({
      pool: this.pool,
      host: this.host,
      emit: (e) => this.render(e),
      policy,
      approve: (r) => this.approve(r),
      environment: environmentProvider(options.cwd, 'terminal'),
      rules: rulesProvider(options.cwd, () => [...(config.rules ?? []), ...(process.env.MUSABAI_RULES ? [process.env.MUSABAI_RULES] : [])]),
      changes: this.changes,
      checkpoints: this.checkpoints,
      index: this.index,
      mcp: this.mcp,
      github: async () => githubApi(options.cwd),
      maxSteps: options.maxSteps,
    });
  }

  private out(text: string): void {
    if (this.options.print && this.options.format !== 'text') return;
    const stream = this.options.print ? process.stderr : process.stdout;
    stream.write(text);
    if (text) this.atLineStart = text.endsWith('\n');
  }

  private line(text: string): void {
    if (!this.atLineStart) this.out('\n');
    this.out(`${text}\n`);
  }

  ask(question: string): Promise<string> {
    if (!process.stdin.isTTY && !this.rl) return Promise.resolve('');
    return new Promise((resolve) => {
      const rl = this.rl ?? readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question(question, (answer) => {
        if (!this.rl) rl.close();
        resolve(answer.trim());
      });
    });
  }

  async approve(request: ApprovalRequest): Promise<ApprovalResult> {
    if (this.options.print) {
      this.line(yellow(`! needs approval and was skipped in --print mode: ${request.kind === 'command' ? request.command : request.kind}`));
      return 'deny';
    }
    const what =
      request.kind === 'command' ? `Run ${bold(request.command)}${request.reason ? dim(` — ${request.reason}`) : ''}` :
      request.kind === 'write_outside' ? `Change ${bold(request.path)} (outside the project)` :
      request.kind === 'delete' ? `Delete ${bold(request.path)}` :
      request.kind === 'laptop' ? `Laptop ${bold(request.action)} ${request.detail}` : `MCP ${bold(`${request.server}/${request.tool}`)} ${dim(request.args)}`;
    if (!this.atLineStart) this.out('\n');
    const answer = (await this.ask(`${yellow('?')} ${what}  ${dim('[y]es / [n]o / [a]lways')} `)).toLowerCase();
    return answer.startsWith('a') ? 'always' : answer.startsWith('y') || answer === '' ? 'allow' : 'deny';
  }

  private render(e: AgentEvent): void {
    const fmt = this.options.format;
    if (this.options.print && fmt === 'stream-json') {
      process.stdout.write(`${JSON.stringify(e)}\n`);
      return;
    }
    switch (e.type) {
      case 'text':
        // --print writes the final answer to stdout once; stderr carries only the progress.
        if (this.options.print) break;
        if (this.inThinking) {
          this.inThinking = false;
          this.out('\n');
        }
        this.out(e.text);
        break;
      case 'reasoning':
        if (!this.options.showThinking) break;
        if (!this.inThinking) {
          this.inThinking = true;
          this.line(dim('… thinking'));
        }
        this.out(dim(e.text));
        break;
      case 'reset_draft':
        this.line(dim('(switching model, discarding the partial answer)'));
        break;
      case 'status':
        this.line(dim(`· ${e.message}`));
        break;
      case 'model':
        if (e.fallbackFrom) this.line(dim(`· now using ${e.name}`));
        break;
      case 'tool_start':
        this.line(cyan(`⏺ ${e.title}`));
        break;
      case 'tool_output':
        this.out(dim(e.chunk.replace(/\n(?!$)/g, '\n  ')));
        break;
      case 'tool_end':
        this.line(`${e.ok ? green('  ✓') : red('  ✗')} ${dim(e.summary)}${typeof e.meta?.exitCode === 'number' ? dim(` · exit ${e.meta.exitCode}`) : ''}`);
        break;
      case 'todos':
        this.line(e.todos.map((t) => `  ${t.status === 'completed' ? green('☑') : t.status === 'in_progress' ? yellow('▶') : '☐'} ${t.content}`).join('\n'));
        break;
      case 'done':
        if (e.reason === 'error') this.line(red(`✗ ${e.error}`));
        else if (e.reason === 'cancelled') this.line(yellow('■ stopped'));
        else if (e.reason === 'max_steps') this.line(yellow('■ step limit reached — say "continue"'));
        else if (!this.atLineStart) this.out('\n');
        break;
      default:
        break;
    }
  }

  async run(text: string): Promise<Awaited<ReturnType<AgentSession['run']>>> {
    const mentions = await parseTextMentions(text, this.host);
    const resolved = await resolveMentions(mentions, { host: this.host, index: this.index }, text);
    await Promise.race([this.mcp.startAll(), new Promise((r) => setTimeout(r, 8000))]);
    const turnId = newId('t');
    this.lastTurn = turnId;
    this.controller = new AbortController();
    const images = [...this.images, ...resolved.images];
    this.images = [];
    try {
      return await this.agent.run({
        turnId,
        text,
        mode: this.mode,
        modelId: this.model,
        images,
        context: resolved.context,
        referencedFiles: resolved.files,
        mentionedRules: resolved.rules,
        signal: this.controller.signal,
      });
    } finally {
      this.controller = undefined;
      const pending = await this.changes.summary();
      if (pending.length && !this.options.print) {
        this.line(dim(`  ${pending.length} file${pending.length === 1 ? '' : 's'} changed (${pending.map((p) => `${p.rel} +${p.added} −${p.removed}`).join(', ')}) · /diff /undo /reject`));
      }
    }
  }

  stop(): boolean {
    if (!this.controller) return false;
    this.controller.abort();
    return true;
  }

  async slash(line: string): Promise<boolean> {
    const [cmd, ...args] = line.slice(1).split(/\s+/);
    const arg = args.join(' ');
    switch (cmd) {
      case 'exit':
      case 'quit':
        return false;
      case 'help':
        this.line(HELP);
        break;
      case 'mode': {
        const mode = BUILTIN_MODES.find((m) => m.id === arg);
        if (mode) this.mode = mode;
        this.line(`mode: ${bold(this.mode.label)} ${dim(`(${BUILTIN_MODES.map((m) => m.id).join(' | ')})`)}`);
        break;
      }
      case 'agent':
      case 'plan':
      case 'ask':
      case 'manual':
        this.mode = BUILTIN_MODES.find((m) => m.id === cmd)!;
        this.line(`mode: ${bold(this.mode.label)}`);
        break;
      case 'model':
        if (arg) this.model = arg;
        this.line(`model: ${bold(this.model)}`);
        break;
      case 'models':
        await printModels(this.pool);
        break;
      case 'new':
      case 'clear':
        this.agent.restoreSnapshot(undefined);
        this.line(dim('new conversation'));
        break;
      case 'undo': {
        if (!this.lastTurn) break;
        const restored = await this.checkpoints.restore(this.lastTurn, this.host);
        this.agent.truncateFrom(this.lastTurn);
        this.line(green(`restored ${restored.length} file${restored.length === 1 ? '' : 's'} and removed the last request`));
        break;
      }
      case 'diff':
        for (const change of await this.changes.summary()) {
          const before = this.changes.baseline(change.path) ?? '';
          const after = (await this.host.readText(change.path)) ?? '';
          for (const l of unifiedDiff(change.rel, before, after).split('\n')) this.out(`${l.startsWith('+') ? green(l) : l.startsWith('-') ? red(l) : l.startsWith('@@') ? cyan(l) : l}\n`);
        }
        break;
      case 'accept':
        this.changes.acceptAll();
        this.line(dim('accepted all changes'));
        break;
      case 'reject':
        if (arg) await this.changes.reject(path.resolve(this.options.cwd, arg));
        else await this.changes.rejectAll();
        this.line(dim(arg ? `rejected ${arg}` : 'rejected all changes'));
        break;
      case 'review':
        await review(this.options, this.pool);
        break;
      case 'commit':
        await commit(this.options, this.pool, false);
        break;
      case 'rules': {
        const { rules } = await rulesProvider(this.options.cwd, () => [])([], []);
        this.line(rules.length ? rules.map((r) => `${bold(r.name)} ${dim(`${r.kind} · ${r.path || 'user'}`)}`).join('\n') : dim('no rules (.cursor/rules/*.mdc, .cursorrules, AGENTS.md)'));
        break;
      }
      case 'mcp':
        await this.mcp.startAll();
        printMcp(this.mcp);
        break;
      case 'image': {
        try {
          const data = await readFile(path.resolve(this.options.cwd, arg));
          const ext = path.extname(arg).slice(1).toLowerCase().replace('jpg', 'jpeg') || 'png';
          this.images.push(`data:image/${ext};base64,${data.toString('base64')}`);
          this.line(dim(`attached ${arg} to the next message`));
        } catch (error) {
          this.line(red((error as Error).message));
        }
        break;
      }
      case 'yolo':
        this.runMode = this.runMode === 'auto' ? 'ask' : 'auto';
        this.line(`commands run ${this.runMode === 'auto' ? 'without asking (risky ones still ask)' : 'only after you approve them'}`);
        break;
      default:
        this.line(red(`unknown command /${cmd} — /help`));
    }
    return true;
  }

  async interactive(first?: string): Promise<void> {
    const info = await gitInfo(this.options.cwd);
    const modelName = this.model === AUTO_MODEL_ID ? 'Auto' : (await this.pool.resolve(this.model))?.name ?? this.model;
    this.out(`${magenta('◆')} ${bold('MusabAI')} ${dim(`v${VERSION} · free AI coding agent`)}\n`);
    this.out(dim(`  ${this.options.cwd}${info.isRepo ? ` (${info.branch})` : ''} · ${modelName} · ${this.mode.label} mode · /help\n\n`));
    this.rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true, historySize: 200 });
    let ctrlC = 0;
    this.rl.on('SIGINT', () => {
      if (this.stop()) return;
      ctrlC++;
      if (ctrlC >= 2) process.exit(0);
      this.out(dim('\n(press Ctrl+C again to exit)\n'));
      this.rl?.prompt();
    });
    const promptText = () => `${this.mode.id === 'agent' ? magenta('∞') : this.mode.id === 'plan' ? cyan('☰') : green('?')} ${bold('›')} `;
    const handle = async (line: string) => {
      ctrlC = 0;
      const text = line.trim();
      if (!text) return true;
      if (text.startsWith('/')) return this.slash(text);
      await this.run(text);
      return true;
    };
    if (first) await handle(first);
    for (;;) {
      const line = await new Promise<string | null>((resolve) => {
        this.rl!.setPrompt(promptText());
        this.rl!.prompt();
        const onLine = (l: string) => {
          this.rl!.off('close', onClose);
          resolve(l);
        };
        const onClose = () => resolve(null);
        this.rl!.once('line', onLine);
        this.rl!.once('close', onClose);
      });
      if (line === null) break;
      if (!(await handle(line))) break;
      this.out('\n');
    }
    this.rl.close();
    await this.mcp.stopAll();
    this.host.disposeProcesses();
  }
}

// ---- subcommands ----------------------------------------------------------------------------------

async function printModels(pool: ProviderPool): Promise<void> {
  const models = await pool.listModels();
  let group = '';
  for (const m of models) {
    const g = m.source === 'local' ? 'Local (this laptop)' : m.keyless ? 'Free · no key' : m.source === 'custom' ? 'Custom' : 'Free · with your key';
    if (g !== group) {
      group = g;
      process.stdout.write(`\n${bold(group)}\n`);
    }
    process.stdout.write(`  ${m.ready ? green('●') : dim('○')} ${m.id.padEnd(38)} ${dim(m.ready ? m.note ?? '' : `needs a key: musabai keys set ${m.secretId}`)}\n`);
  }
}

function printMcp(mcp: McpManager): void {
  const list = mcp.status();
  if (!list.length) return void process.stdout.write(dim('no MCP servers (~/.cursor/mcp.json, ~/.config/musabai/mcp.json, .cursor/mcp.json)\n'));
  for (const s of list) process.stdout.write(`${s.state === 'ready' ? green('●') : red('●')} ${bold(s.name)} ${dim(`${s.type} · ${s.state}${s.error ? ` · ${s.error}` : ''}`)}\n  ${dim(s.tools.join(', '))}\n`);
}

async function review(o: Options, pool: ProviderPool): Promise<number> {
  const root = o.cwd;
  let diff: string;
  let context = '';
  const prNumber = Number(o.flags.pr || 0);
  const ref = await repoRef(root);
  if (prNumber) {
    if (!ref) throw new Error('no GitHub repository (origin remote or GITHUB_REPOSITORY)');
    const api = await githubApi(root);
    diff = await api.pullDiff(ref, prNumber);
    const pr = await api.pull(ref, prNumber);
    context = `Pull request #${prNumber}: ${pr.title}\n${pr.body || ''}`;
  } else if (o.flags.uncommitted) diff = (await commitDiff(root)).diff;
  else {
    const changes = await branchChanges(root, typeof o.flags.base === 'string' ? o.flags.base : undefined);
    diff = changes.diff;
    context = `Commits since ${changes.base}:\n${changes.log}`;
  }
  process.stderr.write(dim('Reviewing with a free model…\n'));
  const result = await reviewDiff(pool, o.model, diff, context);
  if (o.flags.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else process.stdout.write(`${reviewMarkdown(result)}\n`);
  if (prNumber && o.flags.post && ref) {
    const api = await githubApi(root);
    await api.createReview(ref, prNumber, {
      body: reviewMarkdown(result),
      event: 'COMMENT',
      comments: result.findings.map((f) => ({ path: f.file, line: f.line, side: 'RIGHT' as const, body: `**${f.title}** (${f.severity})\n\n${f.explanation}${f.suggestion ? `\n\nSuggestion: ${f.suggestion}` : ''}` })),
    });
    process.stderr.write(green(`posted the review on #${prNumber}\n`));
  }
  const failOn = String(o.flags['fail-on'] || '');
  if (failOn && result.findings.some((f) => f.severity === failOn || (failOn === 'medium' && f.severity === 'high'))) return 1;
  return 0;
}

async function commit(o: Options, pool: ProviderPool, exit = true): Promise<number> {
  if (o.flags.all) await git(o.cwd, ['add', '-A']);
  const { message, staged } = await commitMessage(pool, o.model, o.cwd);
  process.stdout.write(`${message}\n`);
  if (o.yes || o.flags.yes) {
    if (!staged) await git(o.cwd, ['add', '-A']);
    const lines = message.split('\n');
    const body = lines.slice(1).join('\n').trim();
    const r = await git(o.cwd, ['commit', '-m', lines[0], ...(body ? ['-m', body] : [])]);
    process.stderr.write(r.code === 0 ? green(`committed: ${lines[0]}\n`) : red(r.stderr));
    return r.code === 0 ? 0 : 1;
  }
  if (exit) process.stderr.write(dim('(run with -y to commit it)\n'));
  return 0;
}

async function pullRequest(o: Options, pool: ProviderPool): Promise<number> {
  const root = o.cwd;
  const ref = await repoRef(root);
  if (!ref) throw new Error('no GitHub "origin" remote');
  const info = await gitInfo(root);
  const api = await githubApi(root);
  const meta = await api.repo(ref);
  const base = typeof o.flags.base === 'string' ? o.flags.base : meta.default_branch;
  if (!info.branch || info.branch === base) throw new Error(`create a branch first (you are on ${base}): git checkout -b my-change`);
  const host = new NodeHost({ root });
  const token = await envOrGhToken(root);
  const push = await host.exec(`git -c credential.helper= -c 'credential.helper=!f() { echo username=x-access-token; echo "password=$MUSABAI_GH_TOKEN"; }; f' push -u origin HEAD`, { env: { MUSABAI_GH_TOKEN: token ?? '' } });
  if (push.exitCode !== 0) throw new Error(`git push failed:\n${push.output}`);
  const text = await pullRequestText(pool, o.model, root, base);
  const pr = await api.createPull(ref, { title: text.title, body: text.body, head: info.branch, base, draft: Boolean(o.flags.draft) });
  process.stdout.write(`${green('opened')} #${pr.number} ${pr.title}\n${pr.html_url}\n`);
  return 0;
}

async function keys(o: Options): Promise<number> {
  const [action = 'list', id, value] = o.rest;
  if (action === 'list') {
    const stored = await readCredentials();
    for (const k of PROVIDER_KEYS) {
      const set = Boolean(stored[k.id]) || k.envs.some((e) => process.env[e]);
      process.stdout.write(`${set ? green('●') : dim('○')} ${k.id.padEnd(11)} ${k.name.padEnd(26)} ${dim(set ? 'configured' : k.url)}\n`);
    }
    process.stdout.write(dim(`\nkeys file: ${credentialsPath()} (mode 600) — environment variables work too\n`));
    return 0;
  }
  const known = PROVIDER_KEYS.find((k) => k.id === id);
  if (!known) throw new Error(`unknown provider "${id}": ${PROVIDER_KEYS.map((k) => k.id).join(', ')}`);
  if (action === 'set') {
    let key = value;
    if (!key) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      key = await new Promise<string>((resolve) => rl.question(`${known.name} key (${known.url}): `, (a) => (rl.close(), resolve(a.trim()))));
    }
    await writeCredential(known.id, key);
    process.stdout.write(green(`saved the ${known.name} key\n`));
    return 0;
  }
  if (action === 'rm' || action === 'remove') {
    await writeCredential(known.id, undefined);
    process.stdout.write(`removed the ${known.name} key\n`);
    return 0;
  }
  throw new Error('usage: musabai keys [list | set <provider> [key] | rm <provider>]');
}

async function main(): Promise<number> {
  config = await loadConfig();
  const o = parse(process.argv.slice(2));
  if (!process.env.MUSABAI_MODEL && config.model && !process.argv.slice(2).some((a) => a === '-m' || a === '--model')) o.model = config.model;
  if (o.command === 'help') return void process.stdout.write(`${HELP}\n`), 0;
  if (o.command === 'version') return void process.stdout.write(`musabai ${VERSION}\n`), 0;
  const pool = makePool(adHocModel(o));
  switch (o.command) {
    case 'models':
      await printModels(pool);
      return 0;
    case 'keys':
      return keys(o);
    case 'review':
      return review(o, pool);
    case 'commit':
      return commit(o, pool);
    case 'pr':
      return pullRequest(o, pool);
    case 'mcp': {
      const mcp = new McpManager({ root: o.cwd, trustProjectServer: async () => o.yes });
      await mcp.startAll();
      printMcp(mcp);
      await mcp.stopAll();
      return 0;
    }
    case 'search': {
      const index = new CodebaseIndex(new NodeHost({ root: o.cwd }));
      for (const hit of await index.search(o.rest.join(' '), Number(o.flags.limit) || 8)) {
        process.stdout.write(`${cyan(`${hit.path}:${hit.startLine}-${hit.endLine}`)} ${dim(`score ${hit.score}`)}\n${hit.text.split('\n').slice(0, 8).map((l) => `  ${l}`).join('\n')}\n\n`);
      }
      return 0;
    }
    case 'laptop': {
      const [action, target] = o.rest;
      if (!LAPTOP_ACTIONS.includes(action as LaptopAction)) throw new Error(`actions: ${LAPTOP_ACTIONS.join(', ')}`);
      const result = await laptopAction(action as LaptopAction, { target, text: o.flags.text as string, title: o.flags.title as string, keys: o.flags.keys as string, level: o.flags.level as string });
      process.stdout.write(`${result.text}\n`);
      return 0;
    }
  }
  const session = new Session(o, pool);
  if (o.print) {
    let prompt = o.prompt ?? '';
    if (!process.stdin.isTTY) {
      const piped = await new Promise<string>((resolve) => {
        let data = '';
        process.stdin.on('data', (d) => (data += d));
        process.stdin.on('end', () => resolve(data));
      });
      if (piped.trim()) prompt = prompt ? `${prompt}\n\n<stdin>\n${piped}\n</stdin>` : piped;
    }
    if (!prompt.trim()) throw new Error('nothing to do: musabai -p "your request"');
    const result = await session.run(prompt);
    const changed = (await session.changes.summary()).map((c) => relPath(o.cwd, c.path));
    if (o.format === 'json') process.stdout.write(`${JSON.stringify({ result: result.text, status: result.reason, error: result.error, model: result.modelId, files_changed: changed })}\n`);
    else if (o.format === 'text') process.stdout.write(`${result.text}\n`);
    await session.mcp.stopAll();
    session.host.disposeProcesses();
    return result.reason === 'error' ? 1 : 0;
  }
  if (!process.stdin.isTTY) throw new Error('not a terminal: use musabai -p "request" for scripts');
  await session.interactive(o.prompt);
  return 0;
}

main()
  .then((code) => process.exit(code ?? 0))
  .catch((error: Error) => {
    process.stderr.write(red(`musabai: ${error.message}\n`));
    process.exit(1);
  });
