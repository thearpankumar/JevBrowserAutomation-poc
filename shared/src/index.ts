// Types shared by the backend (which produces these shapes) and the frontend
// (which consumes them over the HTTP API). One definition, so a change on one
// side fails to compile on the other instead of drifting silently.

export type Supplier = "DigiKey" | "Distrelec";

export interface ComponentRequirement {
  mpn: string;
  package?: string;
  qty: number;
}

export interface SourcingResult {
  supplier: Supplier;
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

export interface SupplierError {
  supplier: Supplier;
  message: string;
}

export interface BomRowError {
  /** 1-based, counting the header row as row 1 — matches what a person sees when they open the file in a spreadsheet app. */
  row: number;
  message: string;
}

export interface BatchRowState {
  requirement: ComponentRequirement;
  results: SourcingResult[];
  errors: SupplierError[];
  digikeyDone: boolean;
  distrelecDone: boolean;
}

export type BatchStatus = "running" | "done";

export interface BatchJob {
  id: string;
  status: BatchStatus;
  /** requirements.length * 2 (one DigiKey + one Distrelec check per part) — what "completed" counts up to. */
  total: number;
  completed: number;
  rows: BatchRowState[];
  parseErrors: BomRowError[];
  createdAt: string;
  completedAt?: string;
}

export interface CartItem {
  mpn: string;
  manufacturer?: string | null;
  quantity: number;
}

// ---- HTTP API request/response bodies ----

/** Any non-2xx JSON response. `rowErrors` is present when a BOM upload was rejected. */
export interface ApiErrorResponse {
  error: string;
  rowErrors?: BomRowError[];
}

/** POST /api/source */
export interface SourceRequest {
  mpn: string;
}

export interface SourceResponse {
  results: SourcingResult[];
  errors: SupplierError[];
}

/** POST /api/batch */
export interface StartBatchRequest {
  csv: string;
}

export interface StartBatchResponse {
  jobId: string;
  total: number;
  rowErrors: BomRowError[];
}

/** GET /api/batch/:id returns a BatchJob. */

/** GET /api/digikey/status */
export interface DigikeyStatusResponse {
  connected: boolean;
}

/** POST /api/digikey/cart/add */
export interface AddToCartRequest {
  items: CartItem[];
}

export interface AddToCartResponse {
  listId: string;
  addedIdentifiers: string[];
}
