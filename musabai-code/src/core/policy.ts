export type RunMode = 'ask' | 'allowlist' | 'auto';

export interface CommandPolicy {
  mode: RunMode;
  allow: string[];
  deny: string[];
  /**
   * Working alone: nothing waits for the user. Whatever would ask (a risky command, a change outside the project,
   * publishing…) is skipped at once and listed for the user, never allowed on their behalf.
   */
  unattended?: boolean;
}

export interface Verdict {
  decision: 'allow' | 'ask';
  reason: string;
  dangerous: boolean;
}

/** Commands that read state only; allowed without asking in allowlist mode (unless they redirect into a file). */
const READ_ONLY = [
  /^(ls|ll|la|pwd|cat|head|tail|less|wc|file|stat|du|df|free|uptime|uname|whoami|id|date|printenv|which|type|whereis|echo|printf|true|tree|realpath|dirname|basename|sort|uniq|cut|tr|diff|cmp|md5sum|sha256sum|lsb_release|nproc|lscpu|lsblk|lspci|lsusb|ps|pgrep|jq|column|nl|seq)(\s|$)/,
  // env and hostnamectl only when they show something: "env cmd" runs cmd, "hostnamectl set-hostname" changes the system.
  /^env\s*$/,
  /^hostnamectl(\s+status)?\s*$/,
  /^(grep|egrep|fgrep|rg|ag|fd|fdfind)\s/,
  /^find\s(?!.*\s-(delete|exec|execdir|ok|okdir|fprint|fprint0|fprintf|fls)\b)/,
  /^git\s+(--no-pager\s+)?(status|diff|log|show|rev-parse|ls-files|blame|describe|stash\s+list|config\s+--get|shortlog)(\s|$)/,
  // Listing branches, tags and remotes, not creating, deleting or renaming them.
  /^git\s+(--no-pager\s+)?branch(\s+(-a|-r|-v|-vv|--all|--remotes|--verbose|--list|--show-current|--no-color|--color))*\s*$/,
  /^git\s+(--no-pager\s+)?tag(\s+(-l|--list)(\s+\S+)?)?\s*$/,
  /^git\s+(--no-pager\s+)?remote(\s+(-v|--verbose|show(\s+\S+)?|get-url\s+\S+))?\s*$/,
  /^git\s+(--no-pager\s+)?reflog(\s+show)?(\s+-\S+)*\s*$/,
  /^(node|python3?|npm|pnpm|yarn|go|cargo|rustc|java|javac|gcc|g\+\+|clang|make|cmake|deno|bun|pip3?|gh|docker)\s+(--version|-v|-V|version)\s*$/,
  /^npm\s+(ls|list|view|outdated|config\s+get)(\s|$)/,
  /^gh\s+(pr|issue|run|repo|workflow)\s+(list|view|status|diff|checks)(\s|$)/,
  /^gh\s+auth\s+status(\s|$)/,
];

/** Read-only commands whose options make them write a file. */
const WRITES_WITH_OPTIONS = [
  /^sort\b.*\s(-[a-zA-Z]*o|--output)(\s|=|$)/,
  /^tree\b.*\s-o\s/,
  /^git\b.*\s--output(=|\s)/,
  /^uniq(\s+-\S+)*\s+[^-\s]\S*\s+[^-\s]\S*/,
];

