import path from 'node:path';
import * as vscode from 'vscode';
import { branchChanges, commitDiff, git, gitInfo, pushWithToken } from '../core/git';
import { type RepoRef, parseRemote } from '../core/github';
import { type ReviewResult, commitMessage, pullRequestText, reviewDiff, reviewMarkdown } from '../core/oneshot';
import { slug } from '../core/util';
import type { ChatController } from './chatController';
import { chatModel } from './config';
import { t } from './l10n';
import { gitApi } from './scm';
import type { Services } from './services';

interface GitRepoApi {
  rootUri: vscode.Uri;
  push(remote?: string, branch?: string, setUpstream?: boolean): Promise<void>;
}

export class GitHubCommands implements vscode.Disposable {
  readonly diagnostics = vscode.languages.createDiagnosticCollection('MusabAI Bugbot');

  constructor(private readonly services: Services, private readonly chat: ChatController) {}

  private async repo(): Promise<{ root: string; ref: RepoRef; branch?: string; dirty?: boolean } | undefined> {
    const root = this.services.root;
    if (!root) {
      void vscode.window.showWarningMessage(t('Open a folder first.'));
      return undefined;
    }
    const info = await gitInfo(root);
    const ref = parseRemote(info.remoteUrl);
    if (!info.isRepo || !ref) {
      void vscode.window.showWarningMessage('MusabAI: this folder has no GitHub "origin" remote.');
      return undefined;
    }
    return { root, ref, branch: info.branch, dirty: info.dirty };
  }

  async signIn(): Promise<void> {
    const token = await this.services.githubToken(true);
    if (token) {
      const me = await this.services.github().request('GET', '/user').catch(() => undefined);
      void vscode.window.showInformationMessage(`${t('Signed in to GitHub.')}${me?.login ? ` (${me.login})` : ''}`);
    }
  }

  private async push(root: string, branch: string): Promise<void> {
    const repo = (gitApi()?.repositories as unknown as GitRepoApi[] | undefined)?.find((r) => r.rootUri.fsPath === root);
    if (repo) {
      await repo.push('origin', branch, true);
      return;
    }
    const token = await this.services.githubToken(true);
    const out = await pushWithToken(root, token, ['-u', 'origin', 'HEAD']);
    if (out.code !== 0) throw new Error(`git push failed: ${(out.stderr || out.stdout).trim().split('\n').slice(-3).join(' ')}`);
  }

