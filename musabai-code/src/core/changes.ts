import { type Hunk, acceptHunk, hunks, revertHunk, stats } from './diff';
import type { AgentHost } from './host';
import { relPath } from './util';

export interface ChangeSummary {
  path: string;
  rel: string;
  added: number;
  removed: number;
  created: boolean;
  deleted: boolean;
}

type Listener = () => void;

/**
 * Agent edits land on disk at once (so tests and the terminal see them) and stay "pending" until the
 * user accepts or rejects them, file by file or hunk by hunk, as in Cursor's review flow.
 */
export class ChangeTracker {
  private readonly baselines = new Map<string, string | null>();
  private readonly listeners = new Set<Listener>();

  constructor(private readonly host: Pick<AgentHost, 'root' | 'readText' | 'writeText' | 'deletePath'>) {}

  onDidChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private fire(): void {
    for (const l of this.listeners) l();
  }

  /** Remembers the text before the first unreviewed agent change (null: the file did not exist). */
  record(abs: string, before: string | null | undefined): void {
    if (!this.baselines.has(abs)) {
      this.baselines.set(abs, before ?? null);
    }
    this.fire();
  }

  touched(): void {
    this.fire();
  }

  has(abs: string): boolean {
    return this.baselines.has(abs);
  }

  baseline(abs: string): string | null | undefined {
    return this.baselines.get(abs);
  }

  paths(): string[] {
    return [...this.baselines.keys()];
  }

  async current(abs: string): Promise<string | null> {
    return (await this.host.readText(abs).catch(() => undefined)) ?? null;
  }

  async summary(): Promise<ChangeSummary[]> {
    const out: ChangeSummary[] = [];
    for (const [abs, before] of this.baselines) {
      const now = await this.current(abs);
      if (now === before) {
        this.baselines.delete(abs);
        continue;
      }
      const s = stats(before ?? '', now ?? '');
      out.push({ path: abs, rel: relPath(this.host.root, abs), ...s, created: before === null, deleted: now === null });
    }
    return out;
  }

  async hunks(abs: string): Promise<Hunk[]> {
    const before = this.baselines.get(abs);
    if (before === undefined) return [];
    return hunks(before ?? '', (await this.current(abs)) ?? '');
  }

  accept(abs: string): void {
    this.baselines.delete(abs);
    this.fire();
  }

  async reject(abs: string): Promise<void> {
    const before = this.baselines.get(abs);
    if (before === undefined) return;
    if (before === null) await this.host.deletePath(abs);
    else await this.host.writeText(abs, before);
    this.baselines.delete(abs);
    this.fire();
  }

  acceptAll(): void {
    this.baselines.clear();
    this.fire();
  }

  async rejectAll(): Promise<void> {
    for (const abs of [...this.baselines.keys()]) await this.reject(abs);
  }

  async acceptHunk(abs: string, index: number): Promise<void> {
    const before = this.baselines.get(abs);
    const list = await this.hunks(abs);
    if (before === undefined || !list[index]) return;
    const next = acceptHunk(before ?? '', list[index]);
    const now = await this.current(abs);
    if (next === now) this.baselines.delete(abs);
    else this.baselines.set(abs, next);
    this.fire();
  }

  async rejectHunk(abs: string, index: number): Promise<void> {
    const before = this.baselines.get(abs);
    const list = await this.hunks(abs);
    const now = await this.current(abs);
    if (before === undefined || !list[index] || now === null) return;
    const next = revertHunk(now, list[index]);
    await this.host.writeText(abs, next);
    if (next === (before ?? '')) {
      if (before === null && !next) await this.host.deletePath(abs);
      this.baselines.delete(abs);
    }
    this.fire();
  }

  toJSON(): Record<string, string | null> {
    return Object.fromEntries(this.baselines);
  }

  restore(data: Record<string, string | null> | undefined): void {
    for (const [abs, before] of Object.entries(data || {})) this.baselines.set(abs, before);
    this.fire();
  }
}
