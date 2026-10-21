import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as vscode from 'vscode';
import { PROVIDER_KEYS } from '../core/providers/catalog';
import { loadRules, RULE_TEMPLATE } from '../core/rules';
import { slug } from '../core/util';
import type { ChatController } from './chatController';
import { configuredPolicy, get, language, set } from './config';
import { t } from './l10n';
import type { Services } from './services';

const SETTABLE = new Set([
  'model', 'tab.model', 'inlineEdit.model', 'agent.runMode', 'agent.allowList', 'agent.denyList', 'agent.maxSteps', 'agent.revealTerminal',
  'laptop.enabled', 'tab.enabled', 'tab.debounceMs', 'tab.chatFallback', 'rules.user', 'index.enabled', 'mcp.disabledServers', 'language',
  'models.discoverKilo', 'models.discoverLocal',
]);

const COMMANDS = new Set(['musabai.github.signIn', 'musabai.import', 'musabai.rules.new', 'musabai.index.rebuild', 'workbench.action.openSettings', 'musabai.walkthrough']);

/** MusabAI Settings (Ctrl+Shift+J): models, free keys, agent permissions, rules, MCP, indexing. */
export class SettingsPanel implements vscode.Disposable {
  private panel?: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly context: vscode.ExtensionContext, private readonly services: Services, private readonly chat: ChatController) {
    this.disposables.push(
      services.onDidChangeModels(() => void this.push()),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('musabai')) void this.push();
      }),
    );
  }

  async open(section?: string): Promise<void> {
    if (this.panel) {
      this.panel.reveal();
      if (section) void this.panel.webview.postMessage({ type: 'section', section });
      return;
    }
    const dist = vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview');
    const panel = vscode.window.createWebviewPanel('musabai.settings', 'MusabAI Settings', vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [dist, vscode.Uri.joinPath(this.context.extensionUri, 'media')],
    });
    panel.iconPath = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'icon.png');
    const nonce = randomBytes(16).toString('base64');
    const asset = (name: string) => panel.webview.asWebviewUri(vscode.Uri.joinPath(dist, name));
    panel.webview.html = `<!DOCTYPE html><html lang="${language()}"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${panel.webview.cspSource} data:; style-src ${panel.webview.cspSource} 'unsafe-inline'; font-src ${panel.webview.cspSource}; script-src 'nonce-${nonce}';">
<link href="${asset('codicon.css')}" rel="stylesheet"><link href="${asset('settings.css')}" rel="stylesheet"><title>MusabAI Settings</title></head>
<body><div id="app" data-section="${section ?? ''}"></div><script nonce="${nonce}" src="${asset('settings.js')}"></script></body></html>`;
    panel.webview.onDidReceiveMessage((m) => void this.handle(m).catch((e: Error) => this.services.log.error(`settings: ${e.message}`)), null, this.disposables);
    panel.onDidDispose(() => (this.panel = undefined), null, this.disposables);
    this.panel = panel;
  }

  private async ollama(): Promise<{ running: boolean; models: string[] }> {
    try {
      const base = (get('local.ollamaUrl', '') || 'http://127.0.0.1:11434').replace(/\/v1\/?$/, '');
      const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(1200) });
      const data = (await res.json()) as { models?: { name: string }[] };
      return { running: true, models: (data.models ?? []).map((m) => m.name) };
    } catch {
      return { running: false, models: [] };
    }
  }

  private async state() {
    const root = this.services.root;
    const rules = root ? await loadRules(root) : [];
    const keys = await Promise.all(PROVIDER_KEYS.map(async (k) => ({ ...k, set: (await this.services.hasKey(k.id)) || k.envs.some((e) => Boolean(process.env[e])) })));
    const p = configuredPolicy();
    return {
      version: String(this.context.extension.packageJSON.version ?? ''),
      language: language(),
      languageSetting: get('language', 'auto'),
      chatModel: get('model', 'kilo-auto/free'),
      tabModel: get('tab.model', ''),
      inlineModel: get('inlineEdit.model', ''),
      models: await this.chat.modelOptions(),
      health: this.services.pool.health.snapshot(),
      keys,
      agent: { runMode: p.mode, allowList: p.allow, denyList: p.deny, maxSteps: get('agent.maxSteps', 60), autoContinue: get('agent.autoContinue', true), laptop: get('laptop.enabled', true), revealTerminal: get('agent.revealTerminal', true) },
      tab: { enabled: get('tab.enabled', true), debounceMs: get('tab.debounceMs', 0), chatFallback: get('tab.chatFallback', true), fim: (await this.services.pool.fimCandidates()).map((f) => f.spec.name) },
      rules: { user: get<string[]>('rules.user', []), project: rules.filter((r) => r.source !== 'user').map((r) => ({ name: r.name, path: r.path, kind: r.kind, description: r.description })) },
      mcp: this.services.mcp?.status() ?? [],
      index: { enabled: get('index.enabled', true), ...(this.services.index?.status ?? { files: 0, chunks: 0, building: false }) },
      discover: { kilo: get('models.discoverKilo', true), local: get('models.discoverLocal', true) },
      ollama: await this.ollama(),
      hasWorkspace: Boolean(root),
    };
  }

  async push(): Promise<void> {
    if (this.panel) void this.panel.webview.postMessage({ type: 'state', state: await this.state() });
  }

  private async handle(m: { type: string; [k: string]: any }): Promise<void> {
    switch (m.type) {
      case 'ready':
      case 'refresh':
        await this.push();
        break;
      case 'refreshModels':
        this.services.pool.refresh();
        this.services.pool.health.clear();
        await this.push();
        break;
      case 'set':
        if (SETTABLE.has(m.key)) await set(m.key, m.value);
        break;
      case 'setKey': {
        const info = PROVIDER_KEYS.find((k) => k.id === m.id);
        if (!info) break;
        const value = await vscode.window.showInputBox({ title: `${info.name} API key`, prompt: `Free key from ${info.url}. Stored in your system keyring; the terminal agent can use it too.`, password: true, ignoreFocusOut: true });
        if (value === undefined) break;
        const both = await vscode.window.showQuickPick(['Editor and terminal agent (musabai-agent)', 'Editor only'], { title: 'Where should this key work?' });
        await this.services.setKey(info.id, value, both !== 'Editor only');
        void vscode.window.showInformationMessage(value ? t('Key saved.') : t('Key removed.'));
        break;
      }
      case 'removeKey':
        await this.services.setKey(m.id, undefined, true);
        void vscode.window.showInformationMessage(t('Key removed.'));
        break;
      case 'openUrl':
        if (/^https:\/\//.test(m.url)) void vscode.env.openExternal(vscode.Uri.parse(m.url));
        break;
      case 'openFile':
        if (this.services.root) await vscode.window.showTextDocument(vscode.Uri.file(path.join(this.services.root, m.path)));
        break;
      case 'newRule':
        await vscode.commands.executeCommand('musabai.rules.new');
        break;
      case 'openMcpConfig': {
        const file = m.scope === 'project' && this.services.root ? path.join(this.services.root, '.cursor', 'mcp.json') : path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'musabai', 'mcp.json');
        await mkdir(path.dirname(file), { recursive: true });
        try {
          await writeFile(file, '{\n  "mcpServers": {\n  }\n}\n', { flag: 'wx' });
        } catch {
          // exists
        }
        await vscode.window.showTextDocument(vscode.Uri.file(file));
        break;
      }
      case 'mcpRestart':
        await this.services.mcp?.restart(m.name);
        await this.push();
        break;
      case 'mcpStart': {
        await this.services.mcp?.reload();
        const servers = this.services.mcp?.status() ?? [];
        if (!servers.length) {
          void vscode.window.showInformationMessage('MusabAI: no MCP servers are configured yet. Add one in mcp.json (Edit global or project mcp.json), then start them.');
          break;
        }
        await this.services.mcp?.startAll();
        await this.push();
        const ready = (this.services.mcp?.status() ?? []).filter((s) => s.state === 'ready');
        void vscode.window.showInformationMessage(`MusabAI: ${ready.length} of ${servers.length} MCP server${servers.length === 1 ? '' : 's'} running.`);
        break;
      }
      case 'mcpToggle': {
        const disabled = new Set(get<string[]>('mcp.disabledServers', []));
        if (m.enabled) disabled.delete(m.name);
        else disabled.add(m.name);
        await set('mcp.disabledServers', [...disabled]);
        if (m.enabled) await this.services.mcp?.startAll();
        break;
      }
      case 'rebuildIndex':
        void this.services.index?.build().then(() => this.push());
        await this.push();
        break;
      case 'runInTerminal': {
        const terminal = vscode.window.createTerminal({ name: 'MusabAI setup' });
        terminal.show();
        terminal.sendText(String(m.command), false);
        break;
      }
      case 'command':
        if (COMMANDS.has(m.id)) await vscode.commands.executeCommand(m.id, ...(m.args ?? []));
        break;
    }
  }

  dispose(): void {
    this.panel?.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}

export async function newRule(root: string | undefined): Promise<void> {
  if (!root) return void vscode.window.showWarningMessage(t('Open a folder first.'));
  const name = await vscode.window.showInputBox({ title: 'New project rule', prompt: 'A short name, e.g. "react-components" or "api-style"' });
  if (!name?.trim()) return;
  const file = path.join(root, '.cursor', 'rules', `${slug(name, 50)}.mdc`);
  await mkdir(path.dirname(file), { recursive: true });
  try {
    await writeFile(file, RULE_TEMPLATE, { flag: 'wx' });
  } catch {
    // keep the existing rule
  }
  await vscode.window.showTextDocument(vscode.Uri.file(file));
}
