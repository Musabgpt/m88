import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as vscode from 'vscode';
import { AgentSession } from '../core/agent/agent';
import { git, gitInfo } from '../core/git';
import { parseRemote } from '../core/github';
import { NodeHost } from '../core/host';
import { pullRequestText } from '../core/oneshot';
import { evaluateCommand } from '../core/policy';
import { newId, slug } from '../core/util';
import { environmentProvider, rulesProvider } from '../core/workspace';
import { chatModel, configuredPolicy, disabledTools, get, modes } from './config';
import { t } from './l10n';
import type { Services } from './services';

export const GIT_SCHEME = 'musabai-git';

interface BgAgent {
  id: string;
  prompt: string;
  title: string;
  status: 'running' | 'done' | 'failed' | 'stopped';
  branch: string;
  worktree: string;
  repoRoot: string;
  baseCommit: string;
  createdAt: number;
  model?: string;
  summary?: string;
  error?: string;
  files?: string[];
  steps?: number;
  lastAction?: string;
}

type Item = { kind: 'agent'; agent: BgAgent } | { kind: 'file'; agent: BgAgent; file: string };

const STORE_KEY = 'musabai.backgroundAgents';

function spawnGit(args: string[], cwd: string, options: { input?: string; env?: Record<string, string> } = {}): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('git', args, { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...(options.env ?? {}) } });
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => (stderr += d));
    child.on('close', (code) => resolve({ code, stderr }));
    child.on('error', (e) => resolve({ code: -1, stderr: String(e) }));
    child.stdin.end(options.input ?? '');
  });
}

const TOKEN_HELPER = ['-c', 'credential.helper=', '-c', 'credential.helper=!f() { echo username=x-access-token; echo "password=$MUSABAI_GH_TOKEN"; }; f'];

