import { describe, expect, it } from "vitest";
import { buildResultsCsv } from "./exportCsv.js";
import { SourcingResult } from "../types.js";

function result(overrides: Partial<SourcingResult> = {}): SourcingResult {
  return {
    supplier: "DigiKey",
    mpn: "STM32F407VGT6",
    manufacturer: "STMicroelectronics",
    price: "12.34",
    currency: "USD",
    stock: 500,
    leadTime: null,
    confidence: 1.0,
    sourceUrl: "https://example.com/product",
    fetchedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildResultsCsv", () => {
  it("writes a header row followed by one data row per result", () => {
    const csv = buildResultsCsv([{ requirement: { mpn: "STM32F407VGT6", qty: 1 }, results: [result()] }]);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("Part Number,Supplier,Manufacturer,Price,Currency,Stock,Confidence,Status,Source URL");
    expect(lines[1]).toBe("STM32F407VGT6,DigiKey,STMicroelectronics,12.34,USD,500,1,Confirmed match,https://example.com/product");
  });

  it("writes a single 'Not found' row when a part has zero results", () => {
    const csv = buildResultsCsv([{ requirement: { mpn: "UNOBTAINIUM-1", qty: 1 }, results: [] }]);
    const lines = csv.trim().split("\r\n");
    expect(lines[1]).toBe("UNOBTAINIUM-1,,,,,,,Not found,");
  });

  it("emits one row per manufacturer when a part matched several", () => {
    const csv = buildResultsCsv([
      {
        requirement: { mpn: "ATMEGA328P-PU", qty: 1 },
        results: [result({ manufacturer: "Microchip" }), result({ manufacturer: "Atmel" })],
      },
    ]);
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("Microchip");
    expect(lines[2]).toContain("Atmel");
  });

  it("labels confidence bands the same as the UI's badges", () => {
    const csv = buildResultsCsv([
      { requirement: { mpn: "A", qty: 1 }, results: [result({ confidence: 0.9 })] },
      { requirement: { mpn: "B", qty: 1 }, results: [result({ confidence: 0.6 })] },
      { requirement: { mpn: "C", qty: 1 }, results: [result({ confidence: 0.1 })] },
    ]);
    const lines = csv.trim().split("\r\n").slice(1);
    expect(lines[0]).toContain("Confirmed match");
    expect(lines[1]).toContain("Needs review");
    expect(lines[2]).toContain("Weak match");
  });

  it("quotes a field containing a comma", () => {
    const csv = buildResultsCsv([{ requirement: { mpn: "A", qty: 1 }, results: [result({ manufacturer: "Acme, Inc." })] }]);
    expect(csv).toContain('"Acme, Inc."');
  });

  it("escapes an embedded quote by doubling it", () => {
    const csv = buildResultsCsv([{ requirement: { mpn: "A", qty: 1 }, results: [result({ manufacturer: 'The "Best" Co' })] }]);
    expect(csv).toContain('"The ""Best"" Co"');
  });

  it("handles an entirely empty batch", () => {
    const csv = buildResultsCsv([]);
    expect(csv.trim()).toBe("Part Number,Supplier,Manufacturer,Price,Currency,Stock,Confidence,Status,Source URL");
  });

  it("ends every line with CRLF (Excel-friendly)", () => {
    const csv = buildResultsCsv([{ requirement: { mpn: "A", qty: 1 }, results: [result()] }]);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv).not.toContain("\n\n");
  });
});
