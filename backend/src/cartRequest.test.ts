import { describe, expect, it } from "vitest";
import { parseAddToCartRequest } from "./cartRequest.js";

describe("parseAddToCartRequest", () => {
  it("accepts a well-formed request", () => {
    expect(parseAddToCartRequest({ items: [{ mpn: "STM32F407VGT6", manufacturer: "STMicroelectronics", quantity: 25 }] })).toEqual({
      ok: true,
      items: [{ mpn: "STM32F407VGT6", manufacturer: "STMicroelectronics", quantity: 25 }],
    });
  });

  it.each([null, undefined, "text", 42, {}, { items: "nope" }, { items: [] }])("rejects a body with no items: %j", (body) => {
    expect(parseAddToCartRequest(body)).toEqual({ ok: false, error: "At least one item is required." });
  });

  it.each([null, "STM32", 7])("rejects an item that isn't an object: %j", (item) => {
    expect(parseAddToCartRequest({ items: [item] })).toEqual({ ok: false, error: "Item 1 is not an object." });
  });

  it.each([{}, { mpn: "" }, { mpn: "   " }, { mpn: 123 }])("rejects an item without a real part number: %j", (item) => {
    expect(parseAddToCartRequest({ items: [item] })).toEqual({ ok: false, error: "Item 1 is missing a part number." });
  });

  it("reports which item is invalid when several are sent", () => {
    expect(parseAddToCartRequest({ items: [{ mpn: "A", quantity: 1 }, { quantity: 2 }] })).toEqual({
      ok: false,
      error: "Item 2 is missing a part number.",
    });
  });

  it("trims the part number", () => {
    const result = parseAddToCartRequest({ items: [{ mpn: "  A1  ", quantity: 1 }] });
    expect(result.ok && result.items[0].mpn).toBe("A1");
  });

  it.each([undefined, 0, -3, Number.NaN, Number.POSITIVE_INFINITY, "5"])("falls back to quantity 1 for %j", (quantity) => {
    const result = parseAddToCartRequest({ items: [{ mpn: "A", quantity }] });
    expect(result.ok && result.items[0].quantity).toBe(1);
  });

  it("floors a fractional quantity", () => {
    const result = parseAddToCartRequest({ items: [{ mpn: "A", quantity: 2.7 }] });
    expect(result.ok && result.items[0].quantity).toBe(2);
  });

  it.each([undefined, null, "", "  ", 5])("normalizes a missing or non-string manufacturer (%j) to null", (manufacturer) => {
    const result = parseAddToCartRequest({ items: [{ mpn: "A", manufacturer, quantity: 1 }] });
    expect(result.ok && result.items[0].manufacturer).toBeNull();
  });
});
