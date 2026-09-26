import { describe, expect, it } from "vitest";
import { formatPrice, formatRowError, formatStock, formatSubtotal } from "./format";

describe("formatRowError", () => {
  it("prefixes a real row number", () => {
    expect(formatRowError({ row: 3, message: "Missing part number — row skipped." })).toBe("Row 3: Missing part number — row skipped.");
  });

  it("shows a whole-file error (row 0) without a row prefix", () => {
    expect(formatRowError({ row: 0, message: "This doesn't look like a CSV file." })).toBe("This doesn't look like a CSV file.");
  });
});

describe("formatPrice", () => {
  it("prefixes the currency when there is one", () => {
    expect(formatPrice({ price: "14.64", currency: "USD" })).toBe("USD 14.64");
  });

  it("shows the bare price when the currency is unknown", () => {
    expect(formatPrice({ price: "14.64", currency: null })).toBe("14.64");
  });

  it("shows a dash when there is no price", () => {
    expect(formatPrice({ price: null, currency: "USD" })).toBe("—");
  });
});

describe("formatStock", () => {
  it("shows a real zero as 0, not a dash", () => {
    expect(formatStock(0)).toBe("0");
  });

  it("shows a dash when stock is unknown", () => {
    expect(formatStock(null)).toBe("—");
  });
});

describe("formatSubtotal", () => {
  it("formats to two decimals with an approximate marker and currency", () => {
    expect(formatSubtotal(29.99, "USD")).toBe("~USD 29.99");
    expect(formatSubtotal(40.2, "CHF")).toBe("~CHF 40.20");
  });

  it("omits the currency when unknown", () => {
    expect(formatSubtotal(3, null)).toBe("~3.00");
  });
});
