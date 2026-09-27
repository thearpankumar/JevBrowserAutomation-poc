import type { CartItem } from "@jev/shared";

export type ParsedCartRequest = { ok: true; items: CartItem[] } | { ok: false; error: string };

/**
 * Validates the untrusted JSON body of POST /api/digikey/cart/add and
 * POST /api/distrelec/cart/add — both take the same { items: CartItem[] }
 * shape. Every item needs a non-empty part number; quantity falls back to 1
 * when missing or not a positive number (it's the BOM's requested qty, not
 * something to reject a whole cart over).
 */
export function parseAddToCartRequest(body: unknown): ParsedCartRequest {
  const items = (body as { items?: unknown } | null)?.items;
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "At least one item is required." };
  }

  const parsed: CartItem[] = [];
  for (const [index, raw] of items.entries()) {
    if (typeof raw !== "object" || raw === null) {
      return { ok: false, error: `Item ${index + 1} is not an object.` };
    }
    const { mpn, manufacturer, quantity } = raw as Record<string, unknown>;
    if (typeof mpn !== "string" || mpn.trim() === "") {
      return { ok: false, error: `Item ${index + 1} is missing a part number.` };
    }
    parsed.push({
      mpn: mpn.trim(),
      manufacturer: typeof manufacturer === "string" && manufacturer.trim() !== "" ? manufacturer : null,
      quantity: typeof quantity === "number" && Number.isFinite(quantity) && quantity >= 1 ? Math.floor(quantity) : 1,
    });
  }
  return { ok: true, items: parsed };
}
