import type { SudoPassword } from './sudo';

export type RunMode = 'ask' | 'allowlist' | 'auto';

export interface CommandPolicy {
  mode: RunMode;
  allow: string[];
  deny: string[];
  /**
   * The user's explicit, session-only switch: every command runs without asking, sudo and risky ones included.
   * Off unless the user turns it on by hand; the deny list still asks.
   */
  skipPermissions?: boolean;
  /** Called for each command that ran without asking only because skipPermissions is on, so the user can see it. */
  audit?: (command: string, reason: string) => void;
  /** With skipPermissions, supplies the sudo password the user typed once this session. */
  sudo?: SudoPassword;
}

export interface Verdict {
  decision: 'allow' | 'ask';
  reason: string;
  dangerous: boolean;
  /** Allowed only because skipPermissions is on. */
  skipped?: boolean;
}

/** Commands that read state only; allowed without asking in allowlist mode. */
const READ_ONLY = [
  /^(ls|ll|la|pwd|cat|head|tail|less|wc|file|stat|du|df|free|uptime|uname|whoami|id|date|env|printenv|which|type|whereis|echo|printf|true|tree|realpath|dirname|basename|sort|uniq|cut|tr|diff|cmp|md5sum|sha256sum|lsb_release|hostnamectl|nproc|lscpu|lsblk|lspci|lsusb|ps|pgrep|jq|column|nl|seq)(\s|$)/,
  /^(grep|egrep|fgrep|rg|ag|fd|fdfind)\s/,
  /^find\s(?!.*\s-(delete|exec|execdir|ok|okdir|fprint)\b)/,
  /^git\s+(--no-pager\s+)?(status|diff|log|show|branch|remote(\s+-v)?|rev-parse|ls-files|blame|describe|tag(\s+-l)?|stash\s+list|config\s+--get|shortlog|reflog)(\s|$)/,
  /^(node|python3?|npm|pnpm|yarn|go|cargo|rustc|java|javac|gcc|g\+\+|clang|make|cmake|deno|bun|pip3?|gh|docker)\s+(--version|-v|-V|version)\s*$/,
  /^npm\s+(ls|list|view|outdated|config\s+get)(\s|$)/,
  /^gh\s+(pr|issue|run|repo|workflow)\s+(list|view|status|diff|checks)(\s|$)/,
  /^gh\s+auth\s+status(\s|$)/,
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
  [/\bdocker\s+(system\s+prune|volume\s+rm|rm\s+-f)/, 'deletes Docker data'],
  [/\bapt(-get)?\s+(remove|purge|autoremove)\b|\bdpkg\s+(-r|-P|--remove|--purge)\b/, 'removes system packages'],
  [/\bkill(all)?\s+-9\s+(-1|1)\b|\bpkill\s+-9\s+-u\b/, 'kills every process'],
  [/\bcrontab\s+-r\b/, 'deletes the crontab'],
  [/(^|\s)>\s*~\/\.(bashrc|profile|zshrc|ssh\/)/, 'overwrites shell or SSH configuration'],
  [/\.ssh\/(id_|authorized_keys)|gpg\s+--export-secret/, 'touches private keys'],
];

/** Splits a command line into the commands joined by ; && || | and newlines (quotes respected). */
export function splitCommand(command: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quote: string | null = null;
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) {
      current += c;
      if (c === quote && command[i - 1] !== '\\') quote = null;
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
    if (c === ';' || c === '|' || c === '\n') {
      parts.push(current);
      current = '';
      continue;
    }
    current += c;
  }
  parts.push(current);
  return parts.map((p) => p.trim().replace(/^\(+|\)+$/g, '').trim()).filter(Boolean);
}

function stripEnvPrefix(segment: string): string {
  return segment.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S*)\s+)+/, '').replace(/^(?:cd\s+\S+\s*&&\s*)/, '');
}

function matchesPrefix(segment: string, prefixes: string[]): boolean {
  return prefixes.some((p) => {
    const prefix = p.trim();
    return prefix && (segment === prefix || segment.startsWith(`${prefix} `) || (prefix.endsWith('*') && segment.startsWith(prefix.slice(0, -1))));
  });
}

export function evaluateCommand(command: string, policy: CommandPolicy): Verdict {
  const text = command.trim();
  const segments = splitCommand(text).map(stripEnvPrefix);
  const danger = DANGEROUS.find(([re]) => re.test(text));
  if (policy.skipPermissions) {
    if (segments.some((s) => matchesPrefix(s, policy.deny))) return { decision: 'ask', reason: 'matches your deny list', dangerous: false };
    return { decision: 'allow', reason: danger ? `skip-permissions is on: ${danger[1]}` : 'skip-permissions is on', dangerous: Boolean(danger), skipped: true };
  }
  if (danger) return { decision: 'ask', reason: danger[1], dangerous: true };
  if (segments.some((s) => matchesPrefix(s, policy.deny))) return { decision: 'ask', reason: 'matches your deny list', dangerous: false };
  if (policy.mode === 'auto') return { decision: 'allow', reason: 'auto-run is on', dangerous: false };
  if (policy.mode === 'allowlist') {
    const ok = segments.every((s) => s === 'cd' || /^cd\s/.test(s) || READ_ONLY.some((re) => re.test(s)) || matchesPrefix(s, policy.allow));
    if (ok) return { decision: 'allow', reason: 'read-only or allow-listed', dangerous: false };
  }
  return { decision: 'ask', reason: 'needs your approval', dangerous: false };
}

/** The prefix a user approves with "Always allow": the command and its subcommand. */
export function allowPrefix(command: string): string {
  const first = stripEnvPrefix(splitCommand(command)[0] || command.trim());
  const words = first.split(/\s+/);
  const takesSub = ['npm', 'pnpm', 'yarn', 'npx', 'git', 'gh', 'cargo', 'go', 'python', 'python3', 'pip', 'pip3', 'docker', 'make', 'bun', 'deno', 'uv', 'poetry', 'dotnet', 'mvn', 'gradle', './gradlew'];
  if (takesSub.includes(words[0]) && words[1] && !words[1].startsWith('-')) return `${words[0]} ${words[1]}`;
  return words[0];
}
