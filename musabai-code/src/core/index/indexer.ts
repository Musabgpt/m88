import path from 'node:path';
import type { AgentHost, SearchHit } from '../host';

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'is', 'it', 'for', 'on', 'with', 'this', 'that', 'be', 'as', 'at', 'by',
  'are', 'was', 'from', 'where', 'what', 'how', 'which', 'does', 'do', 'we', 'i', 'you', 'can', 'find', 'code', 'file', 'function',
]);

const SKIP_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.svg', '.pdf', '.zip', '.gz', '.tgz', '.xz', '.7z', '.rar', '.jar',
  '.class', '.so', '.dll', '.dylib', '.exe', '.bin', '.o', '.a', '.wasm', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.mp3', '.mp4',
  '.mov', '.avi', '.webm', '.ogg', '.wav', '.lock', '.map', '.gguf', '.onnx', '.pt', '.pyc', '.db', '.sqlite', '.apk', '.aab', '.keystore', '.jks',
]);

const SKIP_NAMES = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock|composer\.lock|go\.sum)$|\.min\.(js|css)$/;

/** Words of identifiers and text: getUserName → get user name getusername. */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.match(/[\p{L}\p{N}_$]+/gu) ?? []) {
    const word = raw.toLowerCase();
    if (word.length > 1 && word.length < 48 && !STOP.has(word)) out.push(word);
    const parts = raw
      .replace(/([a-z\d])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .split(/[\s_$]+/)
      .map((p) => p.toLowerCase())
      .filter((p) => p.length > 1 && !STOP.has(p));
    if (parts.length > 1) out.push(...parts);
  }
  return out;
}

export interface Chunk {
  path: string;
  startLine: number;
  endLine: number;
  text: string;
}

