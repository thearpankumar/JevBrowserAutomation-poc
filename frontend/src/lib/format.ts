import type { BomRowError, SourcingResult } from "@jev/shared";

const EMPTY = "—";

export function formatPrice(r: Pick<SourcingResult, "price" | "currency">): string {
  if (r.price == null) return EMPTY;
  return r.currency ? `${r.currency} ${r.price}` : r.price;
}

export function formatStock(stock: number | null): string {
  return stock != null ? String(stock) : EMPTY;
}

export function formatSubtotal(subtotal: number, currency: string | null): string {
  return `~${currency ? `${currency} ` : ""}${subtotal.toFixed(2)}`;
}

/** Row 0 means "the whole file" (e.g. "this looks like an Excel file"), so it gets no row prefix. */
export function formatRowError(e: BomRowError): string {
  return e.row > 0 ? `Row ${e.row}: ${e.message}` : e.message;
}
