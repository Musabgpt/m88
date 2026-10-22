import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { matchesGlob, relPath } from './util';

export type RuleKind = 'always' | 'auto' | 'agent' | 'manual';

export interface Rule {
  name: string;
  path: string;
  description: string;
  globs: string[];
  kind: RuleKind;
  body: string;
  source: 'cursor' | 'musabai' | 'cursorrules' | 'agents' | 'user';
}

export interface RuleMeta {
  description?: string;
  globs?: string[];
  alwaysApply?: boolean;
}

function unquote(value: string): string {
  const v = value.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  return v;
}

function splitGlobs(value: string): string[] {
  const v = value.trim();
  if (!v) return [];
  if (v.startsWith('[') && v.endsWith(']')) {
    return v
      .slice(1, -1)
      .split(',')
      .map(unquote)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return v.split(',').map(unquote).map((s) => s.trim()).filter(Boolean);
}

/** Parses Cursor's .mdc front matter (description, globs, alwaysApply) without a YAML dependency. */
export function parseMdc(text: string): { meta: RuleMeta; body: string } {
  const normalized = text.replace(/\r\n/g, '\n').replace(/^﻿/, '');
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(normalized);
  if (!match) return { meta: {}, body: normalized.trim() };
  const meta: RuleMeta = {};
  const lines = match[1].split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^([A-Za-z_]+)\s*:\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const key = m[1];
    let value = m[2];
    if (key === 'globs' && !value.trim()) {
      const items: string[] = [];
      while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1])) items.push(unquote(lines[++i].replace(/^\s*-\s+/, '')));
      meta.globs = items.filter(Boolean);
      continue;
    }
    if (key === 'description') meta.description = unquote(value);
    else if (key === 'globs') meta.globs = splitGlobs(value);
    else if (key === 'alwaysApply') meta.alwaysApply = /^true$/i.test(value.trim());
  }
  return { meta, body: normalized.slice(match[0].length).trim() };
}

function kindOf(meta: RuleMeta): RuleKind {
  if (meta.alwaysApply) return 'always';
  if (meta.globs?.length) return 'auto';
  if (meta.description?.trim()) return 'agent';
  return 'manual';
}

async function walk(dir: string, depth = 0): Promise<string[]> {
  if (depth > 4) return [];
  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full, depth + 1)));
    else if (/\.(mdc|md)$/i.test(e.name)) out.push(full);
  }
  return out.sort();
}

async function readOptional(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, 'utf8');
  } catch {
    return undefined;
  }
}

export async function loadRules(root: string, userRules: string[] = [], nestedAgentDirs: string[] = []): Promise<Rule[]> {
  const rules: Rule[] = [];
  for (const [dir, source] of [
    [path.join(root, '.cursor', 'rules'), 'cursor'],
    [path.join(root, '.musabai', 'rules'), 'musabai'],
  ] as const) {
    for (const file of await walk(dir)) {
      const text = await readOptional(file);
      if (text === undefined) continue;
      const { meta, body } = parseMdc(text);
      if (!body) continue;
      rules.push({
        name: path.basename(file).replace(/\.(mdc|md)$/i, ''),
        path: relPath(root, file),
        description: meta.description?.trim() || '',
        globs: meta.globs || [],
        kind: kindOf(meta),
        body,
        source,
      });
    }
  }
  const legacy = await readOptional(path.join(root, '.cursorrules'));
  if (legacy?.trim()) rules.push({ name: 'cursorrules', path: '.cursorrules', description: 'Project rules', globs: [], kind: 'always', body: legacy.trim(), source: 'cursorrules' });
  const agents = await readOptional(path.join(root, 'AGENTS.md'));
  if (agents?.trim()) rules.push({ name: 'AGENTS.md', path: 'AGENTS.md', description: 'Project notes for agents', globs: [], kind: 'always', body: agents.trim(), source: 'agents' });
  for (const dir of nestedAgentDirs) {
    const rel = relPath(root, dir);
    if (!rel || rel === '.' || rel.startsWith('..')) continue;
    const text = await readOptional(path.join(dir, 'AGENTS.md'));
    if (text?.trim()) {
      rules.push({ name: `${rel}/AGENTS.md`, path: `${rel}/AGENTS.md`, description: `Notes for ${rel}/`, globs: [`${rel}/**`], kind: 'auto', body: text.trim(), source: 'agents' });
    }
  }
  userRules
    .map((r) => r.trim())
    .filter(Boolean)
    .forEach((body, i) => rules.push({ name: `user-rule-${i + 1}`, path: '', description: 'User rule', globs: [], kind: 'always', body, source: 'user' }));
  return rules;
}

/** Directories of the referenced files (and their parents) that may hold a nested AGENTS.md. */
export function nestedDirs(root: string, files: string[]): string[] {
  const dirs = new Set<string>();
  for (const file of files) {
    let dir = path.dirname(path.resolve(root, file));
    while (dir.startsWith(root) && dir !== root) {
      dirs.add(dir);
      dir = path.dirname(dir);
    }
  }
  return [...dirs].sort();
}

export interface RuleSelection {
  always: Rule[];
  attached: Rule[];
  requestable: Rule[];
  mentioned: Rule[];
}

export function selectRules(rules: Rule[], referencedFiles: string[], mentioned: string[] = []): RuleSelection {
  const files = referencedFiles.map((f) => f.replace(/\\/g, '/').replace(/^\.\//, ''));
  const wanted = new Set(mentioned.map((m) => m.toLowerCase()));
  const selection: RuleSelection = { always: [], attached: [], requestable: [], mentioned: [] };
  for (const rule of rules) {
    if (wanted.has(rule.name.toLowerCase())) selection.mentioned.push(rule);
    else if (rule.kind === 'always') selection.always.push(rule);
    else if (rule.kind === 'auto' && files.some((f) => matchesGlob(f, rule.globs))) selection.attached.push(rule);
    else if (rule.kind === 'agent' || rule.kind === 'auto') selection.requestable.push(rule);
  }
  return selection;
}

const RULE_BUDGET = 24_000;

export function rulesPrompt(selection: RuleSelection): string {
  const parts: string[] = [];
  let used = 0;
  const add = (rule: Rule, why: string) => {
    const body = rule.body.length > 8000 ? `${rule.body.slice(0, 8000)}\n…(rule truncated; fetch_rules returns all of it)` : rule.body;
    if (used + body.length > RULE_BUDGET) return;
    used += body.length;
    parts.push(`<rule name="${rule.name}"${rule.path ? ` file="${rule.path}"` : ''} applies="${why}">\n${body}\n</rule>`);
  };
  selection.always.forEach((r) => add(r, r.source === 'user' ? 'user rule, always' : 'always'));
  selection.attached.forEach((r) => add(r, `files matching ${r.globs.join(', ')}`));
  selection.mentioned.forEach((r) => add(r, 'requested by the user'));
  let text = parts.length ? `<rules>\nFollow these rules from the user and the project.\n${parts.join('\n')}\n</rules>` : '';
  if (selection.requestable.length) {
    const list = selection.requestable.map((r) => `- ${r.name}: ${r.description || `files matching ${r.globs.join(', ')}`}`).join('\n');
    text += `${text ? '\n' : ''}<available_rules>\nMore project rules exist. Call fetch_rules with the names that apply to this task before working on it:\n${list}\n</available_rules>`;
  }
  return text;
}

export const RULE_TEMPLATE = `---
description: When to use this rule (the agent reads this to decide)
globs:
alwaysApply: false
---

- Write the rule here, as short concrete instructions.
`;