export class BackgroundAgents implements vscode.TreeDataProvider<Item>, vscode.TextDocumentContentProvider, vscode.Disposable {
  private agents: BgAgent[];
  private readonly controllers = new Map<string, AbortController>();
  private readonly changed = new vscode.EventEmitter<Item | undefined>();
  readonly onDidChangeTreeData = this.changed.event;
  private readonly logs = new Map<string, vscode.OutputChannel>();
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly services: Services, private readonly context: vscode.ExtensionContext) {
    this.agents = context.workspaceState.get<BgAgent[]>(STORE_KEY, []).map((a) => (a.status === 'running' ? { ...a, status: 'stopped' as const } : a));
    this.disposables.push(vscode.workspace.registerTextDocumentContentProvider(GIT_SCHEME, this));
  }

  private save(): void {
    void this.context.workspaceState.update(STORE_KEY, this.agents);
    this.changed.fire(undefined);
  }

  getTreeItem(item: Item): vscode.TreeItem {
    if (item.kind === 'file') {
      const tree = new vscode.TreeItem(item.file, vscode.TreeItemCollapsibleState.None);
      tree.resourceUri = vscode.Uri.file(path.join(item.agent.worktree, item.file));
      tree.command = { command: 'musabai.background.diffFile', title: 'Diff', arguments: [item.agent.id, item.file] };
      return tree;
    }
    const a = item.agent;
    const icon = a.status === 'running' ? 'loading~spin' : a.status === 'done' ? 'pass' : a.status === 'failed' ? 'error' : 'debug-stop';
    const tree = new vscode.TreeItem(a.title, a.files?.length ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    tree.iconPath = new vscode.ThemeIcon(icon);
    tree.description = a.status === 'running' ? `${a.lastAction ?? 'working'}${a.steps ? ` · step ${a.steps}` : ''}` : `${a.status}${a.files ? ` · ${a.files.length} file${a.files.length === 1 ? '' : 's'}` : ''}`;
    tree.tooltip = new vscode.MarkdownString(`**${a.title}**\n\n${a.prompt}\n\nBranch \`${a.branch}\`\n\n${a.summary ?? a.error ?? ''}`);
    tree.contextValue = `bg-${a.status}`;
    tree.command = { command: 'musabai.background.showLog', title: 'Log', arguments: [a.id] };
    return tree;
  }

  getChildren(item?: Item): Item[] {
    if (!item) return [...this.agents].sort((a, b) => b.createdAt - a.createdAt).map((agent) => ({ kind: 'agent', agent }));
    if (item.kind === 'agent') return (item.agent.files ?? []).map((file) => ({ kind: 'file', agent: item.agent, file }));
    return [];
  }

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const params = new URLSearchParams(uri.query);
    const out = await git(params.get('repo') || '/', ['show', `${params.get('ref')}:${uri.path.replace(/^\//, '')}`]);
    return out.code === 0 ? out.stdout : '';
  }

  private find(id: string | { agent?: BgAgent }): BgAgent | undefined {
    const key = typeof id === 'string' ? id : id?.agent?.id;
    return this.agents.find((a) => a.id === key);
  }

  private log(agent: BgAgent): vscode.OutputChannel {
    let channel = this.logs.get(agent.id);
    if (!channel) {
      channel = vscode.window.createOutputChannel(`MusabAI Background: ${agent.title.slice(0, 40)}`);
      this.logs.set(agent.id, channel);
    }
    return channel;
  }

  async create(promptArg?: string): Promise<void> {
    const root = this.services.root;
    if (!root) return void vscode.window.showWarningMessage(t('Open a folder first.'));
    // A worktree isolates files, not the machine: background agents run commands without asking, so only in trusted folders.
    if (!vscode.workspace.isTrusted) {
      const manage = 'Manage Workspace Trust';
      void vscode.window.showWarningMessage('MusabAI: background agents run commands on their own, so they need a trusted folder.', manage).then((choice) => {
        if (choice === manage) void vscode.commands.executeCommand('workbench.trust.manage');
      });
      return;
    }
    const info = await gitInfo(root);
    if (!info.isRepo || !info.head) return void vscode.window.showWarningMessage('MusabAI: background agents need a git repository with at least one commit.');
    const prompt = promptArg?.trim() || (await vscode.window.showInputBox({ title: 'MusabAI — new background agent', prompt: 'What should it do? It works on its own copy (a git worktree) while you keep coding.' }));
    if (!prompt?.trim()) return;
    const id = newId('bg');
    const repoKey = `${path.basename(root)}-${createHash('sha1').update(root).digest('hex').slice(0, 6)}`;
    const worktree = path.join(os.homedir(), '.musabai', 'worktrees', repoKey, id);
    const branch = `musabai/${slug(prompt, 30)}-${id.slice(-4)}`;
    await mkdir(path.dirname(worktree), { recursive: true });
    const made = await git(root, ['worktree', 'add', '-b', branch, worktree, 'HEAD'], 120_000);
    if (made.code !== 0) return void vscode.window.showErrorMessage(`MusabAI: could not create the worktree: ${made.stderr.trim()}`);
    const base = (await git(root, ['rev-parse', 'HEAD'])).stdout.trim();
    const agent: BgAgent = { id, prompt: prompt.trim(), title: prompt.trim().split('\n')[0].slice(0, 70), status: 'running', branch, worktree, repoRoot: root, baseCommit: base, createdAt: Date.now() };
    this.agents.push(agent);
    this.save();
    void vscode.commands.executeCommand('musabai.backgroundAgents.focus');
    void this.run(agent);
  }

  private async run(agent: BgAgent): Promise<void> {
    const controller = new AbortController();
    this.controllers.set(agent.id, controller);
    const out = this.log(agent);
    out.appendLine(`Task: ${agent.prompt}\nWorktree: ${agent.worktree} (branch ${agent.branch})\n`);
    const host = new NodeHost({ root: agent.worktree, rgPath: undefined });
    const base = configuredPolicy();
    const session = new AgentSession({
      pool: this.services.pool,
      host,
      emit: (event) => {
        if (event.type === 'tool_end') {
          agent.lastAction = event.summary;
          out.appendLine(`${event.ok ? '✓' : '✗'} ${event.summary}`);
          this.changed.fire(undefined);
        } else if (event.type === 'step') agent.steps = event.step;
        else if (event.type === 'status') out.appendLine(`… ${event.message}`);
        else if (event.type === 'model') agent.model = event.name;
        else if (event.type === 'text') out.append(event.text);
      },
      // It works on an isolated copy, so ordinary commands run without asking; risky ones still ask.
      policy: () => ({ ...base, mode: 'auto' }),
      approve: async (request) => {
        if (request.kind === 'command' && evaluateCommand(request.command, { ...base, mode: 'auto' }).decision === 'allow') return 'allow';
        const detail = request.kind === 'command' ? request.command : request.kind === 'laptop' ? `${request.action} ${request.detail}` : 'path' in request ? request.path : JSON.stringify(request);
        const choice = await vscode.window.showWarningMessage(`Background agent "${agent.title}" asks: ${request.kind} — ${detail.slice(0, 200)}`, t('Allow'), t('Deny'));
        return choice === t('Allow') ? 'allow' : 'deny';
      },
      environment: environmentProvider(agent.worktree, 'background'),
      rules: rulesProvider(agent.worktree, () => get<string[]>('rules.user', [])),
      github: async () => this.services.github(false),
      disabledTools: () => [...disabledTools(), '#laptop'],
      maxSteps: get('agent.maxSteps', 60) * 2,
    });
    try {
      const result = await session.run({
        turnId: newId('t'),
        text: `${agent.prompt}\n\nWork autonomously until it is done and verified. Do not commit or push; the user reviews your changes.`,
        mode: modes().find((m) => m.id === 'agent')!,
        modelId: chatModel(),
        signal: controller.signal,
      });
      agent.status = result.reason === 'completed' || result.reason === 'max_steps' ? 'done' : result.reason === 'cancelled' ? 'stopped' : 'failed';
      agent.summary = result.text.slice(0, 2000);
      agent.error = result.error;
      out.appendLine(`\n\n[${agent.status}]${result.error ? ` ${result.error}` : ''}`);
    } catch (error) {
      agent.status = 'failed';
      agent.error = (error as Error).message;
    } finally {
      this.controllers.delete(agent.id);
      host.disposeProcesses();
      agent.files = await this.changedFiles(agent);
      this.save();
    }
    if (agent.status === 'done') {
      const choice = await vscode.window.showInformationMessage(`${t('Background agent finished')}: ${agent.title} (${agent.files?.length ?? 0} files)`, 'Review', 'Apply', 'Create PR');
      if (choice === 'Review') await this.review(agent.id);
      else if (choice === 'Apply') await this.apply(agent.id);
      else if (choice === 'Create PR') await this.createPr(agent.id);
    } else if (agent.status === 'failed') {
      void vscode.window.showErrorMessage(`${t('Background agent failed')}: ${agent.title}${agent.error ? ` — ${agent.error.slice(0, 200)}` : ''}`);
    }
  }

  private async changedFiles(agent: BgAgent): Promise<string[]> {
    await git(agent.worktree, ['add', '-A', '--intent-to-add']);
    const out = await git(agent.worktree, ['diff', '--name-only', agent.baseCommit]);
    return out.stdout.split('\n').filter(Boolean);
  }

  async stop(id: string | { agent?: BgAgent }): Promise<void> {
    const agent = this.find(id);
    if (agent) this.controllers.get(agent.id)?.abort();
  }

  showLog(id: string): void {
    const agent = this.find(id);
    if (agent) this.log(agent).show(true);
  }

  async diffFile(id: string, file: string): Promise<void> {
    const agent = this.find(id);
    if (!agent) return;
    const left = vscode.Uri.from({ scheme: GIT_SCHEME, path: `/${file}`, query: new URLSearchParams({ repo: agent.repoRoot, ref: agent.baseCommit }).toString() });
    await vscode.commands.executeCommand('vscode.diff', left, vscode.Uri.file(path.join(agent.worktree, file)), `${file} (background agent)`);
  }

  async review(id: string | { agent?: BgAgent }): Promise<void> {
    const agent = this.find(id);
    if (!agent?.files?.length) return;
    const resources = agent.files.map((file) => [
      vscode.Uri.file(path.join(agent.worktree, file)),
      vscode.Uri.from({ scheme: GIT_SCHEME, path: `/${file}`, query: new URLSearchParams({ repo: agent.repoRoot, ref: agent.baseCommit }).toString() }),
      vscode.Uri.file(path.join(agent.worktree, file)),
    ]);
    await vscode.commands.executeCommand('vscode.changes', `Background agent: ${agent.title}`, resources).then(undefined, () => this.diffFile(agent.id, agent.files![0]));
  }

  /** Brings the agent's changes into the main workspace with a 3-way patch. */
  async apply(id: string | { agent?: BgAgent }): Promise<void> {
    const agent = this.find(id);
    if (!agent) return;
    await git(agent.worktree, ['add', '-A', '--intent-to-add']);
    const patch = await git(agent.worktree, ['diff', '--binary', agent.baseCommit]);
    if (!patch.stdout.trim()) return void vscode.window.showInformationMessage('MusabAI: the background agent made no changes.');
    const applied = await spawnGit(['apply', '--3way', '--whitespace=nowarn', '-'], agent.repoRoot, { input: patch.stdout });
    if (applied.code === 0) void vscode.window.showInformationMessage(`MusabAI: applied ${agent.files?.length ?? 0} changed files to your workspace.`);
    else void vscode.window.showWarningMessage(`MusabAI: the patch applied with conflicts — check the files with conflict markers. ${applied.stderr.trim().slice(0, 300)}`);
  }

  async createPr(id: string | { agent?: BgAgent }): Promise<void> {
    const agent = this.find(id);
    if (!agent) return;
    const info = await gitInfo(agent.repoRoot);
    const ref = parseRemote(info.remoteUrl);
    if (!ref) return void vscode.window.showWarningMessage('MusabAI: no GitHub "origin" remote.');
    try {
      const pr = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'MusabAI: committing, pushing and opening the pull request…' }, async () => {
        await git(agent.worktree, ['add', '-A']);
        await git(agent.worktree, ['commit', '-m', agent.title, '-m', `Made by a MusabAI background agent.\n\nTask: ${agent.prompt}`]);
        const token = await this.services.githubToken(true);
        const pushed = await spawnGit([...TOKEN_HELPER, 'push', '-u', 'origin', agent.branch], agent.worktree, { env: { MUSABAI_GH_TOKEN: token ?? '' } });
        if (pushed.code !== 0) throw new Error('git push failed (sign in to GitHub from the Accounts menu)');
        const api = this.services.github(true);
        const meta = await api.repo(ref);
        const text = await pullRequestText(this.services.pool, chatModel(), agent.worktree, meta.default_branch);
        return api.createPull(ref, { title: text.title, body: text.body, head: agent.branch, base: meta.default_branch, draft: true });
      });
      const open = await vscode.window.showInformationMessage(`${t('Pull request created')}: #${pr.number}`, t('Open on GitHub'));
      if (open) void vscode.env.openExternal(vscode.Uri.parse(pr.html_url));
    } catch (error) {
      void vscode.window.showErrorMessage(`MusabAI: ${(error as Error).message}`);
    }
  }

  async openWorktree(id: string | { agent?: BgAgent }): Promise<void> {
    const agent = this.find(id);
    if (agent) await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(agent.worktree), { forceNewWindow: true });
  }

  list(): readonly BgAgent[] {
    return this.agents;
  }

  async discard(id: string | { agent?: BgAgent }, confirm = true): Promise<void> {
    const agent = this.find(id);
    if (!agent) return;
    const ok = !confirm ? 'Discard' : await vscode.window.showWarningMessage(`Discard the background agent "${agent.title}" and delete its worktree and branch?`, { modal: true }, 'Discard');
    if (ok !== 'Discard') return;
    this.controllers.get(agent.id)?.abort();
    await git(agent.repoRoot, ['worktree', 'remove', '--force', agent.worktree]);
    await git(agent.repoRoot, ['branch', '-D', agent.branch]);
    this.logs.get(agent.id)?.dispose();
    this.logs.delete(agent.id);
    this.agents = this.agents.filter((a) => a.id !== agent.id);
    this.save();
  }

  dispose(): void {
    for (const c of this.controllers.values()) c.abort();
    this.logs.forEach((l) => l.dispose());
    this.changed.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}
