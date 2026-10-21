import type { ToolSpec } from '../types';
import { deleteFile, editFile, multiEdit, writeFileTool } from './edit';
import { codebaseSearch, fileSearch, grepSearch, listDir, readFile } from './files';
import { browserTool } from './browser';
import { fetchRules, gitTool, githubTool, laptopTool, readLints, todoWrite, webFetchTool, webSearchTool } from './misc';
import { runTerminalCmd, terminalOutput } from './terminal';
import { type McpToolRef, type ModeDefinition, type Tool, ToolError } from './types';

export const BUILTIN_TOOLS: Tool[] = [
  codebaseSearch,
  grepSearch,
  fileSearch,
  listDir,
  readFile,
  editFile,
  multiEdit,
  writeFileTool,
  deleteFile,
  runTerminalCmd,
  terminalOutput,
  readLints,
  todoWrite,
  fetchRules,
  webSearchTool,
  webFetchTool,
  gitTool,
  githubTool,
  laptopTool,
  browserTool,
];

export const AGENT_INSTRUCTIONS =
  'You are in Agent mode: you can read and change files, run terminal commands, drive a browser to test web pages, and use git, GitHub, MCP tools and the laptop. ' +
  'Keep working until the request is completely done and verified, then end your turn with a short summary of what changed. ' +
  'Stop early only for a decision that only the user can make.';

export const PLAN_INSTRUCTIONS =
  'You are in Plan mode: do not change files or run commands. Investigate the codebase with the read-only tools, ask the user ' +
  'clarifying questions when something important is ambiguous, then write a concrete plan: the goal, the files to change and how, ' +
  'new files, risks, and how to verify (tests/commands). Record the steps with todo_write. The user can then press Build to run ' +
  'the plan in Agent mode.';

export const ASK_INSTRUCTIONS =
  'You are in Ask mode: answer questions and explain code. Do not change files or run commands; use only the read-only tools. ' +
  'Point to code as `path:line`. If the user wants changes, show them as code blocks and suggest switching to Agent mode.';

export const MANUAL_INSTRUCTIONS =
  'You are in Manual mode: make exactly the edits the user asks for in the files they point to. Do not search the codebase ' +
  'widely or run commands; read the files you edit, edit them, then stop.';

export const BUILTIN_MODES: ModeDefinition[] = [
  { id: 'agent', label: 'Agent', tools: ['*'], instructions: AGENT_INSTRUCTIONS },
  { id: 'plan', label: 'Plan', tools: ['#readonly'], instructions: PLAN_INSTRUCTIONS },
  { id: 'ask', label: 'Ask', tools: ['#readonly'], instructions: ASK_INSTRUCTIONS },
  {
    id: 'manual',
    label: 'Manual',
    tools: ['read_file', 'list_dir', 'edit_file', 'multi_edit', 'write_file', 'read_lints', 'todo_write'],
    instructions: MANUAL_INSTRUCTIONS,
  },
];

export interface CustomModeConfig {
  id?: string;
  name?: string;
  tools?: string[];
  instructions?: string;
}

export function customModes(raw: CustomModeConfig[] | undefined): ModeDefinition[] {
  return (raw || [])
    .filter((m) => m && (m.name || m.id))
    .map((m) => ({
      id: String(m.id || m.name).toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
      label: String(m.name || m.id),
      tools: Array.isArray(m.tools) && m.tools.length ? m.tools.map(String) : ['#readonly'],
      instructions: String(m.instructions || ''),
    }));
}

export function sanitizeToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}

export function mcpTool(ref: McpToolRef): Tool {
  const name = sanitizeToolName(`mcp_${ref.server}_${ref.name}`);
  const schema = ref.inputSchema && typeof ref.inputSchema === 'object' ? { ...ref.inputSchema } : {};
  if (schema.type !== 'object') schema.type = 'object';
  if (!schema.properties) schema.properties = {};
  const readOnly = ref.readOnlyHint === true;
  return {
    name,
    category: 'mcp',
    readOnly,
    description: `[MCP server "${ref.server}"] ${(ref.description || ref.name).slice(0, 1000)}`,
    parameters: schema,
    title: () => `${ref.server}: ${ref.name}`,
    async execute(args, ctx) {
      if (!ctx.mcp) throw new ToolError('MCP is not available.');
      if (ctx.policy.mode !== 'auto' && !readOnly) {
        const answer = await ctx.approve({ kind: 'mcp', server: ref.server, tool: ref.name, args: JSON.stringify(args).slice(0, 600) }, `mcp:${ref.server}:${ref.name}`);
        if (answer === 'deny') return { ok: false, content: `The user declined ${ref.server}/${ref.name}.`, summary: `Skipped ${ref.name}` };
      }
      const result = await ctx.mcp.call(ref.server, ref.name, args, ctx.signal);
      return {
        ok: !result.isError,
        content: result.text || (result.images.length ? '(image result)' : '(no output)'),
        summary: `${result.isError ? 'Failed' : 'Ran'} ${ref.server}/${ref.name}`,
        detail: result.text.slice(0, 60_000),
        images: ctx.visionModel ? result.images : undefined,
      };
    },
  };
}

export function toolsForMode(mode: ModeDefinition, mcp: McpToolRef[] = [], disabled: string[] = []): Tool[] {
  const all = [...BUILTIN_TOOLS, ...mcp.map(mcpTool)];
  const off = new Set(disabled);
  const picked = new Map<string, Tool>();
  for (const entry of mode.tools) {
    if (entry === '*') all.forEach((t) => picked.set(t.name, t));
    else if (entry === '#readonly') all.filter((t) => t.readOnly).forEach((t) => picked.set(t.name, t));
    else if (entry === '#mcp') all.filter((t) => t.category === 'mcp').forEach((t) => picked.set(t.name, t));
    else if (entry.startsWith('#')) all.filter((t) => t.category === entry.slice(1)).forEach((t) => picked.set(t.name, t));
    else {
      const tool = all.find((t) => t.name === entry);
      if (tool) picked.set(tool.name, tool);
    }
  }
  return [...picked.values()].filter((t) => !off.has(t.name) && !(t.category === 'laptop' && off.has('#laptop')) && !(t.category === 'browser' && off.has('#browser')));
}

export function toolSpecs(tools: Tool[]): ToolSpec[] {
  return tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
}
