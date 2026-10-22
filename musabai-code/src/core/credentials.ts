import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ModelSpec } from './types';

export function configDir(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.XDG_CONFIG_HOME && path.isAbsolute(env.XDG_CONFIG_HOME) ? env.XDG_CONFIG_HOME : path.join(os.homedir(), '.config');
  return path.join(base, 'musabai');
}

export function credentialsPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(configDir(env), 'credentials.json');
}

export async function readCredentials(file = credentialsPath()): Promise<Record<string, string>> {
  try {
    const data = JSON.parse(await readFile(file, 'utf8'));
    const out: Record<string, string> = {};
    if (data && typeof data === 'object') {
      for (const [key, value] of Object.entries(data)) if (typeof value === 'string' && value.trim()) out[key] = value.trim();
    }
    return out;
  } catch {
    return {};
  }
}

/** Keys live in a 0600 file under ~/.config/musabai so the terminal agent and CI share one place. */
export async function writeCredential(id: string, value: string | undefined, file = credentialsPath()): Promise<void> {
  const current = await readCredentials(file);
  if (value && value.trim()) current[id] = value.trim();
  else delete current[id];
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(current, null, 2) + '\n', { mode: 0o600 });
  await chmod(tmp, 0o600);
  await rename(tmp, file);
}

export type SecretGetter = (id: string) => Promise<string | undefined>;

export function keyResolver(options: { env?: NodeJS.ProcessEnv; secrets?: SecretGetter; file?: string } = {}) {
  const env = options.env ?? process.env;
  return async (spec: ModelSpec): Promise<string | undefined> => {
    if (spec.apiKey) return spec.apiKey;
    for (const name of spec.apiKeyEnvs || []) if (env[name]?.trim()) return env[name]!.trim();
    if (spec.secretId) {
      const fromSecrets = options.secrets ? await options.secrets(spec.secretId).catch(() => undefined) : undefined;
      if (fromSecrets?.trim()) return fromSecrets.trim();
      const stored = await readCredentials(options.file ?? credentialsPath(env));
      if (stored[spec.secretId]) return stored[spec.secretId];
    }
    return undefined;
  };
}

/** True when a spec cannot work without a key it does not have. */
export function needsKey(spec: ModelSpec): boolean {
  return Boolean((spec.apiKeyEnvs?.length || spec.secretId) && !spec.apiKey);
}
