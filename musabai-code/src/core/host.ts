import { spawn, type ChildProcess } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { access, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { BrowserSession } from './browser';
import { isInside, isProbablyBinary, matchesGlob, newId, relPath } from './util';

export type ApprovalRequest =
  | { kind: 'command'; command: string; cwd: string; reason: string; background?: boolean }
  | { kind: 'write_outside'; path: string }
  | { kind: 'delete'; path: string }
  | { kind: 'laptop'; action: string; detail: string }
  | { kind: 'browser'; action: string; detail: string }
  | { kind: 'mcp'; server: string; tool: string; args: string };

export type ApprovalResult = 'allow' | 'deny' | 'always';

export interface ExecOptions {
  cwd?: string;
  timeoutMs?: number;
  background?: boolean;
  signal?: AbortSignal;
  onOutput?: (chunk: string) => void;
  env?: Record<string, string>;
  label?: string;
}

export interface ExecResult {
  exitCode: number | null;
  output: string;
  timedOut: boolean;
  killed: boolean;
  durationMs: number;
  backgroundId?: string;
}

export interface GrepOptions {
  pattern: string;
  path?: string;
  include?: string;
  exclude?: string;
  caseSensitive?: boolean;
  fixedStrings?: boolean;
  context?: number;
  maxResults?: number;
}

export interface GrepMatch {
  path: string;
  line: number;
  text: string;
  context?: boolean;
}

export interface Diagnostic {
  path: string;
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  source?: string;
}

export interface SearchHit {
  path: string;
  startLine: number;
  endLine: number;
  text: string;
  score: number;
}

export interface BackgroundProcess {
  id: string;
  command: string;
  cwd: string;
  startedAt: number;
  exitCode: number | null | undefined;
  output: string;
}

export interface AgentHost {
  readonly root: string;
  readText(abs: string): Promise<string | undefined>;
  writeText(abs: string, content: string): Promise<void>;
  deletePath(abs: string): Promise<void>;
  stat(abs: string): Promise<{ type: 'file' | 'dir' | 'other'; size: number; mtimeMs: number } | undefined>;
  readDir(abs: string): Promise<{ name: string; type: 'file' | 'dir' | 'other' }[]>;
  listFiles(options?: { glob?: string; under?: string; limit?: number }): Promise<string[]>;
  grep(options: GrepOptions): Promise<GrepMatch[]>;
  exec(command: string, options?: ExecOptions): Promise<ExecResult>;
  processes(): BackgroundProcess[];
  processOutput(id: string): BackgroundProcess | undefined;
  killProcess(id: string): Promise<boolean>;
  diagnostics(paths: string[]): Promise<Diagnostic[]>;
  approve(request: ApprovalRequest): Promise<ApprovalResult>;
  codebaseSearch?(query: string, limit: number): Promise<SearchHit[]>;
  openInEditor?(abs: string, line?: number): Promise<void>;
  /** The shared browser the agent drives (one per host); absent on hosts that don't support it. */
  browser?(): BrowserSession;
}

const DEFAULT_IGNORES = new Set([
  '.git', 'node_modules', '.venv', 'venv', '__pycache__', '.mypy_cache', '.pytest_cache', 'dist', 'build', 'out',
  '.next', '.nuxt', '.cache', 'target', '.gradle', '.idea', 'coverage', '.tox', '.vscode-test', '.turbo',
]);

const DEFAULT_IGNORE_GLOBS = [...DEFAULT_IGNORES].flatMap((name) => ['-g', `!${name}/`]);

const ANSI_RE =/\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

export async function which(command: string): Promise<string | undefined> {
  for (const dir of (process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(dir, command);
    try {
      await access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      // keep looking
    }
  }
  return undefined;
}

const RG_BUNDLED = [
  '/opt/musabai-code/resources/app/node_modules.asar.unpacked/@vscode/ripgrep-universal/bin/linux-x64/rg',
  '/opt/musabai-code/resources/app/node_modules/@vscode/ripgrep/bin/rg',
  '/usr/share/codium/resources/app/node_modules.asar.unpacked/@vscode/ripgrep-universal/bin/linux-x64/rg',
  '/usr/share/code/resources/app/node_modules/@vscode/ripgrep/bin/rg',
];

function run(command: string, args: string[], cwd: string, timeoutMs = 30_000, maxBytes = 20_000_000): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_PAGER: 'cat', PAGER: 'cat' } });
    let stdout = '';
    let stderr = '';
    let size = 0;
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (d: Buffer) => {
      size += d.length;
      if (size <= maxBytes) stdout += d.toString('utf8');
      else child.kill('SIGKILL');
    });
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString('utf8')));
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: stderr + String(error) });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

