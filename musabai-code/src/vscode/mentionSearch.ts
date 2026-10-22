import path from 'node:path';
import * as vscode from 'vscode';
import type { Mention } from '../core/mentions';
import { loadRules } from '../core/rules';
import type { MentionChip, MentionItem } from '../webview/shared/protocol';
import type { ChatStore } from './chatStore';
import type { Services } from './services';

function chip(mention: Mention, label: string, icon: string): MentionChip {
  return { mention: mention as unknown as MentionChip['mention'], label, icon };
}

/** Subsequence match score: lower is better, -1 when the query does not match. */
export function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (!q) return 0;
  const base = t.slice(t.lastIndexOf('/') + 1);
  if (base === q) return 0;
  if (base.startsWith(q)) return 1 + base.length / 100;
  if (base.includes(q)) return 2 + base.length / 100;
  if (t.includes(q)) return 3 + t.length / 100;
  let i = 0;
  let gaps = 0;
  let last = -1;
  for (let j = 0; j < t.length && i < q.length; j++) {
    if (t[j] === q[i]) {
      if (last >= 0) gaps += j - last - 1;
      last = j;
      i++;
    }
  }
  return i === q.length ? 4 + gaps / 10 + t.length / 1000 : -1;
}

export function problemsText(root?: string): string {
  const lines: string[] = [];
  for (const [uri, diags] of vscode.languages.getDiagnostics()) {
    for (const d of diags) {
      if (d.severity > vscode.DiagnosticSeverity.Warning) continue;
      const file = root ? path.relative(root, uri.fsPath) : uri.fsPath;
      lines.push(`${file}:${d.range.start.line + 1}:${d.range.start.character + 1} ${d.severity === 0 ? 'error' : 'warning'}: ${d.message}${d.source ? ` (${d.source})` : ''}`);
      if (lines.length >= 200) return lines.join('\n');
    }
  }
  return lines.join('\n');
}

export async function searchMentions(query: string, services: Services, store: ChatStore): Promise<MentionItem[]> {
  const items: MentionItem[] = [];
  const q = query.trim();
  const root = services.root;
  if (root && services.host) {
    const files = await services.host.listFiles({ limit: 100_000 });
    const open = vscode.window.tabGroups.all
      .flatMap((g) => g.tabs)
      .map((tab) => (tab.input instanceof vscode.TabInputText ? tab.input.uri : undefined))
      .filter((u): u is vscode.Uri => Boolean(u && u.scheme === 'file'))
      .map((u) => path.relative(root, u.fsPath))
      .filter((r) => !r.startsWith('..'));
    const ranked = q
      ? files
          .map((f) => ({ f, s: fuzzyScore(q, f) }))
          .filter((x) => x.s >= 0)
          .sort((a, b) => a.s - b.s)
          .slice(0, 12)
          .map((x) => x.f)
      : [...new Set(open)].slice(0, 8);
    for (const f of ranked) items.push({ chip: chip({ type: 'file', path: f }, path.basename(f), 'file'), detail: path.dirname(f) === '.' ? '' : path.dirname(f), group: 'Files' });
    const dirs = [...new Set(files.map((f) => path.dirname(f)).filter((d) => d !== '.'))];
    const folderHits = (q ? dirs.filter((d) => fuzzyScore(q, d) >= 0).sort((a, b) => fuzzyScore(q, a) - fuzzyScore(q, b)) : []).slice(0, 4);
    for (const d of folderHits) items.push({ chip: chip({ type: 'folder', path: d }, `${path.basename(d)}/`, 'folder'), detail: d, group: 'Folders' });
    if (q.length >= 2) {
      const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>('vscode.executeWorkspaceSymbolProvider', q).then((s) => s ?? [], () => []);
      for (const s of symbols.slice(0, 8)) {
        if (s.location.uri.scheme !== 'file') continue;
        const rel = path.relative(root, s.location.uri.fsPath);
        if (rel.startsWith('..')) continue;
        items.push({
          chip: chip({ type: 'code', path: rel, name: s.name, startLine: s.location.range.start.line + 1, endLine: Math.max(s.location.range.end.line + 1, s.location.range.start.line + 30) }, s.name, 'symbol-method'),
          detail: `${rel}:${s.location.range.start.line + 1}`,
          group: 'Code',
        });
      }
    }
  }
  const special: MentionItem[] = [
    { chip: chip({ type: 'git', value: 'working' }, 'Uncommitted changes', 'git-commit'), detail: 'git diff', group: 'Git' },
    { chip: chip({ type: 'git', value: 'branch' }, 'Branch diff', 'git-compare'), detail: 'changes since the main branch', group: 'Git' },
    { chip: chip({ type: 'codebase', query: '' }, 'Codebase', 'search'), detail: 'search the indexed project for this request', group: 'Context' },
    { chip: chip({ type: 'problems', text: '' }, 'Problems', 'warning'), detail: 'errors and warnings in the editor', group: 'Context' },
    { chip: chip({ type: 'terminal', text: '', name: 'Terminal' }, 'Terminal', 'terminal'), detail: 'latest commands and output', group: 'Context' },
  ];
  if (q) special.push({ chip: chip({ type: 'web', query: q }, `Web: ${q}`, 'globe'), detail: 'search the web', group: 'Web' });
  if (/^https?:\/\/\S+$/.test(q)) special.unshift({ chip: chip({ type: 'url', url: q }, q.replace(/^https?:\/\//, '').slice(0, 40), 'link'), detail: 'read this page (docs)', group: 'Docs' });
  for (const s of special) if (!q || s.group === 'Web' || s.group === 'Docs' || fuzzyScore(q, s.chip.label) >= 0) items.push(s);
  if (root) {
    const rules = await loadRules(root);
    for (const r of rules.filter((x) => x.source === 'cursor' || x.source === 'musabai')) {
      if (!q || fuzzyScore(q, r.name) >= 0) items.push({ chip: chip({ type: 'rule', name: r.name }, `Rule: ${r.name}`, 'law'), detail: r.description || r.path, group: 'Rules' });
    }
  }
  for (const c of store.list().slice(0, 30)) {
    if (q && fuzzyScore(q, c.title) < 0) continue;
    items.push({ chip: chip({ type: 'chat', title: c.title, text: c.id }, c.title, 'comment-discussion'), detail: new Date(c.updatedAt).toLocaleString(), group: 'Past chats' });
    if (items.filter((i) => i.group === 'Past chats').length >= 4) break;
  }
  return items.slice(0, 40);
}