const BOUNDARY = /^(export\s+)?(async\s+)?(def|class|function|interface|type|enum|struct|impl|fn|func|const\s+\w+\s*=\s*(async\s*)?\(|public|private|protected|@|module|package|#{1,3}\s)/;

/** ~60-line chunks that prefer to start at a definition or a blank line. */
export function chunkFile(file: string, text: string, size = 60, overlap = 8): Chunk[] {
  const lines = text.split('\n');
  const chunks: Chunk[] = [];
  let start = 0;
  while (start < lines.length) {
    let end = Math.min(lines.length, start + size);
    if (end < lines.length) {
      for (let i = end; i > start + size / 2; i--) {
        if (BOUNDARY.test(lines[i]?.trimStart() ?? '') || (lines[i - 1]?.trim() === '' && lines[i]?.trim() !== '')) {
          end = i;
          break;
        }
      }
    }
    const body = lines.slice(start, end).join('\n');
    if (body.trim()) chunks.push({ path: file, startLine: start + 1, endLine: end, text: body });
    if (end >= lines.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

interface Doc {
  chunk: Chunk;
  length: number;
  tf: Map<string, number>;
  pathTokens: Set<string>;
}

export interface IndexStatus {
  files: number;
  chunks: number;
  building: boolean;
  builtAt?: number;
  error?: string;
}

/** A local BM25 index of the workspace: private, free and fast enough for tens of thousands of chunks. */
export class CodebaseIndex {
  private docs: Doc[] = [];
  private df = new Map<string, number>();
  private totalLength = 0;
  private mtimes = new Map<string, number>();
  private building?: Promise<void>;
  status: IndexStatus = { files: 0, chunks: 0, building: false };

  constructor(
    private readonly host: Pick<AgentHost, 'root' | 'listFiles' | 'readText' | 'stat'>,
    private readonly options: { maxFiles?: number; maxFileBytes?: number; exclude?: string[] } = {},
  ) {}

  private indexable(file: string): boolean {
    if (SKIP_EXT.has(path.extname(file).toLowerCase()) || SKIP_NAMES.test(file)) return false;
    return !(this.options.exclude ?? []).some((prefix) => file.startsWith(prefix));
  }

  private add(chunk: Chunk): void {
    const tokens = tokenize(chunk.text);
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    this.docs.push({ chunk, length: tokens.length, tf, pathTokens: new Set(tokenize(chunk.path)) });
    this.totalLength += tokens.length;
  }

  private removeFile(file: string): void {
    const keep: Doc[] = [];
    for (const doc of this.docs) {
      if (doc.chunk.path !== file) {
        keep.push(doc);
        continue;
      }
      this.totalLength -= doc.length;
      for (const t of doc.tf.keys()) {
        const n = (this.df.get(t) ?? 1) - 1;
        if (n <= 0) this.df.delete(t);
        else this.df.set(t, n);
      }
    }
    this.docs = keep;
    this.mtimes.delete(file);
  }

  async updateFile(file: string): Promise<void> {
    const rel = file.split(path.sep).join('/');
    this.removeFile(rel);
    if (!this.indexable(rel)) return;
    const abs = path.join(this.host.root, rel);
    const info = await this.host.stat(abs);
    if (!info || info.type !== 'file' || info.size > (this.options.maxFileBytes ?? 400_000)) return;
    const text = await this.host.readText(abs).catch(() => undefined);
    if (!text) return;
    for (const chunk of chunkFile(rel, text)) this.add(chunk);
    this.mtimes.set(rel, info.mtimeMs);
    this.refreshStatus();
  }

  forget(file: string): void {
    this.removeFile(file.split(path.sep).join('/'));
    this.refreshStatus();
  }

  has(file: string): boolean {
    return this.mtimes.has(file.split(path.sep).join('/'));
  }

  private refreshStatus(): void {
    this.status = { ...this.status, files: this.mtimes.size, chunks: this.docs.length };
  }

  /** Builds or refreshes the index; files unchanged since the last build are kept. */
  build(onProgress?: (done: number, total: number) => void): Promise<void> {
    if (this.building) return this.building;
    this.status = { ...this.status, building: true, error: undefined };
    this.building = (async () => {
      try {
        const files = (await this.host.listFiles({ limit: this.options.maxFiles ?? 8000 })).filter((f) => this.indexable(f));
        const present = new Set(files);
        for (const known of [...this.mtimes.keys()]) if (!present.has(known)) this.removeFile(known);
        let done = 0;
        for (const file of files) {
          const info = await this.host.stat(path.join(this.host.root, file));
          if (info && this.mtimes.get(file) !== info.mtimeMs) await this.updateFile(file);
          done++;
          if (done % 200 === 0) {
            onProgress?.(done, files.length);
            await new Promise((r) => setImmediate(r));
          }
        }
        onProgress?.(files.length, files.length);
        this.status = { files: this.mtimes.size, chunks: this.docs.length, building: false, builtAt: Date.now() };
      } catch (error) {
        this.status = { ...this.status, building: false, error: (error as Error).message };
      } finally {
        this.building = undefined;
      }
    })();
    return this.building;
  }

  async search(query: string, limit = 8): Promise<SearchHit[]> {
    if (!this.status.builtAt && !this.building) await this.build();
    else if (this.building && !this.docs.length) await this.building;
    const terms = [...new Set(tokenize(query))];
    if (!terms.length || !this.docs.length) return [];
    const n = this.docs.length;
    const avg = this.totalLength / n || 1;
    const k1 = 1.2;
    const b = 0.75;
    const idf = new Map(terms.map((t) => [t, Math.log(1 + (n - (this.df.get(t) ?? 0) + 0.5) / ((this.df.get(t) ?? 0) + 0.5))]));
    const scored: { doc: Doc; score: number }[] = [];
    for (const doc of this.docs) {
      let score = 0;
      let matched = 0;
      for (const t of terms) {
        const f = doc.tf.get(t);
        if (f) {
          matched++;
          score += idf.get(t)! * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * doc.length) / avg)));
        }
        if (doc.pathTokens.has(t)) score += idf.get(t)! * 0.6;
      }
      if (score > 0) scored.push({ doc, score: score * (0.6 + (0.4 * matched) / terms.length) });
    }
    scored.sort((x, y) => y.score - x.score);
    const out: SearchHit[] = [];
    const perFile = new Map<string, number>();
    for (const { doc, score } of scored) {
      const count = perFile.get(doc.chunk.path) ?? 0;
      if (count >= 2) continue;
      perFile.set(doc.chunk.path, count + 1);
      out.push({ ...doc.chunk, score: Number(score.toFixed(3)) });
      if (out.length >= limit) break;
    }
    return out;
  }
}