export function runProcess(command: string, args: string[], cwd: string, timeoutMs?: number) {
  return run(command, args, cwd, timeoutMs);
}

interface Running {
  info: BackgroundProcess;
  child: ChildProcess;
}

export interface NodeHostOptions {
  root: string;
  approve?: (request: ApprovalRequest) => Promise<ApprovalResult>;
  rgPath?: string;
  shell?: string;
  env?: Record<string, string>;
  /** Show the agent's browser window instead of running it headless. */
  browserHeaded?: boolean;
}

/** Plain Node implementation: the terminal agent uses it directly and the editor extends it. */
export class NodeHost implements AgentHost {
  readonly root: string;
  private rg: string | null | undefined;
  private fileCache: { at: number; files: string[] } | undefined;
  private readonly running = new Map<string, Running>();
  private browserSession?: BrowserSession;
  private readonly options: NodeHostOptions;

  constructor(options: NodeHostOptions) {
    this.options = options;
    this.root = path.resolve(options.root);
  }

  async readText(abs: string): Promise<string | undefined> {
    try {
      const data = await readFile(abs);
      if (isProbablyBinary(data)) throw new Error(`${relPath(this.root, abs)} is a binary file`);
      return data.toString('utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' || (error as NodeJS.ErrnoException).code === 'ENOTDIR') return undefined;
      throw error;
    }
  }

