import type { AgentHost } from './host';

interface TurnSnapshot {
  turnId: string;
  files: Map<string, string | null>;
}

/** The state of every file the agent touched, as it was before each chat turn. */
export class CheckpointStore {
  private turns: TurnSnapshot[] = [];

  begin(turnId: string): void {
    if (!this.turns.some((t) => t.turnId === turnId)) this.turns.push({ turnId, files: new Map() });
  }

  record(turnId: string, abs: string, before: string | null | undefined): void {
    this.begin(turnId);
    const turn = this.turns.find((t) => t.turnId === turnId)!;
    if (!turn.files.has(abs)) turn.files.set(abs, before ?? null);
  }

  has(turnId: string): boolean {
    return this.turns.some((t) => t.turnId === turnId && t.files.size > 0);
  }

  turnIds(): string[] {
    return this.turns.map((t) => t.turnId);
  }

  /** Files changed in this turn or later, with the text each had before this turn. */
  plan(turnId: string): Map<string, string | null> {
    const at = this.turns.findIndex((t) => t.turnId === turnId);
    const out = new Map<string, string | null>();
    if (at < 0) return out;
    for (const turn of this.turns.slice(at)) {
      for (const [abs, before] of turn.files) if (!out.has(abs)) out.set(abs, before);
    }
    return out;
  }

  async restore(turnId: string, host: Pick<AgentHost, 'writeText' | 'deletePath'>): Promise<string[]> {
    const at = this.turns.findIndex((t) => t.turnId === turnId);
    if (at < 0) return [];
    const plan = this.plan(turnId);
    for (const [abs, before] of plan) {
      if (before === null) await host.deletePath(abs);
      else await host.writeText(abs, before);
    }
    this.turns = this.turns.slice(0, at);
    return [...plan.keys()];
  }

  toJSON(): { turnId: string; files: [string, string | null][] }[] {
    return this.turns.map((t) => ({ turnId: t.turnId, files: [...t.files.entries()] }));
  }

  restoreState(data: { turnId: string; files: [string, string | null][] }[] | undefined): void {
    this.turns = (data || []).map((t) => ({ turnId: t.turnId, files: new Map(t.files) }));
  }
}
