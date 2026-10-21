import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as vscode from 'vscode';
import { t } from './l10n';
import type { Services } from './services';

export interface ImportSource {
  name: string;
  userDir: string;
  extensionsFile: string;
}

export function importSources(home = os.homedir()): ImportSource[] {
  const config = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
  return [
    { name: 'VS Code', userDir: path.join(config, 'Code', 'User'), extensionsFile: path.join(home, '.vscode', 'extensions', 'extensions.json') },
    { name: 'Cursor', userDir: path.join(config, 'Cursor', 'User'), extensionsFile: path.join(home, '.cursor', 'extensions', 'extensions.json') },
    { name: 'VSCodium', userDir: path.join(config, 'VSCodium', 'User'), extensionsFile: path.join(home, '.vscode-oss', 'extensions', 'extensions.json') },
    { name: 'VS Code Insiders', userDir: path.join(config, 'Code - Insiders', 'User'), extensionsFile: path.join(home, '.vscode-insiders', 'extensions', 'extensions.json') },
    { name: 'Windsurf', userDir: path.join(config, 'Windsurf', 'User'), extensionsFile: path.join(home, '.windsurf', 'extensions', 'extensions.json') },
  ];
}

/** JSON with comments and trailing commas, as VS Code writes settings.json. */
export function parseJsonc<T = unknown>(text: string): T | undefined {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === '\\') out += text[++i] ?? '';
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
      out += c;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++;
    } else out += c;
  }
  try {
    return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1')) as T;
  } catch {
    return undefined;
  }
}

/** Marketplace extensions that are not on Open VSX, and the open alternative installed instead. */
export const EXTENSION_ALTERNATIVES: Record<string, string | null> = {
  'ms-python.vscode-pylance': 'detachhead.basedpyright',
  'ms-vscode-remote.remote-ssh': 'jeanp413.open-remote-ssh',
  'ms-vscode-remote.remote-ssh-edit': null,
  'ms-vscode.remote-explorer': null,
  'ms-vscode.cpptools': 'llvm-vs-code-extensions.vscode-clangd',
  'ms-vscode.cpptools-extension-pack': 'llvm-vs-code-extensions.vscode-clangd',
  'ms-dotnettools.csharp': 'muhammad-sammy.csharp',
  'ms-dotnettools.csdevkit': 'muhammad-sammy.csharp',
  'ms-vscode-remote.remote-containers': null,
  'ms-vscode-remote.remote-wsl': null,
  'ms-vsliveshare.vsliveshare': null,
  'github.copilot': null,
  'github.copilot-chat': null,
  'visualstudioexptteam.vscodeintellicode': null,
};

export function mapExtensions(ids: string[]): { install: string[]; skipped: string[] } {
  const install = new Set<string>();
  const skipped: string[] = [];
  for (const raw of ids) {
    const id = raw.toLowerCase();
    if (id.startsWith('anysphere.') || id.startsWith('cursor.') || id.startsWith('codeium.') || id === 'musabai.musabai-code') {
      skipped.push(raw);
      continue;
    }
    if (id in EXTENSION_ALTERNATIVES) {
      const alt = EXTENSION_ALTERNATIVES[id];
      if (alt) install.add(alt);
      else skipped.push(raw);
      continue;
    }
    install.add(raw);
  }
  return { install: [...install], skipped };
}

async function readJson<T>(file: string): Promise<T | undefined> {
  try {
    return parseJsonc<T>(await readFile(file, 'utf8'));
  } catch {
    return undefined;
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await readFile(file);
    return true;
  } catch {
    return false;
  }
}

export class Importer {
  constructor(private readonly services: Services, private readonly context: vscode.ExtensionContext) {}

  /** The User folder of this editor's current profile. */
  private userDir(): string {
    return path.resolve(this.context.globalStorageUri.fsPath, '..', '..');
  }

