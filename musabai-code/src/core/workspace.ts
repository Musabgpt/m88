import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { EditorState, PromptContext } from './agent/prompts';
import { gitInfo } from './git';
import { loadRules, nestedDirs, rulesPrompt, selectRules } from './rules';

let osCache: string | undefined;

export async function osDescription(): Promise<string> {
  if (osCache) return osCache;
  let name = `${os.type()} ${os.release()}`;
  try {
    const release = await readFile('/etc/os-release', 'utf8');
    name = /PRETTY_NAME="?([^"\n]+)"?/.exec(release)?.[1] || name;
    const upstream = /UBUNTU_CODENAME=(\w+)/.exec(release)?.[1];
    if (upstream && !/ubuntu/i.test(name)) name += ` (Ubuntu ${upstream} base)`;
  } catch {
    // not Linux
  }
  osCache = `${name}, ${os.arch()}`;
  return osCache;
}

export function shellName(): string {
  return path.basename(process.env.SHELL || '/bin/bash');
}

export function environmentProvider(root: string, surface: PromptContext['surface'], editor?: () => EditorState | undefined, memory?: () => Promise<string | undefined>) {
  let gitCache: { at: number; value: Awaited<ReturnType<typeof gitInfo>> } | undefined;
  return async () => {
    if (!gitCache || Date.now() - gitCache.at > 5000) gitCache = { at: Date.now(), value: await gitInfo(root) };
    return {
      root,
      os: await osDescription(),
      shell: shellName(),
      date: new Date().toISOString().slice(0, 10),
      git: gitCache.value,
      editor: editor?.(),
      surface,
      memory: memory ? await memory() : undefined,
    };
  };
}

export function rulesProvider(root: string, userRules: () => string[]) {
  return async (referencedFiles: string[], mentioned: string[]) => {
    const rels = referencedFiles.map((f) => (path.isAbsolute(f) ? path.relative(root, f) : f)).filter((f) => !f.startsWith('..'));
    const rules = await loadRules(root, userRules(), nestedDirs(root, rels));
    return { rules, text: rulesPrompt(selectRules(rules, rels, mentioned)) };
  };
}