  async writeText(abs: string, content: string): Promise<void> {
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, content, 'utf8');
    this.fileCache = undefined;
  }

  async deletePath(abs: string): Promise<void> {
    await rm(abs, { recursive: true, force: true });
    this.fileCache = undefined;
  }

  async stat(abs: string) {
    try {
      const s = await stat(abs);
      return { type: s.isFile() ? ('file' as const) : s.isDirectory() ? ('dir' as const) : ('other' as const), size: s.size, mtimeMs: s.mtimeMs };
    } catch {
      return undefined;
    }
  }

  async readDir(abs: string) {
    const entries = await readdir(abs, { withFileTypes: true });
    return entries.map((e) => ({ name: e.name, type: e.isFile() ? ('file' as const) : e.isDirectory() ? ('dir' as const) : ('other' as const) }));
  }

  private async rgPath(): Promise<string | null> {
    if (this.rg !== undefined) return this.rg;
    if (this.options.rgPath) {
      this.rg = this.options.rgPath;
      return this.rg;
    }
    this.rg = (await which('rg')) ?? null;
    if (!this.rg) {
      for (const candidate of RG_BUNDLED) {
        try {
          await access(candidate, fsConstants.X_OK);
          this.rg = candidate;
          break;
        } catch {
          // next
        }
      }
    }
    return this.rg;
  }

  private gitRepo: boolean | undefined;

  async isGitRepo(): Promise<boolean> {
    if (this.gitRepo === undefined) {
      const r = await run('git', ['rev-parse', '--is-inside-work-tree'], this.root, 5000);
      this.gitRepo = r.code === 0 && r.stdout.trim() === 'true';
    }
    return this.gitRepo;
  }

  private async allFiles(): Promise<string[]> {
    if (this.fileCache && Date.now() - this.fileCache.at < 2000) return this.fileCache.files;
    let files: string[] | undefined;
    const git = await run('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], this.root, 20_000);
    if (git.code === 0) files = git.stdout.split('\0').filter(Boolean);
    if (!files) {
      const rg = await this.rgPath();
      if (rg) {
        const out = await run(rg, ['--files', '--hidden', ...DEFAULT_IGNORE_GLOBS], this.root, 20_000);
        if (out.code === 0 || out.code === 1) files = out.stdout.split('\n').filter(Boolean);
      }
    }
    if (!files) {
      files = [];
      const walk = async (dir: string, depth: number) => {
        if (depth > 12 || files!.length > 50_000) return;
        let entries: { name: string; type: string }[] = [];
        try {
          entries = await this.readDir(dir);
        } catch {
          return;
        }
        for (const e of entries) {
          if (e.type === 'dir') {
            if (!DEFAULT_IGNORES.has(e.name)) await walk(path.join(dir, e.name), depth + 1);
          } else if (e.type === 'file') files!.push(relPath(this.root, path.join(dir, e.name)));
        }
      };
      await walk(this.root, 0);
    }
    files.sort();
    this.fileCache = { at: Date.now(), files };
    return files;
  }

  async listFiles(options: { glob?: string; under?: string; limit?: number } = {}): Promise<string[]> {
    const limit = options.limit ?? 5000;
    const under = options.under ? relPath(this.root, path.resolve(this.root, options.under)).replace(/^\.$/, '') : '';
    const out: string[] = [];
    for (const file of await this.allFiles()) {
      if (under && !(file === under || file.startsWith(`${under}/`))) continue;
      if (options.glob && !matchesGlob(file, options.glob)) continue;
      out.push(file);
      if (out.length >= limit) break;
    }
    return out;
  }

  async grep(options: GrepOptions): Promise<GrepMatch[]> {
    const max = Math.min(options.maxResults ?? 100, 500);
    const target = options.path ? path.resolve(this.root, options.path) : this.root;
    const rg = await this.rgPath();
    if (rg) {
      // In a git repository rg follows .gitignore; elsewhere skip dependency and build folders unless searching inside one.
      const inIgnored = relPath(this.root, target).split('/').some((part) => DEFAULT_IGNORES.has(part));
      const excludes = (await this.isGitRepo()) || inIgnored ? ['-g', '!.git'] : DEFAULT_IGNORE_GLOBS;
      const args = ['--json', '--max-count', '50', '--max-filesize', '2M', '--hidden', ...excludes];
      if (!options.caseSensitive) args.push('-i');
      if (options.fixedStrings) args.push('-F');
      if (options.context) args.push('-C', String(Math.min(options.context, 5)));
      if (options.include) for (const g of options.include.split(',')) args.push('-g', g.trim());
      if (options.exclude) for (const g of options.exclude.split(',')) args.push('-g', `!${g.trim()}`);
      args.push('-e', options.pattern, '--', target);
      const out = await run(rg, args, this.root, 30_000);
      if (out.code === 0 || out.code === 1) {
        const matches: GrepMatch[] = [];
        for (const line of out.stdout.split('\n')) {
          if (!line) continue;
          let event: any;
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }
          if (event.type !== 'match' && event.type !== 'context') continue;
          const file = event.data.path?.text;
          if (!file) continue;
          matches.push({
            path: relPath(this.root, path.resolve(this.root, file)),
            line: event.data.line_number,
            text: String(event.data.lines?.text ?? '').replace(/\n$/, '').slice(0, 400),
            context: event.type === 'context' || undefined,
          });
          if (matches.filter((m) => !m.context).length >= max) break;
        }
        return matches;
      }
      if (out.code === 2 && /regex parse error/i.test(out.stderr)) throw new Error(`Invalid regex: ${out.stderr.split('\n').slice(0, 3).join(' ')}`);
    }
    let regex: RegExp;
    try {
      regex = new RegExp(options.fixedStrings ? options.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : options.pattern, options.caseSensitive ? '' : 'i');
    } catch (error) {
      throw new Error(`Invalid regex: ${(error as Error).message}`);
    }
    const under = relPath(this.root, target);
    const files = await this.listFiles({ under: under === '.' ? undefined : under, glob: options.include, limit: 20_000 });
    const matches: GrepMatch[] = [];
    for (const file of files) {
      if (options.exclude && matchesGlob(file, options.exclude.split(','))) continue;
      const abs = path.join(this.root, file);
      const info = await this.stat(abs);
      if (!info || info.size > 2_000_000) continue;
      let text: string | undefined;
      try {
        text = await this.readText(abs);
      } catch {
        continue;
      }
      if (!text) continue;
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          matches.push({ path: file, line: i + 1, text: lines[i].slice(0, 400) });
          if (matches.length >= max) return matches;
        }
      }
    }
    return matches;
  }

  protected shell(): string {
    return this.options.shell || '/bin/bash';
  }

  exec(command: string, options: ExecOptions = {}): Promise<ExecResult> {
    const cwd = options.cwd ? path.resolve(this.root, options.cwd) : this.root;
    const started = Date.now();
    const env = {
      ...process.env,
      GIT_PAGER: 'cat',
      PAGER: 'cat',
      GIT_TERMINAL_PROMPT: '0',
      DEBIAN_FRONTEND: 'noninteractive',
      MUSABAI_AGENT: '1',
      ...(this.options.env || {}),
      ...(options.env || {}),
    };
    const child = spawn(this.shell(), ['-c', command], { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const decoderOut = new StringDecoder('utf8');
    const decoderErr = new StringDecoder('utf8');
    const info: BackgroundProcess = { id: newId('p'), command, cwd, startedAt: started, exitCode: undefined, output: '' };
    const MAX = 400_000;
    const append = (text: string) => {
      info.output += text;
      if (info.output.length > MAX) info.output = info.output.slice(-MAX);
      options.onOutput?.(text);
    };
    child.stdout?.on('data', (d: Buffer) => append(decoderOut.write(d)));
    child.stderr?.on('data', (d: Buffer) => append(decoderErr.write(d)));

    const kill = () => {
      try {
        if (child.pid) process.kill(-child.pid, 'SIGTERM');
      } catch {
        child.kill('SIGTERM');
      }
      setTimeout(() => {
        try {
          if (child.pid && child.exitCode === null) process.kill(-child.pid, 'SIGKILL');
        } catch {
          // gone
        }
      }, 2000).unref();
    };

    if (options.background) {
      this.running.set(info.id, { info, child });
      child.on('close', (code) => {
        info.exitCode = code;
      });
      child.on('error', (error) => {
        append(`\n${String(error)}\n`);
        info.exitCode = -1;
      });
      return new Promise((resolve) => {
        // Give a server a moment to print its first lines (a port, or an immediate error).
        const timer = setTimeout(() => {
          resolve({ exitCode: info.exitCode ?? null, output: info.output, timedOut: false, killed: false, durationMs: Date.now() - started, backgroundId: info.id });
        }, 3000);
        child.on('close', () => {
          clearTimeout(timer);
          resolve({ exitCode: info.exitCode ?? null, output: info.output, timedOut: false, killed: false, durationMs: Date.now() - started, backgroundId: info.id });
        });
      });
    }

    return new Promise((resolve) => {
      let timedOut = false;
      let killed = false;
      const timer = setTimeout(() => {
        timedOut = true;
        kill();
      }, options.timeoutMs ?? 300_000);
      const onAbort = () => {
        killed = true;
        kill();
      };
      options.signal?.addEventListener('abort', onAbort, { once: true });
      let finished = false;
      const done = (code: number | null) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', onAbort);
        append(decoderOut.end() + decoderErr.end());
        resolve({ exitCode: code, output: info.output, timedOut, killed, durationMs: Date.now() - started });
      };
      child.on('error', (error) => {
        append(`${String(error)}\n`);
        done(-1);
      });
      child.on('close', (code) => done(code));
    });
  }

  processes(): BackgroundProcess[] {
    return [...this.running.values()].map((r) => r.info);
  }

  processOutput(id: string): BackgroundProcess | undefined {
    return this.running.get(id)?.info;
  }

  async killProcess(id: string): Promise<boolean> {
    const entry = this.running.get(id);
    if (!entry) return false;
    try {
      if (entry.child.pid) process.kill(-entry.child.pid, 'SIGTERM');
    } catch {
      entry.child.kill('SIGTERM');
    }
    return true;
  }

  browser(): BrowserSession {
    this.browserSession ??= new BrowserSession({ which, headless: !this.options.browserHeaded, noSandbox: process.getuid?.() === 0 });
    return this.browserSession;
  }

  disposeProcesses(): void {
    for (const id of this.running.keys()) void this.killProcess(id);
    void this.browserSession?.close();
    this.browserSession = undefined;
  }

  async diagnostics(paths: string[]): Promise<Diagnostic[]> {
    const out: Diagnostic[] = [];
    for (const abs of paths) {
      const rel = relPath(this.root, abs);
      const text = await this.readText(abs).catch(() => undefined);
      if (text === undefined) continue;
      const ext = path.extname(abs).toLowerCase();
      if (ext === '.json' && !/tsconfig|jsconfig|\.vscode/.test(rel)) {
        try {
          JSON.parse(text);
        } catch (error) {
          out.push({ path: rel, line: 1, column: 1, severity: 'error', message: (error as Error).message, source: 'json' });
        }
      } else if (['.js', '.mjs', '.cjs'].includes(ext)) {
        const r = await run(process.execPath, ['--check', abs], this.root, 20_000);
        if (r.code !== 0) out.push(parseFirstError(rel, r.stderr, 'node --check'));
      } else if (ext === '.py') {
        const r = await run('python3', ['-c', 'import ast,sys; ast.parse(open(sys.argv[1]).read(), sys.argv[1])', abs], this.root, 20_000);
        if (r.code !== 0) out.push(parseFirstError(rel, r.stderr, 'python'));
      } else if (ext === '.sh' || ext === '.bash') {
        const r = await run('bash', ['-n', abs], this.root, 10_000);
        if (r.code !== 0) out.push(parseFirstError(rel, r.stderr, 'bash -n'));
      }
    }
    return out;
  }

  async approve(request: ApprovalRequest): Promise<ApprovalResult> {
    return this.options.approve ? this.options.approve(request) : 'deny';
  }

  insideWorkspace(abs: string): boolean {
    return isInside(this.root, abs);
  }
}

function parseFirstError(rel: string, stderr: string, source: string): Diagnostic {
  const line = Number(/line (\d+)/i.exec(stderr)?.[1] || /:(\d+)(?::\d+)?\b/.exec(stderr)?.[1] || 1);
  const message = stderr
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('at ') && !l.startsWith('Node.js'))
    .slice(-3)
    .join(' ')
    .slice(0, 500);
  return { path: rel, line, column: 1, severity: 'error', message: message || 'syntax error', source };
}
