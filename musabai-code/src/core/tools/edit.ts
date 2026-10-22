import { stats, unifiedDiff } from '../diff';
import { EditError, applyEdit, applyEdits, checkPlaceholders } from '../edit';
import { isInside, relPath, resolvePath } from '../util';
import { type Tool, type ToolContext, type ToolResult, ToolError, bool, str } from './types';

async function guardOutside(ctx: ToolContext, abs: string): Promise<void> {
  if (isInside(ctx.root, abs)) return;
  const answer = await ctx.approve({ kind: 'write_outside', path: abs }, `write:${abs}`);
  if (answer === 'deny') throw new ToolError(`The user did not allow changing ${abs} (outside the project).`);
}

/** Writes through the host and records the change for checkpoints and review. */
export async function commitWrite(ctx: ToolContext, abs: string, before: string | undefined, after: string | null): Promise<ToolResult['meta']> {
  ctx.checkpoints?.record(ctx.turnId, abs, before ?? null);
  ctx.changes?.record(abs, before ?? null);
  if (after === null) await ctx.host.deletePath(abs);
  else await ctx.host.writeText(abs, after);
  ctx.changes?.touched();
  ctx.touched.add(abs);
  const s = stats(before ?? '', after ?? '');
  const rel = relPath(ctx.root, abs);
  ctx.emit({ type: 'file_changed', path: abs, rel, ...s, created: before === undefined, deleted: after === null });
  return { path: abs, rel, ...s, created: before === undefined, deleted: after === null };
}

function preview(rel: string, before: string, after: string): string {
  const diff = unifiedDiff(rel, before, after, 2);
  const lines = diff.split('\n');
  return lines.length > 60 ? `${lines.slice(0, 60).join('\n')}\n… (${lines.length - 60} more diff lines)` : diff;
}

export const editFile: Tool = {
  name: 'edit_file',
  category: 'edit',
  readOnly: false,
  description:
    'Replace exact text in a file. old_string must match the current file exactly (copy it from read_file output WITHOUT the line-number ' +
    'prefix) and be unique: include 2-4 surrounding lines. Keep edits small and focused. Set replace_all to change every occurrence. ' +
    'Never put placeholders like "... existing code ..." in new_string.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File to edit, relative to the workspace root.' },
      old_string: { type: 'string', description: 'Exact current text to replace.' },
      new_string: { type: 'string', description: 'Text to put in its place.' },
      replace_all: { type: 'boolean', description: 'Replace every occurrence. Default false.' },
    },
    required: ['path', 'old_string', 'new_string'],
  },
  title: (a) => `Editing ${a.path}`,
  async execute(args, ctx) {
    const abs = resolvePath(ctx.root, str(args, 'path'));
    const rel = relPath(ctx.root, abs);
    await guardOutside(ctx, abs);
    const before = await ctx.host.readText(abs);
    if (before === undefined) throw new ToolError(`${rel} does not exist. Use write_file to create it.`);
    let result;
    try {
      result = applyEdit(before, String(args.old_string ?? ''), String(args.new_string ?? ''), bool(args, 'replace_all'));
    } catch (error) {
      if (error instanceof EditError) throw new ToolError(`${rel}: ${error.message}`);
      throw error;
    }
    const meta = await commitWrite(ctx, abs, before, result.content);
    const note = result.fuzzy ? ` (matched ignoring ${result.fuzzy === 'unescaped' ? 'escaping' : result.fuzzy})` : '';
    const diff = preview(rel, before, result.content);
    return {
      ok: true,
      content: `Edited ${rel}: ${result.replacements} replacement${result.replacements === 1 ? '' : 's'} at line ${result.line}${note}.\n${diff}`,
      summary: `Edited ${rel} (+${meta!.added} −${meta!.removed})`,
      detail: diff,
      meta: { ...meta, line: result.line },
    };
  },
};