/** Always asks, whatever the mode: hard to undo, outside the project, or privileged. */
const DANGEROUS: [RegExp, string][] = [
  [/(^|[\s;&|(])sudo(\s|$)/, 'runs as administrator (sudo)'],
  [/(^|[\s;&|(])su(\s+-|\s+root|\s*$)/, 'switches user'],
  [/\brm\s+(-[a-zA-Z]*[rf][a-zA-Z]*\s+)+(\/|~|\$HOME|\*|\.\.?)(\s|\/?$|\/\*)/, 'deletes a whole directory tree'],
  [/\brm\s+-[a-zA-Z]*r[a-zA-Z]*f|\brm\s+-[a-zA-Z]*f[a-zA-Z]*r/, 'recursive force delete'],
  [/\bmkfs(\.\w+)?\b|\bdd\s+[^|]*\bof=\/dev\/|\bwipefs\b|\bfdisk\b|\bparted\b/, 'writes to a disk device'],
  [/>\s*\/dev\/(sd|nvme|vd|hd)/, 'writes to a disk device'],
  [/\b(shutdown|reboot|poweroff|halt)\b|\bsystemctl\s+(poweroff|reboot|halt|suspend|hibernate)/, 'turns the laptop off or restarts it'],
  [/:\(\)\s*\{\s*:\|:&\s*\};:/, 'fork bomb'],
  [/\bchmod\s+(-R\s+)?[0-7]*777\s+\/(\s|$)|\bchown\s+-R\s+\S+\s+\/(\s|$)/, 'changes permissions of the whole system'],
  [/\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba|z|da)?sh\b/, 'pipes a downloaded script into a shell'],
  [/\bgit\s+push\b[^;&|]*(\s--force\b|\s-f\b|\s--force-with-lease\b|\s\+\S)/, 'force-pushes'],
  [/\bgit\s+reset\s+--hard\b/, 'discards uncommitted work (git reset --hard)'],
  [/\bgit\s+clean\s+-[a-zA-Z]*f/, 'deletes untracked files (git clean)'],
  [/\bgit\s+(checkout|restore)\s+(--\s+)?\.(\s|$)/, 'discards uncommitted changes'],
  [/\bgit\s+branch\s+-D\b/, 'force-deletes a branch'],
  [/\bgit\s+push\b/, 'publishes commits to the remote'],
  [/\b(npm|pnpm|yarn)\s+publish\b|\btwine\s+upload\b|\bcargo\s+publish\b/, 'publishes a package'],
  [/\bgh\s+(repo\s+delete|release\s+delete|pr\s+merge|pr\s+close|issue\s+close)\b/, 'changes GitHub state'],
  [/\bgh\s+(pr|issue)\s+(create|comment|review|edit|reopen)\b|\bgh\s+(release|gist)\s+create\b/, 'publishes on GitHub'],
  [/\bdocker\s+(system\s+prune|volume\s+rm|rm\s+-f)/, 'deletes Docker data'],
  [/\bapt(-get)?\s+(remove|purge|autoremove)\b|\bdpkg\s+(-r|-P|--remove|--purge)\b/, 'removes system packages'],
  [/\bkill(all)?\s+-9\s+(-1|1)\b|\bpkill\s+-9\s+-u\b/, 'kills every process'],
  [/\bcrontab\s+-r\b/, 'deletes the crontab'],
  [/(^|\s)>\s*~\/\.(bashrc|profile|zshrc|ssh\/)/, 'overwrites shell or SSH configuration'],
  [/\.ssh\/(id_|authorized_keys)|gpg\s+--export-secret/, 'touches private keys'],
];

/** Splits a command line into the commands joined by ; && || | & and newlines (quotes and escapes respected). */
export function splitCommand(command: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quote: string | null = null;
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) {
      current += c;
      if (c === quote && (quote === "'" || command[i - 1] !== '\\')) quote = null;
      continue;
    }
    if (c === '\\' && i + 1 < command.length) {
      current += c + command[++i];
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      current += c;
      continue;
    }
    const two = command.slice(i, i + 2);
    if (two === '&&' || two === '||') {
      parts.push(current);
      current = '';
      i++;
      continue;
    }
    // A lone & ends a command that runs in the background; >& and &> are redirections, not separators.
    const background = c === '&' && command[i - 1] !== '>' && command[i + 1] !== '>';
    if (c === ';' || c === '|' || c === '\n' || background) {
      parts.push(current);
      current = '';
      continue;
    }
    current += c;
  }
  parts.push(current);
  return parts.map((p) => p.trim().replace(/^\(+|\)+$/g, '').trim()).filter(Boolean);
}

/**
 * What a command line does besides running its commands, outside single quotes: command or process substitution
 * ($(…), `…`, <(…)) runs another command, and a redirection writes a file (> and >>, but not 2>&1 or > /dev/null).
 */
export function shellEffects(command: string): { substitution: boolean; writes: boolean } {
  let quote: string | null = null;
  let substitution = false;
  let writes = false;
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote === "'") {
      if (c === "'") quote = null;
      continue;
    }
    if (c === '\\') {
      i++;
      continue;
    }
    if (c === '`' || (c === '$' && command[i + 1] === '(')) substitution = true;
    if (quote === '"') {
      if (c === '"') quote = null;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      continue;
    }
    if ((c === '<' || c === '>') && command[i + 1] === '(') substitution = true;
    else if (c === '<' && command[i + 1] === '>') writes = true;
    else if (c === '>') {
      let j = i + 1;
      if (command[j] === '>' || command[j] === '|') j++;
      const rest = command.slice(j);
      if (!/^&(\d+|-)/.test(rest) && !/^\s*\/dev\/null(\s|$)/.test(rest)) writes = true;
      i = j - 1;
    }
  }
  return { substitution, writes };
}

const ENV_PREFIX = /^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S*)\s+)+/;

function stripEnvPrefix(segment: string): string {
  return segment.replace(ENV_PREFIX, '').replace(/^(?:cd\s+\S+\s*&&\s*)/, '');
}

/** Variables that make any program load other code (LD_PRELOAD=…, NODE_OPTIONS=--require …): no prefix covers those. */
const CODE_INJECTING_ENV = /^(LD_\w+|DYLD_\w+|NODE_OPTIONS|NODE_PATH|PYTHONPATH|PYTHONSTARTUP|PYTHONHOME|BASH_ENV|ENV|PATH|GIT_SSH|GIT_SSH_COMMAND|GIT_EXEC_PATH|GIT_CONFIG\w*|PERL5OPT|PERL5LIB|RUBYOPT|RUBYLIB|JAVA_TOOL_OPTIONS|_JAVA_OPTIONS)$/;

function injectsCode(segment: string): boolean {
  const prefix = ENV_PREFIX.exec(segment)?.[0] ?? '';
  return [...prefix.matchAll(/([A-Za-z_][A-Za-z0-9_]*)=/g)].some((m) => CODE_INJECTING_ENV.test(m[1]));
}

