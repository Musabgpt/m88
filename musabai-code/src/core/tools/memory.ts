import { MEMORY_FILE, MemoryError, composeMemory } from '../memory';
import { realInside, relPath, resolvePath } from '../util';
import { commitWrite } from './edit';
import { type Tool, ToolError, str } from './types';

// One memory write at a time per file: two chats saving notes together would otherwise lose one of them.
const writing = new Map<string, Promise<unknown>>();

function serialized<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = writing.get(key) ?? Promise.resolve();
  const next = previous.then(task, task);
  const settled = next.catch(() => undefined);
  writing.set(key, settled);
  void settled.then(() => {
    if (writing.get(key) === settled) writing.delete(key);
  });
  return next;
}

export const updateMemory: Tool = {
  name: 'update_memory',
  category: 'meta',
  readOnly: false,
  description:
    'Save a durable note about this project so you remember it in later chats and sessions: build and test commands, conventions, ' +
    'architecture decisions, gotchas, and the user\'s stated preferences. These notes are shown to you automatically at the start of ' +
    'every chat (in the <memory> block). Use action "add" (default) to append one note, or "replace" to rewrite the whole memory. ' +
    'Keep notes short and factual, one fact each. Never store secrets, tokens, or passwords. The notes live in ' +
    `${MEMORY_FILE} in the project; this is where your own notes go (not AGENTS.md, which holds the project's instructions). ` +
    'The user can review and undo every change to them.',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The note to remember, or — with action "replace" — the full new memory.' },
      action: { type: 'string', enum: ['add', 'replace'], description: '"add" (default) appends one note; "replace" overwrites all memory with text.' },
    },
    required: ['text'],
  },
  title: (args) => (args.action === 'replace' ? 'Rewriting project memory' : 'Saving to project memory'),
  async execute(args, ctx) {
    const text = str(args, 'text').trim();
    if (!text) throw new ToolError('Nothing to save: text is empty.');
    const replace = args.action === 'replace';
    const root = ctx.memoryRoot ?? ctx.root;
    const abs = resolvePath(root, MEMORY_FILE);
    return serialized(abs, async () => {
      // Never follow a link out of the project: the note would land in (or be read from) another file of the laptop.
      if (!(await realInside(root, abs))) throw new ToolError(`${MEMORY_FILE} leads outside the project (a symbolic link); it was not changed.`);
      const info = await ctx.host.stat(abs);
      if (info && info.type !== 'file') throw new ToolError(`${MEMORY_FILE} is not a regular file; it was not changed.`);
      const before = info ? await ctx.host.readText(abs).catch(() => undefined) : undefined;
      let composed: { body: string; dropped: number };
      try {
        composed = composeMemory(replace ? '' : before ?? '', text, replace);
      } catch (error) {
        if (error instanceof MemoryError) throw new ToolError(error.message);
        throw error;
      }
      const after = `${composed.body}\n`;
      // Recorded like any agent edit: it shows in the review bar, and Reject or a checkpoint restore undoes it.
      const meta = before === after ? undefined : await commitWrite({ ...ctx, changes: ctx.memoryChanges ?? ctx.changes }, abs, before, after);
      const count = composed.body.split('\n').filter(Boolean).length;
      const dropped = composed.dropped ? ` The ${composed.dropped} oldest note${composed.dropped === 1 ? ' was' : 's were'} dropped to stay under the size limit.` : '';
      return {
        ok: true,
        content: `Saved. Project memory now holds ${count} note${count === 1 ? '' : 's'} in ${MEMORY_FILE}; you will see it at the start of every chat.${dropped}`,
        summary: replace ? 'Rewrote project memory' : 'Remembered a note',
        meta: meta ?? { path: abs, rel: relPath(ctx.root, abs) },
      };
    });
  },
};