export const multiEdit: Tool = {
  name: 'multi_edit',
  category: 'edit',
  readOnly: false,
  description:
    'Make several exact replacements in ONE file in a single step; they apply in order and all-or-nothing. Same rules as edit_file for each edit.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File to edit.' },
      edits: {
        type: 'array',
        description: 'Replacements, applied in order.',
        items: {
          type: 'object',
          properties: {
            old_string: { type: 'string' },
            new_string: { type: 'string' },
            replace_all: { type: 'boolean' },
          },
          required: ['old_string', 'new_string'],
        },
      },
    },
    required: ['path', 'edits'],
  },
  title: (a) => `Editing ${a.path}`,
  async execute(args, ctx) {
    const abs = resolvePath(ctx.root, str(args, 'path'));
    const rel = relPath(ctx.root, abs);
    await guardOutside(ctx, abs);
    if (!Array.isArray(args.edits)) throw new ToolError('edits must be an array of {old_string, new_string}.');
    const before = await ctx.host.readText(abs);
    if (before === undefined) throw new ToolError(`${rel} does not exist. Use write_file to create it.`);
    let result;
    try {
      result = applyEdits(before, args.edits as { old_string: string; new_string: string; replace_all?: boolean }[]);
    } catch (error) {
      if (error instanceof EditError) throw new ToolError(`${rel}: ${error.message}`);
      throw error;
    }
    const meta = await commitWrite(ctx, abs, before, result.content);
    const diff = preview(rel, before, result.content);
    return {
      ok: true,
      content: `Edited ${rel}: ${result.replacements} replacements.\n${diff}`,
      summary: `Edited ${rel} (+${meta!.added} −${meta!.removed})`,
      detail: diff,
      meta: { ...meta, line: result.line },
    };
  },
};

export const writeFileTool: Tool = {
  name: 'write_file',
  category: 'edit',
  readOnly: false,
  description:
    'Create a new file, or replace a whole file, with the complete content. For changes to an existing file prefer edit_file. ' +
    'Parent directories are created as needed.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path, relative to the workspace root.' },
      content: { type: 'string', description: 'The complete file content.' },
    },
    required: ['path', 'content'],
  },
  title: (a) => `Writing ${a.path}`,
  async execute(args, ctx) {
    const abs = resolvePath(ctx.root, str(args, 'path'));
    const rel = relPath(ctx.root, abs);
    await guardOutside(ctx, abs);
    const content = typeof args.content === 'string' ? args.content : args.content === undefined ? '' : JSON.stringify(args.content, null, 2);
    const info = await ctx.host.stat(abs);
    if (info?.type === 'dir') throw new ToolError(`${rel} is a directory.`);
    const before = info ? await ctx.host.readText(abs) : undefined;
    try {
      checkPlaceholders(content, before ?? '');
    } catch (error) {
      throw new ToolError(`${rel}: ${(error as Error).message}`);
    }
    if (before === content) return { ok: true, content: `${rel} already has this content.`, summary: `${rel} unchanged` };
    const meta = await commitWrite(ctx, abs, before, content);
    const lines = content.split('\n').length;
    return {
      ok: true,
      content: `${before === undefined ? 'Created' : 'Rewrote'} ${rel} (${lines} lines).`,
      summary: `${before === undefined ? 'Created' : 'Rewrote'} ${rel} (+${meta!.added} −${meta!.removed})`,
      meta,
    };
  },
};

export const deleteFile: Tool = {
  name: 'delete_file',
  category: 'edit',
  readOnly: false,
  description: 'Delete a file of the project. It can be restored from the review bar or a checkpoint.',
  parameters: {
    type: 'object',
    properties: { path: { type: 'string', description: 'File to delete.' } },
    required: ['path'],
  },
  title: (a) => `Deleting ${a.path}`,
  async execute(args, ctx) {
    const abs = resolvePath(ctx.root, str(args, 'path'));
    const rel = relPath(ctx.root, abs);
    const info = await ctx.host.stat(abs);
    if (!info) return { ok: true, content: `${rel} does not exist.`, summary: `${rel} already gone` };
    if (info.type !== 'file') throw new ToolError(`${rel} is not a file; only files can be deleted with this tool.`);
    if (!isInside(ctx.root, abs)) {
      const answer = await ctx.approve({ kind: 'delete', path: abs }, `delete:${abs}`);
      if (answer === 'deny') throw new ToolError(`The user did not allow deleting ${abs}.`);
    }
    const before = await ctx.host.readText(abs).catch(() => undefined);
    if (before === undefined) throw new ToolError(`${rel} is binary; delete it with run_terminal_cmd if really needed.`);
    const meta = await commitWrite(ctx, abs, before, null);
    return { ok: true, content: `Deleted ${rel}.`, summary: `Deleted ${rel}`, meta };
  },
};
