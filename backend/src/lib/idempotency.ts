export interface IdempotencyEntry {
  statusCode: number;
  location?: string;
  body: unknown;
  createdAt: number;
}

const TTL_MS = 10 * 60 * 1000; // 10 minutes
const PRUNE_EVERY_MS = 60 * 1000;

/** In-memory idempotency-key store with a 10-minute TTL per entry. */
export class IdempotencyStore {
  private readonly map = new Map<string, IdempotencyEntry>();
  private readonly timer: ReturnType<typeof setInterval> | undefined;

  constructor() {
    this.timer = setInterval(() => this.prune(), PRUNE_EVERY_MS);
    this.timer.unref?.();
  }

  set(key: string, entry: Omit<IdempotencyEntry, 'createdAt'>): void {
    this.map.set(key, { ...entry, createdAt: Date.now() });
  }

  get(key: string): IdempotencyEntry | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.createdAt > TTL_MS) {
      this.map.delete(key);
      return undefined;
    }
    return entry;
  }

  prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.map) {
      if (now - entry.createdAt > TTL_MS) this.map.delete(key);
    }
  }

  clear(): void {
    this.map.clear();
  }
}
