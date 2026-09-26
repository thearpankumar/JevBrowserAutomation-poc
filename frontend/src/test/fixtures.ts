import type { BatchJob, BatchRowState, SourcingResult } from "@jev/shared";

export function makeResult(overrides: Partial<SourcingResult> = {}): SourcingResult {
  return {
    supplier: "DigiKey",
    mpn: "STM32F407VGT6",
    manufacturer: "STMicroelectronics",
    price: "14.64",
    currency: "USD",
    stock: 1325,
    leadTime: null,
    confidence: 1,
    sourceUrl: "https://example.com/product",
    fetchedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** What a supplier pipeline returns when it finds nothing — one all-null result, not an empty array. */
export function makeNotFound(overrides: Partial<SourcingResult> = {}): SourcingResult {
  return makeResult({ manufacturer: null, price: null, currency: null, stock: null, confidence: 0, sourceUrl: null, ...overrides });
}

export function makeRow(mpn: string, results: SourcingResult[], qty = 1, overrides: Partial<BatchRowState> = {}): BatchRowState {
  return {
    requirement: { mpn, qty },
    results,
    errors: [],
    digikeyDone: true,
    distrelecDone: true,
    ...overrides,
  };
}

export function makeJob(rows: BatchRowState[], overrides: Partial<BatchJob> = {}): BatchJob {
  return {
    id: "batch_test",
    status: "done",
    total: rows.length * 2,
    completed: rows.length * 2,
    rows,
    parseErrors: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}
