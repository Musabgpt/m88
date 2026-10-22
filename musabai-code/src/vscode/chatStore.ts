import * as vscode from 'vscode';
import type { TodoItem } from '../core/tools/types';
import type { ChatMessage } from '../core/types';
import { newId } from '../core/util';
import type { ChatSummary, UiMessage } from '../webview/shared/protocol';

export interface StoredChat {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: UiMessage[];
  agent?: { history: ChatMessage[]; todos: TodoItem[]; turnStarts: { turnId: string; index: number }[] };
  checkpoints?: { turnId: string; files: [string, string | null][] }[];
}

const INDEX_KEY = 'musabai.chats';
const ACTIVE_KEY = 'musabai.activeChat';

/** Chats persist per workspace as JSON files in the extension's storage folder. */
export class ChatStore {
  private readonly dir: vscode.Uri;

  constructor(storage: vscode.Uri, private readonly memento: vscode.Memento) {
    this.dir = vscode.Uri.joinPath(storage, 'chats');
  }

  list(): ChatSummary[] {
    return [...this.memento.get<ChatSummary[]>(INDEX_KEY, [])].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get activeId(): string | undefined {
    return this.memento.get<string>(ACTIVE_KEY);
  }

  async setActive(id: string): Promise<void> {
    await this.memento.update(ACTIVE_KEY, id);
  }

  create(): StoredChat {
    const now = Date.now();
    return { id: newId('c'), title: 'New chat', createdAt: now, updatedAt: now, messages: [] };
  }

  async load(id: string): Promise<StoredChat | undefined> {
    try {
      const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(this.dir, `${id}.json`));
      return JSON.parse(Buffer.from(bytes).toString('utf8')) as StoredChat;
    } catch {
      return undefined;
    }
  }

  async save(chat: StoredChat): Promise<void> {
    chat.updatedAt = Date.now();
    await vscode.workspace.fs.createDirectory(this.dir);
    await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(this.dir, `${chat.id}.json`), Buffer.from(JSON.stringify(chat)));
    const index = this.list().filter((c) => c.id !== chat.id);
    index.unshift({ id: chat.id, title: chat.title, updatedAt: chat.updatedAt });
    await this.memento.update(INDEX_KEY, index.slice(0, 200));
  }

  async delete(id: string): Promise<void> {
    await this.memento.update(INDEX_KEY, this.list().filter((c) => c.id !== id));
    await vscode.workspace.fs.delete(vscode.Uri.joinPath(this.dir, `${id}.json`)).then(undefined, () => undefined);
  }
}
