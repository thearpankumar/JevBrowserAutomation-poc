import type { BatchJob } from "@jev/shared";
import { confidenceBadge, isNotFoundResult } from "./selection";

export interface BatchStats {
  /** BOM lines, not results — one part can match several manufacturers/suppliers. */
  total: number;
  accept: number;
  review: number;
  reject: number;
  /** BOM lines where both suppliers finished and neither found a real match. */
  notFound: number;
}

export function computeBatchStats(job: Pick<BatchJob, "rows">): BatchStats {
  const stats: BatchStats = { total: job.rows.length, accept: 0, review: 0, reject: 0, notFound: 0 };

  for (const row of job.rows) {
    const realResults = row.results.filter((r) => !isNotFoundResult(r));
    if (realResults.length === 0) {
      if (row.digikeyDone && row.distrelecDone) stats.notFound++;
      continue;
    }
    for (const r of realResults) {
      stats[confidenceBadge(r.confidence).cls]++;
    }
  }

  return stats;
}
