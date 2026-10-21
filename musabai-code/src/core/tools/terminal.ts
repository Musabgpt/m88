import { stripAnsi } from '../host';
import { allowPrefix, evaluateCommand } from '../policy';
import { resolvePath, truncateMiddle } from '../util';
import { type Tool, ToolError, bool, num, str } from './types';

const MODEL_OUTPUT_CHARS = 12_000;
const UI_OUTPUT_CHARS = 60_000;

export const runTerminalCmd: Tool = {
  name: 'run_terminal_cmd',
  category: 'terminal',
  readOnly: false,
  description:
    "Run a shell command (bash) on the user's Linux laptop, in the project folder unless cwd is given. Use non-interactive flags " +
    '(-y, --yes, --no-pager); commands get no keyboard input. For servers, watchers and anything that keeps running, set ' +
    'background=true and read its output later with terminal_output. The user may be asked to approve the command.',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The command line to run.' },
      explanation: { type: 'string', description: 'One short sentence telling the user why this command runs.' },
      cwd: { type: 'string', description: 'Working directory, relative to the workspace root. Default: the root.' },
      background: { type: 'boolean', description: 'Keep it running in the background (servers, watchers). Default false.' },
      timeout_seconds: { type: 'integer', description: 'Stop the command after this many seconds. Default 300, maximum 1800.' },
    },
    required: ['command'],
  },
  title: (a) => `Running ${a.command}`,
  async execute(args, ctx) {
    const command = str(args, 'command').trim();
    if (!command) throw new ToolError('command is empty.');
    const cwd = resolvePath(ctx.root, str(args, 'cwd', false) || '.');
    const background = bool(args, 'background');
    const verdict = evaluateCommand(command, ctx.policy);
    if (verdict.decision === 'ask') {
      const answer = await ctx.approve(
        { kind: 'command', command, cwd, reason: str(args, 'explanation', false) || verdict.reason, background },
        verdict.dangerous ? undefined : `cmd:${allowPrefix(command)}`,
      );
      if (answer === 'deny') {
        return {
          ok: false,
          content: `The user declined to run: ${command}\nDo not retry it unchanged. Ask the user how to proceed or take another approach.`,
          summary: `Skipped ${command}`,
          meta: { command, skipped: true },
        };
      }
    }
    const timeoutMs = num(args, 'timeout_seconds', 300, 5, 1800) * 1000;
    const result = await ctx.host.exec(command, {
      cwd,
      background,
      timeoutMs,
      signal: ctx.signal,
      label: str(args, 'explanation', false) || undefined,
      onOutput: (chunk) => ctx.emit({ type: 'tool_output', callId: ctx.callId, chunk }),
    });
    const clean = stripAnsi(result.output).replace(/\n{3,}/g, '\n\n');
    const seconds = (result.durationMs / 1000).toFixed(1);
    if (result.backgroundId) {
      const state = result.exitCode === null ? 'is running' : `exited with code ${result.exitCode}`;
      return {
        ok: result.exitCode === null || result.exitCode === 0,
        content: `Started in the background as ${result.backgroundId}; it ${state}.\nFirst output:\n${truncateMiddle(clean, 4000) || '(none yet)'}\nRead more with terminal_output id=${result.backgroundId}.`,
        summary: `Started ${command} in the background`,
        detail: truncateMiddle(clean, UI_OUTPUT_CHARS),
        meta: { command, backgroundId: result.backgroundId, exitCode: result.exitCode },
      };
    }
    let status: string;
    if (result.killed) status = 'stopped by the user';
    else if (result.timedOut) status = `timed out after ${Math.round(timeoutMs / 1000)} s and was stopped (use background=true for long-running programs)`;
    else status = `exit code ${result.exitCode}`;
    return {
      ok: result.exitCode === 0,
      content: `$ ${command}\n${truncateMiddle(clean, MODEL_OUTPUT_CHARS) || '(no output)'}\n[${status}, ${seconds} s]`,
      summary: result.timedOut ? `Ran ${command} (timed out)` : result.killed ? `Ran ${command} (stopped)` : `Ran ${command}`,
      detail: truncateMiddle(clean, UI_OUTPUT_CHARS),
      meta: { command, exitCode: result.exitCode, timedOut: result.timedOut, durationMs: result.durationMs },
    };
  },
};

export const terminalOutput: Tool = {
  name: 'terminal_output',
  category: 'terminal',
  readOnly: false,
  description: 'Read the latest output of a background command started with run_terminal_cmd (background=true), or stop it with kill=true. Without id, lists them.',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Background process id, e.g. p_lx2k9a.' },
      kill: { type: 'boolean', description: 'Stop the process. Default false.' },
      tail_lines: { type: 'integer', description: 'How many of the last lines to return. Default 80.' },
    },
  },
  title: (a) => (a.kill ? `Stopping ${a.id}` : `Reading output of ${a.id || 'background commands'}`),
  async execute(args, ctx) {
    const id = str(args, 'id', false);
    if (!id) {
      const list = ctx.host.processes();
      return {
        ok: true,
        content: list.length
          ? list.map((p) => `${p.id}: ${p.command} — ${p.exitCode === undefined || p.exitCode === null ? 'running' : `exited ${p.exitCode}`}`).join('\n')
          : 'No background commands.',
        summary: `Listed ${list.length} background command${list.length === 1 ? '' : 's'}`,
      };
    }
    const proc = ctx.host.processOutput(id);
    if (!proc) throw new ToolError(`No background command with id ${id}. Call terminal_output without id to list them.`);
    if (bool(args, 'kill')) {
      await ctx.host.killProcess(id);
      return { ok: true, content: `Stopped ${id} (${proc.command}).`, summary: `Stopped ${proc.command}` };
    }
    const tail = num(args, 'tail_lines', 80, 1, 400);
    const lines = stripAnsi(proc.output).split('\n');
    const text = lines.slice(-tail).join('\n');
    const state = proc.exitCode === undefined || proc.exitCode === null ? 'running' : `exited with code ${proc.exitCode}`;
    return {
      ok: true,
      content: `${proc.command} — ${state}\n${truncateMiddle(text, MODEL_OUTPUT_CHARS) || '(no output yet)'}`,
      summary: `Read output of ${proc.command}`,
      detail: truncateMiddle(text, UI_OUTPUT_CHARS),
    };
  },
};
