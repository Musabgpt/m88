import { createHash } from 'node:crypto';
import path from 'node:path';
import * as vscode from 'vscode';
import { ChangeTracker } from '../core/changes';
import { keyResolver, writeCredential } from '../core/credentials';
import { GitHubApi, envOrGhToken } from '../core/github';
import type { ApprovalRequest, ApprovalResult } from '../core/host';
import { CodebaseIndex } from '../core/index/indexer';
import type { McpServerConfig } from '../core/mcp/client';
import { McpManager } from '../core/mcp/manager';
import { FIM_POOL, FREE_POOL } from '../core/providers/catalog';
import { ProviderPool } from '../core/providers/pool';
import { AgentTerminal } from './agentTerminal';
import { customModels, get } from './config';
import { t } from './l10n';
import { VsCodeHost, bundledRipgrep } from './vsHost';

export const SECRET_PREFIX = 'musabai.key.';
const PENDING_KEY = 'musabai.pendingChanges';

export class Services implements vscode.Disposable {
  readonly log: vscode.LogOutputChannel;
  readonly terminal = new AgentTerminal();
  readonly pool: ProviderPool;
  root?: string;
  host?: VsCodeHost;
  index?: CodebaseIndex;
  mcp?: McpManager;
  changes?: ChangeTracker;
  private rgPath?: string;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly workspaceDisposables: vscode.Disposable[] = [];
  private readonly onDidChangeWorkspaceEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeWorkspace = this.onDidChangeWorkspaceEmitter.event;
  private readonly onDidChangeModelsEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeModels = this.onDidChangeModelsEmitter.event;
  approvalHandler: (request: ApprovalRequest) => Promise<ApprovalResult> = async () => 'deny';

