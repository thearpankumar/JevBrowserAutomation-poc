export interface ComponentRequirement {
  mpn: string;
  package?: string;
  qty: number;
}

export interface SourcingResult {
  supplier: "DigiKey" | "Distrelec";
  mpn: string;
  manufacturer: string | null;
  price: string | null;
  currency: string | null;
  stock: number | null;
  leadTime: string | null;
  /** 1.0 for trusted API data; Jev's noul score (0-1) for browser-sourced data. */
  confidence: number;
  /** Present only for the browser path — what Jev was asked and answered. */
  jevTrace?: {
    disambiguate?: unknown;
    verifySpec?: unknown;
  };
  sourceUrl: string | null;
  fetchedAt: string;
}

export interface CandidateResult {
  index: number;
  text: string;
  url: string | null;
  /** From the search API's own doc, when available (see extract.ts#candidatesFromApiDocs) — null for DOM-scrape-fallback candidates. */
  manufacturer?: string | null;
}
