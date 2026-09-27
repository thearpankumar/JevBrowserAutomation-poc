import type { AddToDistrelecCartResponse, CartItem, DistrelecSkippedItem } from "@jev/shared";
import { logger } from "../logger.js";
import type { DistrelecSession } from "./session.js";

const log = logger.child({ component: "distrelec-cart" });

// Verified against real, live calls (a genuine test account, September 2026) —
// see the exploration notes in this feature's PR/session for how each of
// these was found: Distrelec's own "Bill of materials" tool
// (https://www.distrelec.ch/en/bom-tool) calls the same endpoints from the
// browser; this module calls them directly instead of driving that page.
const API_BASE = "https://api.distrelec.com/rest/v2/distrelec_CH";
const QUERY = "lang=en&curr=CHF&channel=B2C&country=CH";

function authHeaders(session: DistrelecSession, contentType: string): Record<string, string> {
  return {
    Authorization: `Bearer ${session.accessToken}`,
    "Content-Type": contentType,
    Accept: "application/json",
  };
}

interface BomReviewMatch {
  productCode: string;
  quantity: number;
  reference: string;
  searchTerm: string;
}

interface BomReviewResponse {
  matchingProducts?: BomReviewMatch[];
  // Confirmed shape: each entry carries `searchTerm` alongside its own nested
  // `duplicateMpnProducts` (the candidate products a person must choose
  // between on Distrelec's own site — this feature deliberately doesn't
  // guess which one is meant, see addItemsToDistrelecCart below).
  duplicateMpnProducts?: unknown[];
  // NOT verified against a real response (never reproduced live) — extracted
  // defensively below rather than assumed.
  unavailableProducts?: unknown[];
  notMatchingProductCodes?: unknown[];
}

/** Distrelec's BOM tool expects one "quantity, MPN, reference" line per part. */
function buildBomCsv(items: CartItem[]): string {
  return items.map((item) => `${item.quantity}, ${item.mpn}, ${item.manufacturer ?? item.mpn}`).join("\n");
}

async function reviewBom(session: DistrelecSession, items: CartItem[], fetchImpl: typeof fetch): Promise<BomReviewResponse> {
  const res = await fetchImpl(`${API_BASE}/bom-tool/current/review?${QUERY}`, {
    method: "POST",
    headers: authHeaders(session, "text/csv"),
    body: buildBomCsv(items),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Distrelec BOM review failed: ${res.status} ${res.statusText} — ${body}`);
  }
  return (await res.json()) as BomReviewResponse;
}

async function getOrCreateCartCode(session: DistrelecSession, fetchImpl: typeof fetch): Promise<string> {
  const listRes = await fetchImpl(`${API_BASE}/users/current/carts?${QUERY}`, { headers: authHeaders(session, "application/json") });
  if (listRes.ok) {
    const listBody = (await listRes.json()) as { carts?: { code: string }[] };
    const existing = listBody.carts?.[0]?.code;
    if (existing) return existing;
  }

  const createRes = await fetchImpl(`${API_BASE}/users/current/carts?${QUERY}`, {
    method: "POST",
    headers: authHeaders(session, "application/json"),
  });
  if (!createRes.ok) {
    const body = await createRes.text().catch(() => "");
    throw new Error(`Distrelec cart creation failed: ${createRes.status} ${createRes.statusText} — ${body}`);
  }
  const created = (await createRes.json()) as { code?: string };
  if (!created.code) {
    log.error({ response: created }, "Distrelec created a cart but its response had no recognizable cart code");
    throw new Error("Distrelec created a cart but its response didn't contain a cart code — check the real response shape.");
  }
  return created.code;
}

async function bulkAddToCart(
  session: DistrelecSession,
  cartCode: string,
  products: BomReviewMatch[],
  fetchImpl: typeof fetch
): Promise<void> {
  const res = await fetchImpl(`${API_BASE}/users/current/carts/${encodeURIComponent(cartCode)}/bulk?${QUERY}`, {
    method: "POST",
    headers: authHeaders(session, "application/json"),
    body: JSON.stringify({
      products: products.map((p, i) => ({
        itemNumber: String(i + 1),
        productCode: p.productCode,
        quantity: p.quantity,
        reference: p.reference,
      })),
      addedFrom: "bom",
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Distrelec add-to-cart failed: ${res.status} ${res.statusText} — ${body}`);
  }
}

/** searchTerm/mpn field name isn't confirmed for every bucket — see BomReviewResponse. */
function extractMpn(entry: unknown): string | null {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object") {
    const e = entry as Record<string, unknown>;
    if (typeof e.searchTerm === "string") return e.searchTerm;
    if (typeof e.mpn === "string") return e.mpn;
  }
  return null;
}

function extractSkipped(entries: unknown[] | undefined, reason: DistrelecSkippedItem["reason"]): DistrelecSkippedItem[] {
  const skipped: DistrelecSkippedItem[] = [];
  for (const entry of entries ?? []) {
    const mpn = extractMpn(entry);
    if (mpn) {
      skipped.push({ mpn, reason });
    } else {
      log.warn({ entry, reason }, "Distrelec BOM review returned an entry with no recognizable MPN field — skipping it silently");
    }
  }
  return skipped;
}

/**
 * Submits items to Distrelec's own "Bill of materials" tool — paste a list,
 * it matches each MPN to a product, then adds the matches to a cart — the
 * same flow https://www.distrelec.ch/en/bom-tool exposes to a signed-in
 * person, called directly rather than driving that page. An MPN matching
 * more than one product is left for a person to resolve on Distrelec's own
 * site instead of guessed at; see `skipped` in the result.
 */
export async function addItemsToDistrelecCart(
  session: DistrelecSession,
  items: CartItem[],
  opts: { fetchImpl?: typeof fetch } = {}
): Promise<AddToDistrelecCartResponse> {
  const fetchImpl = opts.fetchImpl ?? fetch;

  const review = await reviewBom(session, items, fetchImpl);
  const matched = review.matchingProducts ?? [];

  const skipped: DistrelecSkippedItem[] = [
    ...extractSkipped(review.duplicateMpnProducts, "ambiguous"),
    ...extractSkipped(review.unavailableProducts, "unavailable"),
    ...extractSkipped(review.notMatchingProductCodes, "not_found"),
  ];

  // Distrelec silently drops an MPN it doesn't recognize at all from every
  // bucket in the response (confirmed live) — anything we sent that isn't
  // accounted for anywhere above is "not found" by elimination.
  const accountedFor = new Set([...matched.map((m) => m.searchTerm), ...skipped.map((s) => s.mpn)]);
  for (const item of items) {
    if (!accountedFor.has(item.mpn)) skipped.push({ mpn: item.mpn, reason: "not_found" });
  }

  if (matched.length === 0) {
    log.warn({ skipped }, "no Distrelec products matched — nothing added to cart");
    return { cartCode: null, addedCount: 0, skipped };
  }

  const cartCode = await getOrCreateCartCode(session, fetchImpl);
  await bulkAddToCart(session, cartCode, matched, fetchImpl);

  log.info({ cartCode, addedCount: matched.length, skippedCount: skipped.length }, "added items to Distrelec cart");
  return { cartCode, addedCount: matched.length, skipped };
}
