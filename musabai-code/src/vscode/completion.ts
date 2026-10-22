import * as vscode from 'vscode';
import { CHAT_FIM_SYSTEM, chatFimPrompt, cleanCompletion, fimComplete } from '../core/providers/fim';
import { chatModel, get, set } from './config';
import type { Services } from './services';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Tab: ghost-text completions from a free FIM model, or from the free chat model when none is configured. */
export class TabCompletion implements vscode.InlineCompletionItemProvider, vscode.Disposable {
  private readonly cache = new Map<string, string>();
  readonly status: vscode.StatusBarItem;
  private busy = 0;

  constructor(private readonly services: Services) {
    this.status = vscode.window.createStatusBarItem('musabai.tab', vscode.StatusBarAlignment.Right, 99);
    this.status.name = 'MusabAI Tab';
    this.status.command = 'musabai.tab.toggle';
    this.render();
    this.status.show();
  }

  render(): void {
    const on = get('tab.enabled', true);
    this.status.text = this.busy ? '$(loading~spin) Tab' : on ? '$(sparkle) Tab' : '$(circle-slash) Tab';
    this.status.tooltip = on ? 'MusabAI Tab autocomplete is on (click to turn off)' : 'MusabAI Tab autocomplete is off (click to turn on)';
  }

  async toggle(): Promise<void> {
    await set('tab.enabled', !get('tab.enabled', true));
    this.render();
  }

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionItem[] | undefined> {
    if (!get('tab.enabled', true)) return undefined;
    if (!['file', 'untitled', 'vscode-notebook-cell'].includes(document.uri.scheme)) return undefined;
    if (get<string[]>('tab.disabledLanguages', ['plaintext', 'markdown', 'scminput']).includes(document.languageId)) return undefined;
    const line = document.lineAt(position.line).text;
    if (/^[\w$]/.test(line.slice(position.character))) return undefined;
    const offset = document.offsetAt(position);
    const text = document.getText();
    const prefix = text.slice(Math.max(0, offset - 4000), offset);
    const suffix = text.slice(offset, offset + 1500);
    if (!prefix.trim()) return undefined;
    const key = `${document.uri.toString()}\u0000${prefix.slice(-600)}\u0000${suffix.slice(0, 200)}`;
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit ? [new vscode.InlineCompletionItem(hit, new vscode.Range(position, position))] : undefined;

    const fims = await this.services.pool.fimCandidates();
    const explicit = context.triggerKind === vscode.InlineCompletionTriggerKind.Invoke;
    await sleep(explicit ? 0 : get('tab.debounceMs', fims.length ? 250 : 600));
    if (token.isCancellationRequested) return undefined;
    const controller = new AbortController();
    const sub = token.onCancellationRequested(() => controller.abort());
    this.busy++;
    this.render();
    let raw = '';
    try {
      const request = { prefix, suffix, path: vscode.workspace.asRelativePath(document.uri), language: document.languageId, signal: controller.signal, maxTokens: 128 };
      for (const { spec, key: apiKey } of fims) {
        try {
          raw = await fimComplete(spec, apiKey, request);
          break;
        } catch (error) {
          if (controller.signal.aborted) return undefined;
          this.services.pool.health.failure(spec.id, error, spec.baseUrl);
        }
      }
      if (!raw && !fims.length && get('tab.chatFallback', true)) {
        const model = get<string>('tab.model', '') || chatModel();
        const result = await this.services.pool.chat(
          model,
          { messages: [{ role: 'system', content: CHAT_FIM_SYSTEM }, { role: 'user', content: chatFimPrompt(request) }], maxTokens: 160, temperature: 0, signal: controller.signal },
          { recoveryBudgetMs: 0 },
        );
        raw = result.content;
      }
    } catch {
      return undefined;
    } finally {
      sub.dispose();
      this.busy--;
      this.render();
    }
    if (token.isCancellationRequested) return undefined;
    const completion = cleanCompletion(raw, prefix, suffix);
    if (this.cache.size > 80) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, completion);
    if (!completion) return undefined;
    return [new vscode.InlineCompletionItem(completion, new vscode.Range(position, position))];
  }

  dispose(): void {
    this.status.dispose();
  }
}
