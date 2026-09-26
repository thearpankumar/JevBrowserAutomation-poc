// Pure logic for the batch "add to cart" selection UI — no React, no DOM, so
// it's unit-tested directly (selection.test.ts).
import type { BatchJob, CartItem, SourcingResult, Supplier } from "@jev/shared";

type JobRows = Pick<BatchJob, "rows">;

// A supplier pipeline that finds nothing still returns one result object with
// every field null (see notFoundResult in backend/src/digikey/pipeline.ts and
// distrelec/pipeline.ts) — not an empty array.
export function isNotFoundResult(r: Pick<SourcingResult, "manufacturer" | "price" | "sourceUrl">): boolean {
  return r.manufacturer == null && r.price == null && r.sourceUrl == null;
}

export type ConfidenceClass = "accept" | "review" | "reject";

export interface ConfidenceBadgeInfo {
  cls: ConfidenceClass;
  label: string;
}

// Same thresholds as the Confidence Gate in the architecture: >=0.85 auto-accept,
// 0.40-0.85 needs a human look, <0.40 rejected.
export function confidenceBadge(confidence: number): ConfidenceBadgeInfo {
  if (confidence >= 0.85) return { cls: "accept", label: "Confirmed match" };
  if (confidence >= 0.4) return { cls: "review", label: "Needs review" };
  return { cls: "reject", label: "Weak match" };
}

/** Stable within one job's lifetime — rows/results never get reordered after they land. */
export function rowKey(rowIndex: number, resultIndex: number): string {
  return `${rowIndex}:${resultIndex}`;
}

function forEachSelectableResult(job: JobRows, visit: (key: string, result: SourcingResult, rowIndex: number) => void): void {
  job.rows.forEach((row, rowIndex) => {
    row.results.forEach((result, resultIndex) => {
      if (isNotFoundResult(result)) return;
      visit(rowKey(rowIndex, resultIndex), result, rowIndex);
    });
  });
}

/** Every real, "Confirmed match" result — what gets pre-checked automatically. */
export function defaultSelectedKeys(job: JobRows): string[] {
  const keys: string[] = [];
  forEachSelectableResult(job, (key, result) => {
    if (confidenceBadge(result.confidence).cls === "accept") keys.push(key);
  });
  return keys;
}

/** Every real (selectable) result's key regardless of confidence — used by "Select all". */
export function allSelectableKeys(job: JobRows): string[] {
  const keys: string[] = [];
  forEachSelectableResult(job, (key) => keys.push(key));
  return keys;
}

/**
 * The user's explicit checkbox decisions, keyed by rowKey (true = checked).
 * A result with no entry follows its default (checked only if it's a
 * confirmed match) — so results that arrive later while a batch is still
 * running get their default, and a box the user unchecked stays unchecked.
 */
export type SelectionChoices = ReadonlyMap<string, boolean>;

export function resolveSelectedKeys(job: JobRows, choices: SelectionChoices): string[] {
  const keys: string[] = [];
  forEachSelectableResult(job, (key, result) => {
    const isDefault = confidenceBadge(result.confidence).cls === "accept";
    if (choices.get(key) ?? isDefault) keys.push(key);
  });
  return keys;
}

/** The exact items to send to a supplier's cart API — mpn, manufacturer, and the BOM line's requested qty (the row's qty, not per result). */
export function selectedItemsForSupplier(job: JobRows, selectedKeys: Iterable<string>, supplier: Supplier): CartItem[] {
  const selected = new Set(selectedKeys);
  const items: CartItem[] = [];
  forEachSelectableResult(job, (key, result, rowIndex) => {
    if (result.supplier !== supplier || !selected.has(key)) return;
    const { requirement } = job.rows[rowIndex];
    items.push({ mpn: requirement.mpn, manufacturer: result.manufacturer, quantity: requirement.qty });
  });
  return items;
}

export interface SupplierSelectionSummary {
  count: number;
  subtotal: number;
  currency: string | null;
}

export type SelectionSummary = Record<Supplier, SupplierSelectionSummary>;

function parsePriceNumber(price: string | null): number {
  if (price == null) return 0;
  const n = parseFloat(price);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Per-supplier counts + a rough subtotal for the summary bar and the two
 * "Add to cart" buttons. Deliberately per-supplier, never one combined total:
 * DigiKey and Distrelec are two separate carts on two separate sites.
 */
export function computeSelectionSummary(job: JobRows, selectedKeys: Iterable<string>): SelectionSummary {
  const selected = new Set(selectedKeys);
  const summary: SelectionSummary = {
    DigiKey: { count: 0, subtotal: 0, currency: null },
    Distrelec: { count: 0, subtotal: 0, currency: null },
  };

  forEachSelectableResult(job, (key, result) => {
    if (!selected.has(key)) return;
    const bucket = summary[result.supplier];
    if (!bucket) return;
    bucket.count += 1;
    bucket.subtotal += parsePriceNumber(result.price);
    if (bucket.currency == null && result.currency != null) bucket.currency = result.currency;
  });

  return summary;
}
