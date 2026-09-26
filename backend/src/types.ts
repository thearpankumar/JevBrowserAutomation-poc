// Backend-internal types only. Anything the frontend also sees lives in
// @jev/shared (ComponentRequirement, SourcingResult, BatchJob, ...).

export interface CandidateResult {
  index: number;
  text: string;
  url: string | null;
  /** From the search API's own doc, when available (see extract.ts#candidatesFromApiDocs) — null for DOM-scrape-fallback candidates. */
  manufacturer?: string | null;
}
