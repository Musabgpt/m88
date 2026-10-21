import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { sanitizeToolName } from '../tools';
import type { McpLike, McpToolRef } from '../tools/types';
import { McpClient, type McpServerConfig } from './client';

function interpolate(value: string, root: string): string {
  return value
    .replace(/\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g, (_m, name: string) => process.env[name] ?? '')
    .replace(/\$\{workspaceFolder\}/g, root)
    .replace(/\$\{userHome\}/g, os.homedir());
}

function strings(value: unknown, root: string): string[] | undefined {
  return Array.isArray(value) ? value.map((v) => interpolate(String(v), root)) : undefined;
}

function record(value: unknown, root: string): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, interpolate(String(v), root)]));
}

/** Parses Cursor's {"mcpServers": {...}} and VS Code's {"servers": {...}} formats. */
export function parseMcpConfig(text: string, root: string, source: 'project' | 'global', configFile: string): McpServerConfig[] {
  let data: any;
  try {
    data = JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
  } catch {
    return [];
  }
  const servers = data?.mcpServers ?? data?.servers ?? {};
  const out: McpServerConfig[] = [];
  for (const [name, raw] of Object.entries<any>(servers)) {
    if (!raw || typeof raw !== 'object') continue;
    const url = typeof raw.url === 'string' ? interpolate(raw.url, root) : undefined;
    const declared = String(raw.type || raw.transport || '').toLowerCase();
    const type: McpServerConfig['type'] = url ? (declared === 'sse' ? 'sse' : 'http') : 'stdio';
    if (type === 'stdio' && typeof raw.command !== 'string') continue;
    out.push({
      name,
      type,
      command: typeof raw.command === 'string' ? interpolate(raw.command, root) : undefined,
      args: strings(raw.args, root),
      env: record(raw.env, root),
      cwd: typeof raw.cwd === 'string' ? interpolate(raw.cwd, root) : undefined,
      url,
      headers: record(raw.headers, root),
      source,
      configFile,
      disabled: raw.disabled === true,
    });
  }
  return out;
}

export function mcpConfigFiles(root: string, home = os.homedir()): { file: string; source: 'project' | 'global' }[] {
  return [
    { file: path.join(home, '.cursor', 'mcp.json'), source: 'global' },
    { file: path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'musabai', 'mcp.json'), source: 'global' },
    { file: path.join(root, '.vscode', 'mcp.json'), source: 'project' },
    { file: path.join(root, '.cursor', 'mcp.json'), source: 'project' },
    { file: path.join(root, '.musabai', 'mcp.json'), source: 'project' },
  ];
}

export async function loadMcpConfigs(root: string, home?: string): Promise<McpServerConfig[]> {
  const byName = new Map<string, McpServerConfig>();
  for (const { file, source } of mcpConfigFiles(root, home)) {
    const text = await readFile(file, 'utf8').catch(() => undefined);
    if (!text) continue;
    for (const server of parseMcpConfig(text, root, source, file)) byName.set(server.name, server);
  }
  return [...byName.values()];
}

export interface McpStatus {
  name: string;
  type: McpServerConfig['type'];
  source: McpServerConfig['source'];
  configFile: string;
  state: McpClient['state'] | 'disabled' | 'not_trusted';
  error: string;
  tools: string[];
}

export interface McpManagerOptions {
  root: string;
  disabled?: () => string[];
  /** Project servers run commands from the repository: they start only after the user trusts them. */
  trustProjectServer?: (config: McpServerConfig) => Promise<boolean>;
  fetchImpl?: typeof fetch;
  log?: (line: string) => void;
  home?: string;
}

export class McpManager implements McpLike {
  private clients = new Map<string, McpClient>();
  private untrusted = new Set<string>();
  private loaded = false;

  constructor(private readonly options: McpManagerOptions) {}

  async reload(): Promise<void> {
    const configs = await loadMcpConfigs(this.options.root, this.options.home);
    const keep = new Set(configs.map((c) => c.name));
    for (const [name, client] of this.clients) {
      const next = configs.find((c) => c.name === name);
      if (!keep.has(name) || JSON.stringify(next) !== JSON.stringify(client.config)) {
        await client.stop();
        this.clients.delete(name);
      }
    }
    for (const config of configs) {
      if (!this.clients.has(config.name)) this.clients.set(config.name, new McpClient(config, { root: this.options.root, fetchImpl: this.options.fetchImpl, log: this.options.log }));
    }
    this.loaded = true;
  }

  private enabled(client: McpClient): boolean {
    return !client.config.disabled && !(this.options.disabled?.() ?? []).includes(client.config.name);
  }

  async startAll(): Promise<void> {
    if (!this.loaded) await this.reload();
    await Promise.all(
      [...this.clients.values()].map(async (client) => {
        if (!this.enabled(client) || client.state === 'ready' || client.state === 'starting') return;
        if (client.config.source === 'project' && client.config.type === 'stdio' && this.options.trustProjectServer) {
          const ok = await this.options.trustProjectServer(client.config);
          if (!ok) {
            this.untrusted.add(client.config.name);
            return;
          }
          this.untrusted.delete(client.config.name);
        }
        await client.start().catch((error: Error) => this.options.log?.(`MCP ${client.config.name} failed to start: ${error.message}`));
      }),
    );
  }

  async restart(name: string): Promise<void> {
    const client = this.clients.get(name);
    if (!client) return;
    await client.stop();
    this.untrusted.delete(name);
    await client.start().catch((error: Error) => this.options.log?.(`MCP ${name} failed to start: ${error.message}`));
  }

  status(): McpStatus[] {
    return [...this.clients.values()].map((c) => ({
      name: c.config.name,
      type: c.config.type,
      source: c.config.source,
      configFile: c.config.configFile,
      state: !this.enabled(c) ? 'disabled' : this.untrusted.has(c.config.name) ? 'not_trusted' : c.state,
      error: c.error,
      tools: c.tools.map((t) => t.name),
    }));
  }

  tools(): McpToolRef[] {
    const out: McpToolRef[] = [];
    for (const client of this.clients.values()) {
      if (client.state !== 'ready' || !this.enabled(client)) continue;
      for (const tool of client.tools) {
        out.push({
          server: client.config.name,
          name: tool.name,
          description: tool.description || tool.annotations?.title || tool.name,
          inputSchema: tool.inputSchema ?? { type: 'object', properties: {} },
          readOnlyHint: tool.annotations?.readOnlyHint === true,
        });
      }
    }
    return out;
  }

  async call(server: string, tool: string, args: Record<string, unknown>, signal?: AbortSignal) {
    const client = this.clients.get(server) ?? [...this.clients.values()].find((c) => sanitizeToolName(c.config.name) === server);
    if (!client) throw new Error(`No MCP server named ${server}`);
    return client.callTool(tool, args, signal);
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.clients.values()].map((c) => c.stop()));
  }
}
