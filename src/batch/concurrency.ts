export type Settled<R> = { status: "fulfilled"; value: R } | { status: "rejected"; reason: unknown };

/**
 * Runs `worker` over `items` with at most `limit` in flight at once — a
 * small worker-pool instead of Promise.all's unbounded concurrency. Each
 * item's outcome is isolated (a rejection doesn't stop the others or reject
 * the overall call), and `onItemSettled` fires as soon as that one item
 * finishes, so callers can report progress before the whole batch is done.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  onItemSettled?: (index: number, settled: Settled<R>) => void
): Promise<Settled<R>[]> {
  const results: Settled<R>[] = new Array(items.length);
  if (items.length === 0) return results;

  const effectiveLimit = Math.max(1, Math.min(limit, items.length));
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    for (;;) {
      const i = nextIndex++;
      if (i >= items.length) return;

      let settled: Settled<R>;
      try {
        const value = await worker(items[i], i);
        settled = { status: "fulfilled", value };
      } catch (reason) {
        settled = { status: "rejected", reason };
      }

      results[i] = settled;
      onItemSettled?.(i, settled);
    }
  }

  await Promise.all(Array.from({ length: effectiveLimit }, runWorker));
  return results;
}
