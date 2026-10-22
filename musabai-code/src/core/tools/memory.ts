import { MEMORY_FILE, composeMemory } from '../memory';
import { resolvePath } from '../util';
import { type Tool, ToolError, str } from './types';

export const updateMemory: Tool = {
  name: 'update_memory',
  category: 'meta',
  readOnly: false,
  description:
    'Save a durable note about this project so you remember it in later chats and sessions: build and test commands, conventions, ' +
    'architecture decisions, gotchas, and the user\'s stated preferences. These notes are shown to you automatically at the start of ' +
    'every chat (in the <memory> block). Use action "add" (default) to append one note, or "replace" to rewrite the whole memory. ' +
    'Keep notes short and factual, one fact each. Never store secrets, tokens, or passwords. The notes live in ' +
    `${MEMORY_FILE} in the project.`,
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
    const abs = resolvePath(ctx.root, MEMORY_FILE);
    const existing = replace ? '' : (await ctx.host.readText(abs).catch(() => undefined)) ?? '';
    const body = composeMemory(existing, text, replace);
    // Written straight through the host: memory is the agent's own notes, not a user-reviewed code change,
    // and it lives inside the project so it needs no approval.
    await ctx.host.writeText(abs, `${body}\n`);
    const count = body.split('\n').filter(Boolean).length;
    return {
      ok: true,
      content: `Saved. Project memory now holds ${count} note${count === 1 ? '' : 's'} in ${MEMORY_FILE}; you will see it at the start of every chat.`,
      summary: replace ? 'Rewrote project memory' : 'Remembered a note',
    };
  },
};
