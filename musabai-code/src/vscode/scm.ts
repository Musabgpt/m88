import * as vscode from 'vscode';
import { commitMessage } from '../core/oneshot';
import { chatModel } from './config';
import { t } from './l10n';
import type { Services } from './services';

interface GitRepository {
  rootUri: vscode.Uri;
  inputBox: { value: string };
}

interface GitApi {
  repositories: GitRepository[];
}

export function gitApi(): GitApi | undefined {
  const ext = vscode.extensions.getExtension<{ getAPI(version: 1): GitApi }>('vscode.git');
  if (!ext?.isActive) return undefined;
  try {
    return ext.exports.getAPI(1);
  } catch {
    return undefined;
  }
}

/** The sparkle button of the Source Control view: a commit message for the staged (or all) changes. */
export async function generateCommitMessage(services: Services, arg?: { rootUri?: vscode.Uri } | vscode.Uri): Promise<void> {
  const api = gitApi();
  const wanted = arg instanceof vscode.Uri ? arg : arg?.rootUri;
  const repo = api?.repositories.find((r) => !wanted || r.rootUri.fsPath === wanted.fsPath) ?? api?.repositories[0];
  const root = repo?.rootUri.fsPath ?? services.root;
  if (!root) {
    void vscode.window.showWarningMessage(t('Open a folder first.'));
    return;
  }
  await vscode.window.withProgress({ location: vscode.ProgressLocation.SourceControl, title: t('Writing the commit message…') }, async () => {
    try {
      const { message } = await commitMessage(services.pool, chatModel(), root);
      if (repo) repo.inputBox.value = message;
      else {
        await vscode.env.clipboard.writeText(message);
        void vscode.window.showInformationMessage(`MusabAI: ${message.split('\n')[0]} (copied)`);
      }
    } catch (error) {
      const text = (error as Error).message;
      void vscode.window.showWarningMessage(`MusabAI: ${/no changes/i.test(text) ? t('No changes to commit.') : text}`);
    }
  });
}
