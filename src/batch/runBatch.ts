import { ComponentRequirement, SourcingResult } from "../types.js";
import { BatchJob } from "./jobStore.js";
import { mapWithConcurrency, Settled } from "./concurrency.js";
import { TtlCache, normalizeCacheKey } from "./cache.js";

export interface RunBatchDeps {
  sourceFromDigikey: (r: ComponentRequirement) => Promise<SourcingResult[]>;
  sourceFromDistrelec: (r: ComponentRequirement) => Promise<SourcingResult[]>;
}

export interface RunBatchOptions {
  /** DigiKey is a trusted API — cheap, can run higher concurrency. */
  digikeyConcurrency?: number;
  /** Distrelec launches a real headed browser per lookup and is bot-detection-sensitive — keep this low. */
  distrelecConcurrency?: number;
  cache?: TtlCache<SourcingResult[]>;
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

/**
 * Runs both suppliers across every row of `job`, each on its own
 * concurrency-limited pool, mutating `job` in place as results land so a
 * concurrent GET of the same job (via JobStore) sees live progress rather
 * than only a final snapshot.
 */
export async function runBatch(job: BatchJob, deps: RunBatchDeps, opts: RunBatchOptions = {}): Promise<void> {
  const digikeyConcurrency = opts.digikeyConcurrency ?? 5;
  const distrelecConcurrency = opts.distrelecConcurrency ?? 2;
  const cache = opts.cache;

  const requirements = job.rows.map((r) => r.requirement);
  // Single-flight, not just a cache: two identical MPNs racing through the
  // pool at once (concurrency > 1) would otherwise both miss the TTL cache
  // and double-fetch — wasteful anywhere, and worse for Distrelec, where a
  // "fetch" is a whole extra headed-browser launch.
  const inFlight = new Map<string, Promise<SourcingResult[]>>();

  function noteDone(index: number, supplier: "DigiKey" | "Distrelec", settled: Settled<SourcingResult[]>): void {
    const row = job.rows[index];
    if (settled.status === "fulfilled") {
      row.results.push(...settled.value);
    } else {
      row.errors.push({ supplier, message: errorMessage(settled.reason) });
    }
    if (supplier === "DigiKey") row.digikeyDone = true;
    else row.distrelecDone = true;
    job.completed++;
  }

  async function cachedFetch(
    supplier: "DigiKey" | "Distrelec",
    requirement: ComponentRequirement,
    fetcher: (r: ComponentRequirement) => Promise<SourcingResult[]>
  ): Promise<SourcingResult[]> {
    const key = cache ? normalizeCacheKey(supplier, requirement.mpn) : null;
    if (!key) return fetcher(requirement);

    const cached = cache!.get(key);
    if (cached) return cached;

    const pending = inFlight.get(key);
    if (pending) return pending;

    const promise = fetcher(requirement);
    inFlight.set(key, promise);
    try {
      const result = await promise;
      cache!.set(key, result);
      return result;
    } finally {
      inFlight.delete(key);
    }
  }

  await Promise.all([
    mapWithConcurrency(
      requirements,
      digikeyConcurrency,
      (r) => cachedFetch("DigiKey", r, deps.sourceFromDigikey),
      (i, settled) => noteDone(i, "DigiKey", settled)
    ),
    mapWithConcurrency(
      requirements,
      distrelecConcurrency,
      (r) => cachedFetch("Distrelec", r, deps.sourceFromDistrelec),
      (i, settled) => noteDone(i, "Distrelec", settled)
    ),
  ]);

  job.status = "done";
  job.completedAt = new Date().toISOString();
}