  async createPullRequest(): Promise<void> {
    const r = await this.repo();
    if (!r) return;
    const api = this.services.github(true);
    let branch = r.branch;
    const meta = await api.repo(r.ref).catch((e: Error) => {
      void vscode.window.showErrorMessage(`MusabAI: ${e.message}`);
      return undefined;
    });
    if (!meta) return;
    const base: string = meta.default_branch;
    if (!branch || branch === base) {
      const last = (await git(r.root, ['log', '-1', '--format=%s'])).stdout.trim();
      const name = await vscode.window.showInputBox({ title: 'MusabAI — new branch for the pull request', value: `musabai/${slug(last || 'changes')}`, prompt: `You are on ${base}; the pull request needs its own branch.` });
      if (!name) return;
      const made = await git(r.root, ['checkout', '-b', name]);
      if (made.code !== 0) return void vscode.window.showErrorMessage(made.stderr.trim());
      branch = name;
    }
    if (r.dirty) {
      const choice = await vscode.window.showInformationMessage('Commit the uncommitted changes into the pull request?', 'Commit all', 'Leave them out');
      if (!choice) return;
      if (choice === 'Commit all') {
        const { message } = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: t('Writing the commit message…') }, () => commitMessage(this.services.pool, chatModel(), r.root));
        const edited = await vscode.window.showInputBox({ title: 'Commit message', value: message.split('\n')[0] });
        if (!edited) return;
        await git(r.root, ['add', '-A']);
        const body = message.split('\n').slice(1).join('\n').trim();
        const commit = await git(r.root, ['commit', '-m', edited, ...(body ? ['-m', body] : [])]);
        if (commit.code !== 0) return void vscode.window.showErrorMessage(commit.stderr.trim() || commit.stdout.trim());
      }
    }
    try {
      const text = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'MusabAI is pushing the branch and writing the pull request…' }, async () => {
        await this.push(r.root, branch!);
        return pullRequestText(this.services.pool, chatModel(), r.root, base);
      });
      const title = await vscode.window.showInputBox({ title: 'Pull request title', value: text.title });
      if (!title) return;
      const kind = await vscode.window.showQuickPick(['Create pull request', 'Create draft pull request'], { title: `${branch} → ${base}` });
      if (!kind) return;
      const pr = await api.createPull(r.ref, { title, body: text.body, head: branch!, base, draft: kind.includes('draft') });
      const open = await vscode.window.showInformationMessage(`${t('Pull request created')}: #${pr.number} ${pr.title}`, t('Open on GitHub'));
      if (open) void vscode.env.openExternal(vscode.Uri.parse(pr.html_url));
    } catch (error) {
      void vscode.window.showErrorMessage(`MusabAI: ${(error as Error).message}`);
    }
  }

  private showFindings(root: string, result: ReviewResult): void {
    this.diagnostics.clear();
    const byFile = new Map<string, vscode.Diagnostic[]>();
    for (const f of result.findings) {
      const severity = f.severity === 'high' ? vscode.DiagnosticSeverity.Error : f.severity === 'medium' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Information;
      const line = Math.max(0, f.line - 1);
      const d = new vscode.Diagnostic(new vscode.Range(line, 0, line, 1000), `${f.title}: ${f.explanation}${f.suggestion ? `\nSuggestion: ${f.suggestion}` : ''}`, severity);
      d.source = 'MusabAI Bugbot';
      const list = byFile.get(f.file) ?? [];
      list.push(d);
      byFile.set(f.file, list);
    }
    for (const [file, list] of byFile) this.diagnostics.set(vscode.Uri.file(path.join(root, file)), list);
  }

  /** Bugbot: a careful review of a diff with a free model; findings land in Problems, the chat and optionally the PR. */
  async review(): Promise<void> {
    const root = this.services.root;
    if (!root) return void vscode.window.showWarningMessage(t('Open a folder first.'));
    const pick = await vscode.window.showQuickPick(
      [
        { label: '$(git-compare) Changes on this branch', detail: 'compared with the main branch', id: 'branch' },
        { label: '$(git-commit) Uncommitted changes', detail: 'staged, or all when nothing is staged', id: 'working' },
        { label: '$(github) A pull request…', detail: 'review it and post comments on GitHub', id: 'pr' },
      ],
      { title: 'MusabAI Bugbot — what should I review?' },
    );
    if (!pick) return;
    let diff = '';
    let context = '';
    let prNumber = 0;
    let ref: RepoRef | undefined;
    try {
      if (pick.id === 'branch') {
        const c = await branchChanges(root);
        diff = c.diff;
        context = `Commits on this branch since ${c.base}:\n${c.log}`;
      } else if (pick.id === 'working') diff = (await commitDiff(root)).diff;
      else {
        const r = await this.repo();
        if (!r) return;
        ref = r.ref;
        const api = this.services.github(true);
        const pulls = await api.listPulls(r.ref, 'open', 30);
        const chosen = await vscode.window.showQuickPick(pulls.map((p) => ({ label: `#${p.number} ${p.title}`, detail: `${p.head?.ref} → ${p.base?.ref} by ${p.user?.login}`, n: p.number })), { title: 'Pull request to review' });
        if (!chosen) return;
        prNumber = chosen.n;
        diff = await api.pullDiff(r.ref, prNumber);
        const pr = await api.pull(r.ref, prNumber);
        context = `Pull request #${prNumber}: ${pr.title}\n${pr.body || ''}`;
      }
    } catch (error) {
      return void vscode.window.showErrorMessage(`MusabAI: ${(error as Error).message}`);
    }
    if (!diff.trim()) return void vscode.window.showInformationMessage(`MusabAI: ${t('No changes to commit.').replace('commit', 'review')}`);
    const result = await vscode.window
      .withProgress({ location: vscode.ProgressLocation.Notification, title: t('Reviewing the changes…'), cancellable: true }, (_p, token) => {
        const controller = new AbortController();
        token.onCancellationRequested(() => controller.abort());
        return reviewDiff(this.services.pool, chatModel(), diff, context, controller.signal);
      })
      .then(undefined, (error: Error) => {
        void vscode.window.showErrorMessage(`MusabAI: ${error.message}`);
        return undefined;
      });
    if (!result) return;
    if (!prNumber) this.showFindings(root, result);
    const markdown = reviewMarkdown(result);
    await this.chat.addExchange(prNumber ? `Bugbot: PR #${prNumber}` : 'Bugbot review', `Review ${prNumber ? `pull request #${prNumber}` : pick.label.replace(/\$\([^)]+\)\s*/, '').toLowerCase()} for bugs.`, markdown);
    if (prNumber && ref) {
      const post = await vscode.window.showInformationMessage(`Bugbot found ${result.findings.length} issue${result.findings.length === 1 ? '' : 's'} in #${prNumber}.`, 'Post review on GitHub', 'Keep it local');
      if (post === 'Post review on GitHub') {
        try {
          await this.services.github(true).createReview(ref, prNumber, {
            body: markdown,
            event: 'COMMENT',
            comments: result.findings.map((f) => ({ path: f.file, line: f.line, side: 'RIGHT', body: `**${f.title}** (${f.severity})\n\n${f.explanation}${f.suggestion ? `\n\nSuggestion: ${f.suggestion}` : ''}` })),
          });
          void vscode.window.showInformationMessage('MusabAI: review posted.');
        } catch (error) {
          void vscode.window.showErrorMessage(`MusabAI: ${(error as Error).message}`);
        }
      }
    } else if (result.findings.length) {
      const fix = await vscode.window.showInformationMessage(`Bugbot found ${result.findings.length} possible issue${result.findings.length === 1 ? '' : 's'} (see Problems).`, 'Fix with Agent');
      if (fix) await this.chat.sendFromCommand(`Fix these issues found in review, then verify:\n\n${markdown}`, 'agent', false);
    } else {
      void vscode.window.showInformationMessage(`MusabAI Bugbot: ${t('No problems found.')}`);
    }
  }

  async fixIssue(): Promise<void> {
    const r = await this.repo();
    if (!r) return;
    const api = this.services.github(true);
    try {
      const issues = (await api.listIssues(r.ref, 'open', 50)).filter((i) => !i.pull_request);
      const chosen = await vscode.window.showQuickPick(issues.map((i) => ({ label: `#${i.number} ${i.title}`, detail: (i.body || '').slice(0, 120), n: i.number })), { title: 'GitHub issue to fix' });
      if (!chosen) return;
      const issue = await api.issue(r.ref, chosen.n);
      const comments = await api.issueComments(r.ref, chosen.n);
      const thread = comments.map((c) => `${c.user?.login}: ${c.body}`).join('\n\n');
      await this.chat.sendFromCommand(
        `Fix GitHub issue #${issue.number}: ${issue.title}\n\n${issue.body || ''}${thread ? `\n\nDiscussion:\n${thread}` : ''}\n\nFind the cause in the code, fix it, add or update a test when the project has tests, and verify. Do not commit or push.`,
      );
    } catch (error) {
      void vscode.window.showErrorMessage(`MusabAI: ${(error as Error).message}`);
    }
  }

  async fixCI(): Promise<void> {
    const r = await this.repo();
    if (!r) return;
    const api = this.services.github(true);
    try {
      const runs = (await api.listRuns(r.ref, r.branch, 15)).workflow_runs.filter((x) => x.conclusion === 'failure');
      if (!runs.length) return void vscode.window.showInformationMessage(`MusabAI: no failed GitHub Actions runs on ${r.branch}.`);
      const chosen = runs.length === 1 ? { run: runs[0] } : await vscode.window.showQuickPick(runs.map((x) => ({ label: `${x.name} #${x.run_number}`, detail: `${x.head_sha.slice(0, 7)} · ${x.display_title}`, run: x })), { title: 'Failed run to fix' });
      if (!chosen) return;
      const jobs = (await api.runJobs(r.ref, chosen.run.id)).jobs.filter((j) => j.conclusion === 'failure');
      const logs: string[] = [];
      for (const job of jobs.slice(0, 3)) {
        const log = await api.jobLog(r.ref, job.id).catch(() => '');
        const lines = log.replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z /gm, '').split('\n');
        const failedStep = (job.steps || []).find((s: { conclusion: string }) => s.conclusion === 'failure')?.name;
        logs.push(`Job "${job.name}"${failedStep ? `, failed step "${failedStep}"` : ''}:\n${lines.slice(-200).join('\n')}`);
      }
      await this.chat.sendFromCommand(
        `The GitHub Actions run "${chosen.run.name}" failed on branch ${r.branch} (${chosen.run.html_url}).\n\n${logs.map((l) => `\`\`\`\n${l}\n\`\`\``).join('\n\n')}\n\nFind the root cause in the code or the workflow, fix it, and reproduce the failing step locally where possible to verify. Do not push.`,
      );
    } catch (error) {
      void vscode.window.showErrorMessage(`MusabAI: ${(error as Error).message}`);
    }
  }

  dispose(): void {
    this.diagnostics.dispose();
  }
}