function matchesPrefix(segment: string, prefixes: string[]): boolean {
  return prefixes.some((p) => {
    const prefix = p.trim();
    return prefix && (segment === prefix || segment.startsWith(`${prefix} `) || (prefix.endsWith('*') && segment.startsWith(prefix.slice(0, -1))));
  });
}

export function evaluateCommand(command: string, policy: CommandPolicy): Verdict {
  const text = command.trim();
  for (const [re, reason] of DANGEROUS) {
    if (re.test(text)) return { decision: 'ask', reason, dangerous: true };
  }
  const raw = splitCommand(text);
  const segments = raw.map(stripEnvPrefix);
  if (segments.some((s) => matchesPrefix(s, policy.deny))) return { decision: 'ask', reason: 'matches your deny list', dangerous: false };
  if (policy.mode === 'auto') return { decision: 'allow', reason: 'auto-run is on', dangerous: false };
  if (policy.mode === 'allowlist') {
    const effects = shellEffects(text);
    // A substituted command or a redirection into a file is not what the read-only or allow-listed command does.
    if (effects.substitution) return { decision: 'ask', reason: 'runs a substituted command ($(…) or `…`)', dangerous: false };
    if (effects.writes) return { decision: 'ask', reason: 'writes a file with a redirection', dangerous: false };
    if (raw.some(injectsCode)) return { decision: 'ask', reason: 'sets a variable that loads other code (LD_PRELOAD, NODE_OPTIONS…)', dangerous: false };
    const ok = segments.every(
      (s) => s === 'cd' || /^cd\s/.test(s) || (READ_ONLY.some((re) => re.test(s)) && !WRITES_WITH_OPTIONS.some((re) => re.test(s))) || matchesPrefix(s, policy.allow),
    );
    if (ok) return { decision: 'allow', reason: 'read-only or allow-listed', dangerous: false };
  }
  return { decision: 'ask', reason: 'needs your approval', dangerous: false };
}

/** Programs where the first word (or two) would be far broader than what the user saw: they delete, overwrite or run any code. */
const EXACT_ONLY = new Set([
  'rm', 'rmdir', 'mv', 'cp', 'dd', 'ln', 'chmod', 'chown', 'chgrp', 'truncate', 'shred', 'tee', 'sed', 'awk', 'gawk', 'perl', 'ruby', 'php', 'lua',
  'node', 'nodejs', 'deno', 'bun', 'python', 'python3', 'bash', 'sh', 'zsh', 'dash', 'fish', 'ksh', 'eval', 'exec', 'source', '.', 'xargs', 'env',
  'nohup', 'timeout', 'nice', 'time', 'watch', 'curl', 'wget', 'ssh', 'scp', 'rsync', 'kill', 'pkill', 'killall', 'find', 'systemctl', 'crontab',
]);
const TAKES_SUBCOMMAND = new Set(['npm', 'pnpm', 'yarn', 'npx', 'git', 'gh', 'cargo', 'go', 'pip', 'pip3', 'docker', 'make', 'uv', 'poetry', 'dotnet', 'mvn', 'gradle', './gradlew']);

/** What "Always allow" covers for one command: the program (and subcommand), or for risky programs this exact command. */
function alwaysScope(segment: string): { prefix: string; exact: boolean } {
  const words = segment.split(/\s+/);
  if (EXACT_ONLY.has(words[0])) return { prefix: segment, exact: true };
  if (TAKES_SUBCOMMAND.has(words[0]) && words[1]) {
    // "git -C dir push" has no subcommand in second place: only the exact command is safe to remember.
    return words[1].startsWith('-') ? { prefix: segment, exact: true } : { prefix: `${words[0]} ${words[1]}`, exact: false };
  }
  return { prefix: words[0], exact: false };
}

/** The prefix a user approves with "Always allow": the command and its subcommand, or the exact command for risky programs. */
export function allowPrefix(command: string): string {
  return alwaysScope(stripEnvPrefix(splitCommand(command)[0] || command.trim())).prefix;
}

/**
 * The key "Always allow" remembers for a command line: `cmd:<prefix>` (saved to the allow list, like Cursor) or
 * `cmd=<command>` (this exact command only, kept per project). Undefined when one answer cannot cover the whole line:
 * commands with different prefixes, a substituted command, or (for a prefix) a redirection into a file.
 */
export function alwaysAllowKey(command: string): string | undefined {
  const effects = shellEffects(command);
  if (effects.substitution) return undefined;
  const raw = splitCommand(command.trim());
  if (raw.some(injectsCode)) return undefined;
  const segments = raw.map(stripEnvPrefix).filter((s) => s !== 'cd' && !/^cd\s/.test(s));
  if (!segments.length) return undefined;
  const scopes = segments.map(alwaysScope);
  if (new Set(scopes.map((s) => s.prefix)).size !== 1) return undefined;
  const { prefix, exact } = scopes[0];
  if (exact || effects.writes) return effects.writes || scopes.length > 1 ? `cmd=${command.trim()}` : `cmd=${prefix}`;
  return `cmd:${prefix}`;
}
