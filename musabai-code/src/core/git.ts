import { runProcess } from './host';

export async function git(root: string, args: string[], timeoutMs = 30_000, env?: Record<string, string>) {
  const out = await runProcess('git', ['-c', 'core.quotepath=off', '-c', 'color.ui=false', ...args], root, timeoutMs, env);
  return { code: out.code, stdout: out.stdout, stderr: out.stderr };
}

/**
 * Git options that answer GitHub's credential prompt with a token: the token itself stays in the environment
 * ($MUSABAI_GH_TOKEN) and never appears in the command line, the process list or the remote URL.
 */
export const GITHUB_TOKEN_HELPER = ['-c', 'credential.helper=', '-c', 'credential.helper=!f() { echo username=x-access-token; echo "password=$MUSABAI_GH_TOKEN"; }; f'];

/** git push with a GitHub token (or the user's own credential setup when there is none). */
export async function pushWithToken(root: string, token: string | undefined, args: string[], timeoutMs = 300_000) {
  return git(root, [...(token ? GITHUB_TOKEN_HELPER : []), 'push', ...args], timeoutMs, { GIT_TERMINAL_PROMPT: '0', ...(token ? { MUSABAI_GH_TOKEN: token } : {}) });
}

export interface GitInfo {
  isRepo: boolean;
  branch?: string;
  remoteUrl?: string;
  dirty?: boolean;
  head?: string;
}

export async function gitInfo(root: string): Promise<GitInfo> {
  const inside = await git(root, ['rev-parse', '--is-inside-work-tree'], 5000);
  if (inside.code !== 0 || inside.stdout.trim() !== 'true') return { isRepo: false };
  const [branch, remote, status, head] = await Promise.all([
    git(root, ['branch', '--show-current'], 5000),
    git(root, ['remote', 'get-url', 'origin'], 5000),
    git(root, ['status', '--porcelain'], 10_000),
    git(root, ['rev-parse', '--short', 'HEAD'], 5000),
  ]);
  return {
    isRepo: true,
    branch: branch.stdout.trim() || undefined,
    remoteUrl: remote.code === 0 ? remote.stdout.trim() : undefined,
    dirty: status.stdout.trim().length > 0,
    head: head.code === 0 ? head.stdout.trim() : undefined,
  };
}

/** The staged diff, or every uncommitted change (untracked files included) when nothing is staged. */
export async function commitDiff(root: string): Promise<{ diff: string; staged: boolean; files: string[] }> {
  const staged = await git(root, ['diff', '--cached', '--stat=200', '--patch', '--no-ext-diff']);
  if (staged.stdout.trim()) {
    const files = (await git(root, ['diff', '--cached', '--name-only'])).stdout.split('\n').filter(Boolean);
    return { diff: staged.stdout, staged: true, files };
  }
  const tracked = await git(root, ['diff', '--stat=200', '--patch', '--no-ext-diff']);
  const untracked = (await git(root, ['ls-files', '--others', '--exclude-standard'])).stdout.split('\n').filter(Boolean);
  let extra = '';
  for (const file of untracked.slice(0, 20)) {
    const d = await git(root, ['diff', '--no-index', '--no-ext-diff', '--', '/dev/null', file]);
    extra += d.stdout;
  }
  const files = [...(await git(root, ['diff', '--name-only'])).stdout.split('\n').filter(Boolean), ...untracked];
  return { diff: tracked.stdout + extra, staged: false, files };
}

export async function defaultBranch(root: string): Promise<string> {
  const head = await git(root, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], 5000);
  if (head.code === 0 && head.stdout.trim()) return head.stdout.trim().replace(/^origin\//, '');
  for (const name of ['main', 'master', 'develop']) {
    const r = await git(root, ['rev-parse', '--verify', '--quiet', `origin/${name}`], 5000);
    if (r.code === 0) return name;
    const local = await git(root, ['rev-parse', '--verify', '--quiet', name], 5000);
    if (local.code === 0) return name;
  }
  return 'main';
}

/** Commits and changes of the current branch since it left `base` (for PR descriptions and reviews). */
export async function branchChanges(root: string, base?: string): Promise<{ base: string; log: string; diff: string; stat: string }> {
  const target = base || (await defaultBranch(root));
  let ref = `origin/${target}`;
  if ((await git(root, ['rev-parse', '--verify', '--quiet', ref], 5000)).code !== 0) ref = target;
  const mergeBase = (await git(root, ['merge-base', ref, 'HEAD'], 10_000)).stdout.trim() || ref;
  const [log, diff, stat] = await Promise.all([
    git(root, ['log', '--no-merges', '--format=%h %s%n%b', `${mergeBase}..HEAD`]),
    git(root, ['diff', '--no-ext-diff', mergeBase]),
    git(root, ['diff', '--stat=200', mergeBase]),
  ]);
  return { base: target, log: log.stdout.trim(), diff: diff.stdout, stat: stat.stdout.trim() };
}