  constructor(readonly context: vscode.ExtensionContext) {
    this.log = vscode.window.createOutputChannel('MusabAI', { log: true });
    const resolveKey = keyResolver({ secrets: (id) => Promise.resolve(context.secrets.get(SECRET_PREFIX + id)) });
    this.pool = new ProviderPool({
      resolveKey,
      customModels,
      discoverKilo: get('models.discoverKilo', true),
      discoverLocal: get('models.discoverLocal', true),
      localUrls: { ollama: get('local.ollamaUrl', ''), lmstudio: get('local.lmstudioUrl', ''), llamacpp: get('local.llamacppUrl', '') },
      log: (line) => this.log.info(line),
    });
    this.disposables.push(
      this.log,
      this.terminal,
      vscode.workspace.onDidChangeWorkspaceFolders(() => void this.openWorkspace()),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('musabai.models') || e.affectsConfiguration('musabai.local')) {
          this.pool.refresh();
          this.onDidChangeModelsEmitter.fire();
        }
        if (e.affectsConfiguration('musabai.mcp')) void this.mcp?.startAll();
      }),
      vscode.workspace.onDidGrantWorkspaceTrust(() => void this.mcp?.startAll()),
      context.secrets.onDidChange((e) => {
        if (e.key.startsWith(SECRET_PREFIX)) this.onDidChangeModelsEmitter.fire();
      }),
    );
  }

  async init(): Promise<void> {
    this.rgPath = await bundledRipgrep();
    await this.openWorkspace();
  }

  /** The folder the agent works in: the first workspace folder. */
  private async openWorkspace(): Promise<void> {
    this.workspaceDisposables.splice(0).forEach((d) => d.dispose());
    void this.mcp?.stopAll();
    const folder = vscode.workspace.workspaceFolders?.find((f) => f.uri.scheme === 'file');
    this.root = folder?.uri.fsPath;
    if (!this.root) {
      this.host = undefined;
      this.index = undefined;
      this.mcp = undefined;
      this.changes = undefined;
      this.onDidChangeWorkspaceEmitter.fire();
      return;
    }
    const root = this.root;
    this.host = new VsCodeHost({ root, rgPath: this.rgPath, terminal: this.terminal, approve: (r) => this.approvalHandler(r), index: () => this.index, browserHeaded: get('browser.headed', false) });
    this.changes = new ChangeTracker(this.host);
    // Pending agent changes survive a window reload: their baselines are kept per workspace.
    this.changes.restore(this.context.workspaceState.get<Record<string, string | null>>(PENDING_KEY));
    let saveTimer: NodeJS.Timeout | undefined;
    const changes = this.changes;
    const unsubscribe = changes.onDidChange(() => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        const data = changes.toJSON();
        const size = Object.values(data).reduce((n, v) => n + (v?.length ?? 0), 0);
        void this.context.workspaceState.update(PENDING_KEY, size < 8_000_000 ? data : undefined);
      }, 500);
    });
    this.workspaceDisposables.push({ dispose: unsubscribe });
    this.index = new CodebaseIndex(this.host, { maxFiles: get('index.maxFiles', 8000) });
    this.mcp = new McpManager({
      root,
      disabled: () => get<string[]>('mcp.disabledServers', []),
      trustProjectServer: (config) => this.trustServer(config),
      log: (line) => this.log.info(line),
    });

    if (get('index.enabled', true)) {
      setTimeout(() => void this.index?.build().then(() => this.log.info(`Indexed ${this.index?.status.files} files (${this.index?.status.chunks} chunks)`)), 2500);
      const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder!, '**/*'));
      const pending = new Map<string, 'update' | 'delete'>();
      let timer: NodeJS.Timeout | undefined;
      const queue = (uri: vscode.Uri, op: 'update' | 'delete') => {
        const rel = path.relative(root, uri.fsPath);
        if (rel.startsWith('..') || /(^|\/)(\.git|node_modules)(\/|$)/.test(rel)) return;
        pending.set(rel, op);
        if (timer) clearTimeout(timer);
        timer = setTimeout(async () => {
          for (const [file, action] of pending) {
            if (action === 'delete') this.index?.forget(file);
            else await this.index?.updateFile(file).catch(() => undefined);
          }
          pending.clear();
        }, 1500);
      };
      this.workspaceDisposables.push(
        watcher,
        watcher.onDidCreate((u) => queue(u, 'update')),
        watcher.onDidChange((u) => queue(u, 'update')),
        watcher.onDidDelete((u) => queue(u, 'delete')),
      );
    }
    const mcpWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder!, '{.cursor,.musabai,.vscode}/mcp.json'));
    const reloadMcp = () => void this.mcp?.reload().then(() => this.mcp?.startAll());
    this.workspaceDisposables.push(mcpWatcher, mcpWatcher.onDidChange(reloadMcp), mcpWatcher.onDidCreate(reloadMcp), mcpWatcher.onDidDelete(reloadMcp));
    this.onDidChangeWorkspaceEmitter.fire();
  }

  private async trustServer(config: McpServerConfig): Promise<boolean> {
    // Restricted Mode: the project's servers wait until the folder is trusted (onDidGrantWorkspaceTrust starts them).
    if (!vscode.workspace.isTrusted) {
      this.log.info(`Restricted Mode: the project MCP server "${config.name}" was not started`);
      return false;
    }
    const fingerprint = createHash('sha256')
      .update(JSON.stringify([config.name, config.command, config.args, config.env, config.url, config.headers]))
      .digest('hex')
      .slice(0, 16);
    const key = `musabai.mcpTrust.${fingerprint}`;
    const known = this.context.workspaceState.get<boolean>(key);
    if (known !== undefined) return known;
    const detail = (config.url ?? `${config.command} ${(config.args ?? []).join(' ')}`).slice(0, 300);
    const answer = await vscode.window.showWarningMessage(
      `This project's ${path.basename(path.dirname(config.configFile))}/mcp.json wants to start the MCP server "${config.name}": ${detail}`,
      t('Trust and start'),
      t('Not now'),
    );
    const ok = answer === t('Trust and start');
    if (answer) await this.context.workspaceState.update(key, ok);
    return ok;
  }

  async githubToken(interactive = false): Promise<string | undefined> {
    try {
      const session = await vscode.authentication.getSession('github', ['repo', 'workflow', 'read:user'], interactive ? { createIfNone: true } : { silent: true });
      if (session?.accessToken) return session.accessToken;
    } catch (error) {
      if (interactive) this.log.warn(`GitHub sign-in failed: ${(error as Error).message}`);
    }
    return envOrGhToken(this.root || process.cwd());
  }

  github(interactive = false): GitHubApi {
    return new GitHubApi(() => this.githubToken(interactive));
  }

  async setKey(secretId: string, value: string | undefined, alsoForTerminal: boolean): Promise<void> {
    if (value?.trim()) await this.context.secrets.store(SECRET_PREFIX + secretId, value.trim());
    else await this.context.secrets.delete(SECRET_PREFIX + secretId);
    if (alsoForTerminal) await writeCredential(secretId, value);
    for (const spec of [...FREE_POOL, ...FIM_POOL]) if (spec.secretId === secretId) this.pool.health.forget(spec.id);
    this.onDidChangeModelsEmitter.fire();
  }

  async hasKey(secretId: string): Promise<boolean> {
    return Boolean(await this.context.secrets.get(SECRET_PREFIX + secretId));
  }

  dispose(): void {
    void this.mcp?.stopAll();
    this.host?.disposeProcesses();
    this.workspaceDisposables.forEach((d) => d.dispose());
    this.disposables.forEach((d) => d.dispose());
  }
}
