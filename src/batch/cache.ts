/** Simple in-memory TTL cache — enough to stop a BOM with duplicate part numbers (or a rerun) from re-querying either supplier needlessly. Not persisted; fine for a single process at POC scale. */
export class TtlCache<T> {
  private store = new Map<string, { value: T; expiresAt: number }>();

  constructor(
    private ttlMs: number = 10 * 60 * 1000,
    private now: () => number = Date.now
  ) {}

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (this.now() >= entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    this.store.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

/** DigiKey and Distrelec are cached separately (a part existing on one says nothing about the other), keyed on the same normalized MPN a duplicate BOM row would share. */
export function normalizeCacheKey(supplier: string, mpn: string): string {
  return `${supplier}:${mpn.trim().toLowerCase()}`;
}
