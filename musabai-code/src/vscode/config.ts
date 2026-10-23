import * as vscode from 'vscode';
import { type CustomModelConfig, customSpec } from '../core/providers/catalog';
import type { CommandPolicy, RunMode } from '../core/policy';
import type { SudoPassword } from '../core/sudo';
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

/** The command policy as the user configured it. */
export function configuredPolicy(): CommandPolicy {
  const mode = get<RunMode>('agent.runMode', 'allowlist');
  return {
    mode: ['ask', 'allowlist', 'auto'].includes(mode) ? mode : 'allowlist',
    allow: get<string[]>('agent.allowList', []),
    deny: get<string[]>('agent.denyList', []),
  };
}

let skipPermissions = false;
let skipAudit: ((command: string, reason: string) => void) | undefined;
let skipSudo: SudoPassword | undefined;
const skipChanged = new vscode.EventEmitter<boolean>();
export const onDidChangeSkipPermissions = skipChanged.event;

/** Whether the user turned on "skip permissions" for this window. It lives in memory only: every restart starts with it off. */
export function skipPermissionsOn(): boolean {
  return skipPermissions;
}

/** Turning it off also forgets the sudo password. */
export function setSkipPermissions(on: boolean, audit?: (command: string, reason: string) => void, sudo?: SudoPassword): void {
  skipPermissions = on;
  skipAudit = on ? audit : undefined;
  skipSudo?.forget();
  skipSudo = on ? sudo : undefined;
  skipChanged.fire(on);
}

/**
 * The policy the chat agent runs with: in Restricted Mode (an untrusted folder) every command waits for the user.
 * Skip-permissions applies here only, never to background agents (they use configuredPolicy) or untrusted folders.
 */
export function policy(): CommandPolicy {
  const configured = configuredPolicy();
  if (!vscode.workspace.isTrusted) return { ...configured, mode: 'ask' };
  return skipPermissions ? { ...configured, skipPermissions: true, audit: skipAudit, sudo: skipSudo } : configured;
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
  if (!get('browser.enabled', true)) list.push('#browser');
  return list;
}