  async run(preferred?: string): Promise<void> {
    const sources = [];
    for (const s of importSources()) if ((await exists(path.join(s.userDir, 'settings.json'))) || (await exists(s.extensionsFile))) sources.push(s);
    if (!sources.length) return void vscode.window.showInformationMessage('MusabAI: no VS Code, Cursor or VSCodium settings were found on this laptop.');
    const source =
      sources.find((s) => s.name.toLowerCase() === preferred?.toLowerCase()) ??
      (sources.length === 1 ? sources[0] : (await vscode.window.showQuickPick(sources.map((s) => ({ label: s.name, detail: s.userDir, s })), { title: 'Import from' }))?.s);
    if (!source) return;
    const what = await vscode.window.showQuickPick(
      [
        { label: 'Settings', picked: true, id: 'settings' },
        { label: 'Keybindings', picked: true, id: 'keybindings' },
        { label: 'Snippets', picked: true, id: 'snippets' },
        { label: 'Extensions (from Open VSX)', picked: true, id: 'extensions' },
      ],
      { canPickMany: true, title: `Import from ${source.name}` },
    );
    if (!what?.length) return;
    const ids = new Set(what.map((w) => w.id));
    const report: string[] = [];
    const target = this.userDir();
    await mkdir(target, { recursive: true });

    if (ids.has('settings')) {
      const theirs = await readJson<Record<string, unknown>>(path.join(source.userDir, 'settings.json'));
      if (theirs) {
        const file = path.join(target, 'settings.json');
        const mine = (await readJson<Record<string, unknown>>(file)) ?? {};
        if (await exists(file)) await copyFile(file, `${file}.before-import-${Date.now()}`);
        const merged = { ...mine };
        let count = 0;
        for (const [key, value] of Object.entries(theirs)) {
          if (key.startsWith('cursor.') || key.startsWith('github.copilot') || key === 'chat.disableAIFeatures' || key === 'update.mode') continue;
          merged[key] = value;
          count++;
        }
        await writeFile(file, `${JSON.stringify(merged, null, 4)}\n`);
        report.push(`${count} settings`);
      }
    }
    if (ids.has('keybindings')) {
      const theirs = await readJson<Record<string, unknown>[]>(path.join(source.userDir, 'keybindings.json'));
      if (Array.isArray(theirs) && theirs.length) {
        const file = path.join(target, 'keybindings.json');
        const mine = (await readJson<Record<string, unknown>[]>(file)) ?? [];
        const seen = new Set(mine.map((k) => `${k.key}|${k.command}|${k.when ?? ''}`));
        const added = theirs.filter((k) => !String(k.command ?? '').startsWith('aipopup') && !String(k.command ?? '').startsWith('cursor') && !seen.has(`${k.key}|${k.command}|${k.when ?? ''}`));
        await writeFile(file, `${JSON.stringify([...mine, ...added], null, 4)}\n`);
        report.push(`${added.length} keybindings`);
      }
    }
    if (ids.has('snippets')) {
      const from = path.join(source.userDir, 'snippets');
      const to = path.join(target, 'snippets');
      let count = 0;
      for (const name of await readdir(from).catch(() => [] as string[])) {
        await mkdir(to, { recursive: true });
        if (!(await exists(path.join(to, name)))) {
          await copyFile(path.join(from, name), path.join(to, name));
          count++;
        }
      }
      if (count) report.push(`${count} snippet files`);
    }
    if (ids.has('extensions')) {
      const list = (await readJson<{ identifier?: { id?: string } }[]>(source.extensionsFile)) ?? [];
      const have = new Set(vscode.extensions.all.map((e) => e.id.toLowerCase()));
      const { install, skipped } = mapExtensions(list.map((e) => e.identifier?.id ?? '').filter(Boolean));
      const todo = install.filter((id) => !have.has(id.toLowerCase()));
      const failed: string[] = [];
      await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'MusabAI: installing extensions', cancellable: true }, async (progress, token) => {
        for (const [i, id] of todo.entries()) {
          if (token.isCancellationRequested) break;
          progress.report({ message: `${id} (${i + 1}/${todo.length})`, increment: 100 / Math.max(todo.length, 1) });
          try {
            await vscode.commands.executeCommand('workbench.extensions.installExtension', id);
          } catch {
            failed.push(id);
          }
        }
      });
      report.push(`${todo.length - failed.length} extensions installed`);
      if (failed.length) this.services.log.warn(`Extensions not available on Open VSX: ${failed.join(', ')}`);
      if (skipped.length) this.services.log.info(`Skipped (Microsoft-only or replaced by MusabAI): ${skipped.join(', ')}`);
      if (failed.length) report.push(`${failed.length} not available on Open VSX (see the MusabAI output)`);
    }
    const reload = await vscode.window.showInformationMessage(`${t('Import finished')} (${source.name}): ${report.join(', ') || 'nothing to import'}.`, 'Reload window');
    if (reload) void vscode.commands.executeCommand('workbench.action.reloadWindow');
  }
}
