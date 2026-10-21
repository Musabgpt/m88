import { runProcess } from './host';

export interface RepoRef {
  owner: string;
  repo: string;
}

export function parseRemote(url: string | undefined): RepoRef | undefined {
  if (!url) return undefined;
  const m =
    /^(?:https?:\/\/(?:[^@/]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(url.trim());
  return m ? { owner: m[1], repo: m[2] } : undefined;
}

export async function ghCliToken(cwd: string): Promise<string | undefined> {
  const out = await runProcess('gh', ['auth', 'token'], cwd, 8000).catch(() => undefined);
  const token = out?.code === 0 ? out.stdout.trim() : '';
  return token || undefined;
}

export async function envOrGhToken(cwd: string, env: NodeJS.ProcessEnv = process.env): Promise<string | undefined> {
  return env.GITHUB_TOKEN?.trim() || env.GH_TOKEN?.trim() || (await ghCliToken(cwd));
}

export class GitHubError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'GitHubError';
  }
}

export class GitHubApi {
  constructor(
    private readonly token: () => Promise<string | undefined>,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly baseUrl = 'https://api.github.com',
  ) {}

  async request<T = any>(method: string, path: string, body?: unknown, accept = 'application/vnd.github+json'): Promise<T> {
    const token = await this.token();
    if (!token) throw new GitHubError('Not signed in to GitHub. Sign in from the Accounts menu (or run "gh auth login").', 401);
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Accept: accept,
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'MusabAI-Code',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    if (!res.ok) {
      let message = text;
      try {
        const data = JSON.parse(text);
        message = [data.message, ...(data.errors || []).map((e: any) => e.message || e.code)].filter(Boolean).join(': ');
      } catch {
        // plain text
      }
      throw new GitHubError(`GitHub ${res.status}: ${message.slice(0, 400)}`, res.status);
    }
    if (accept.includes('diff') || accept.includes('text') || !text) return text as T;
    return JSON.parse(text) as T;
  }

  repo(r: RepoRef) {
    return this.request('GET', `/repos/${r.owner}/${r.repo}`);
  }

  listIssues(r: RepoRef, state = 'open', limit = 20) {
    return this.request<any[]>('GET', `/repos/${r.owner}/${r.repo}/issues?state=${state}&per_page=${limit}`);
  }

  issue(r: RepoRef, n: number) {
    return this.request('GET', `/repos/${r.owner}/${r.repo}/issues/${n}`);
  }

  issueComments(r: RepoRef, n: number) {
    return this.request<any[]>('GET', `/repos/${r.owner}/${r.repo}/issues/${n}/comments?per_page=30`);
  }

  listPulls(r: RepoRef, state = 'open', limit = 20) {
    return this.request<any[]>('GET', `/repos/${r.owner}/${r.repo}/pulls?state=${state}&per_page=${limit}`);
  }

  pull(r: RepoRef, n: number) {
    return this.request('GET', `/repos/${r.owner}/${r.repo}/pulls/${n}`);
  }

  pullDiff(r: RepoRef, n: number) {
    return this.request<string>('GET', `/repos/${r.owner}/${r.repo}/pulls/${n}`, undefined, 'application/vnd.github.v3.diff');
  }

  createPull(r: RepoRef, data: { title: string; body: string; head: string; base: string; draft?: boolean }) {
    return this.request('POST', `/repos/${r.owner}/${r.repo}/pulls`, data);
  }

  comment(r: RepoRef, n: number, body: string) {
    return this.request('POST', `/repos/${r.owner}/${r.repo}/issues/${n}/comments`, { body });
  }

  createReview(r: RepoRef, n: number, data: { body: string; event: 'COMMENT' | 'REQUEST_CHANGES' | 'APPROVE'; comments?: { path: string; line: number; side?: 'RIGHT'; body: string }[] }) {
    return this.request('POST', `/repos/${r.owner}/${r.repo}/pulls/${n}/reviews`, data);
  }

  listRuns(r: RepoRef, branch?: string, limit = 10) {
    const q = branch ? `&branch=${encodeURIComponent(branch)}` : '';
    return this.request<{ workflow_runs: any[] }>('GET', `/repos/${r.owner}/${r.repo}/actions/runs?per_page=${limit}${q}`);
  }

  runJobs(r: RepoRef, runId: number) {
    return this.request<{ jobs: any[] }>('GET', `/repos/${r.owner}/${r.repo}/actions/runs/${runId}/jobs?per_page=50`);
  }

  jobLog(r: RepoRef, jobId: number) {
    return this.request<string>('GET', `/repos/${r.owner}/${r.repo}/actions/jobs/${jobId}/logs`, undefined, 'text/plain');
  }
}
