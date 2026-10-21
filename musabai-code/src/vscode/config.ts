import * as vscode from 'vscode';
import { type CustomModelConfig, customSpec } from '../core/providers/catalog';
import type { CommandPolicy, RunMode } from '../core/policy';
import { BUILTIN_MODES, type CustomModeConfig, customModes } from '../core/tools';
import type { ModeDefinition } from '../core/tools/types';
import type { ModelSpec } from '../core/types';

export const SECTION = 'musabai';

function cfg() {
  return vscode.workspace.getConfiguration(SECTION);
}

export function get<T>(key: string, fallback: T): T {
  const value = cfg().get<T>(key);
  return value === undefined || value === null ? fallback : value;
}

export async function set(key: string, value: unknown, target = vscode.ConfigurationTarget.Global): Promise<void> {
  await cfg().update(key, value, target);
}

export function chatModel(): string {
  return get('model', 'kilo-auto/free');
}

export function policy(): CommandPolicy {
  const mode = get<RunMode>('agent.runMode', 'allowlist');
  return {
    mode: ['ask', 'allowlist', 'auto'].includes(mode) ? mode : 'allowlist',
    allow: get<string[]>('agent.allowList', []),
    deny: get<string[]>('agent.denyList', []),
  };
}

export function modes(): ModeDefinition[] {
  return [...BUILTIN_MODES, ...customModes(get<CustomModeConfig[]>('customModes', []))];
}

export function customModels(): ModelSpec[] {
  return get<CustomModelConfig[]>('models.custom', [])
    .map((raw) => customSpec(raw))
    .filter((s): s is ModelSpec => Boolean(s));
}

export function language(): 'ar' | 'en' {
  const setting = get<string>('language', 'auto');
  if (setting === 'ar' || setting === 'en') return setting;
  return vscode.env.language.toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

export function disabledTools(): string[] {
  const list = [...get<string[]>('agent.disabledTools', [])];
  if (!get('laptop.enabled', true)) list.push('#laptop');
  return list;
}
