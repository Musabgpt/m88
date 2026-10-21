import * as vscode from 'vscode';
import { isNewerVersion } from '../core/util';
import { get } from './config';
import { t } from './l10n';

const RELEASES_API = 'https://api.github.com/repos/Musabgpt/m88/releases/latest';
const RELEASES_PAGE = 'https://github.com/Musabgpt/m88/releases/latest';
const LAST_CHECK_KEY = 'musabai.lastUpdateCheck';
const DAY_MS = 24 * 60 * 60 * 1000;


/**
 * Checks GitHub for a newer release and, if there is one, tells the user and links to it. It never downloads or
 * installs anything on its own — updating is always the user's explicit action (the installer or the .deb).
 */
export async function checkForUpdates(context: vscode.ExtensionContext, interactive: boolean): Promise<void> {
  if (!interactive) {
    if (!get('checkForUpdates', true)) return;
    const last = context.globalState.get<number>(LAST_CHECK_KEY, 0);
    if (Date.now() - last < DAY_MS) return;
    void context.globalState.update(LAST_CHECK_KEY, Date.now());
  }
  const current = String(context.extension.packageJSON.version ?? '0.0.0');
  let latestTag: string | undefined;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'MusabAI-Code' }, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
    const data = (await res.json()) as { tag_name?: string };
    latestTag = data?.tag_name;
  } catch (error) {
    if (interactive) void vscode.window.showWarningMessage(`${t('Could not check for updates')}: ${(error as Error).message}`);
    return;
  }
  if (!latestTag || !isNewerVersion(latestTag, current)) {
    if (interactive) void vscode.window.showInformationMessage(t('MusabAI Code is up to date.'));
    return;
  }
  const how = t('How to update');
  const view = t('View release');
  const choice = await vscode.window.showInformationMessage(`${t('A new version of MusabAI Code is available')}: ${latestTag} (${t('you have')} ${current}).`, how, view);
  if (choice === view) void vscode.env.openExternal(vscode.Uri.parse(RELEASES_PAGE));
  else if (choice === how) void vscode.env.openExternal(vscode.Uri.parse('https://github.com/Musabgpt/m88/tree/main/linux/musabai-code#readme'));
}
