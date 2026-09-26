import { describe, expect, it } from "vitest";
import { parseBomCsv, parseCsvRows } from "./parseCsv.js";

describe("parseCsvRows", () => {
  it("splits a simple comma-separated row", () => {
    expect(parseCsvRows("a,b,c\n")).toEqual([["a", "b", "c"]]);
  });

  it("handles multiple rows", () => {
    expect(parseCsvRows("a,b\nc,d\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("handles CRLF line endings", () => {
    expect(parseCsvRows("a,b\r\nc,d\r\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("does not add a phantom trailing row when the file ends with a newline", () => {
    expect(parseCsvRows("a,b\n")).toEqual([["a", "b"]]);
  });

  it("still returns the last row when the file has no trailing newline", () => {
    expect(parseCsvRows("a,b\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("keeps a comma inside a quoted field as part of that field", () => {
    expect(parseCsvRows('a,"b,c",d\n')).toEqual([["a", "b,c", "d"]]);
  });

  it("unescapes a doubled quote inside a quoted field", () => {
    expect(parseCsvRows('a,"say ""hi""",c\n')).toEqual([["a", 'say "hi"', "c"]]);
  });

  it("keeps a newline inside a quoted field as part of that field", () => {
    expect(parseCsvRows('a,"line1\nline2",c\n')).toEqual([["a", "line1\nline2", "c"]]);
  });

  it("produces empty-string fields for consecutive commas", () => {
    expect(parseCsvRows("a,,c\n")).toEqual([["a", "", "c"]]);
  });
});

describe("parseBomCsv", () => {
  it("parses a well-formed BOM with all three columns", () => {
    const csv = "MPN,Package,Qty\nSTM32F407VGT6,LQFP100,25\nLM358P,,100\n";
    const { requirements, rowErrors } = parseBomCsv(csv);

    expect(rowErrors).toEqual([]);
    expect(requirements).toEqual([
      { mpn: "STM32F407VGT6", package: "LQFP100", qty: 25 },
      { mpn: "LM358P", package: undefined, qty: 100 },
    ]);
  });

  it("recognizes common header aliases case-insensitively", () => {
    const csv = "Part Number,Package Type,Quantity Required\nRC0805FR-071KL,0805,500\n";
    const { requirements, rowErrors } = parseBomCsv(csv);

    expect(rowErrors).toEqual([]);
    expect(requirements).toEqual([{ mpn: "RC0805FR-071KL", package: "0805", qty: 500 }]);
  });

  it("defaults qty to 1 when there is no qty column at all", () => {
    const csv = "MPN\nATMEGA328P-PU\n";
    const { requirements } = parseBomCsv(csv);
    expect(requirements).toEqual([{ mpn: "ATMEGA328P-PU", package: undefined, qty: 1 }]);
  });

  it("defaults qty to 1 when the qty cell is present but blank", () => {
    const csv = "MPN,Qty\nATMEGA328P-PU,\n";
    const { requirements } = parseBomCsv(csv);
    expect(requirements[0].qty).toBe(1);
  });

  it("defaults qty to 1 when the qty cell is non-numeric", () => {
    const csv = "MPN,Qty\nATMEGA328P-PU,lots\n";
    const { requirements } = parseBomCsv(csv);
    expect(requirements[0].qty).toBe(1);
  });

  it("defaults qty to 1 when the qty cell is zero or negative", () => {
    const csv = "MPN,Qty\nA,0\nB,-5\n";
    const { requirements } = parseBomCsv(csv);
    expect(requirements.map((r) => r.qty)).toEqual([1, 1]);
  });

  it("leaves package undefined when there is no package column", () => {
    const csv = "MPN,Qty\nATMEGA328P-PU,10\n";
    const { requirements } = parseBomCsv(csv);
    expect(requirements[0].package).toBeUndefined();
  });

  it("treats a whitespace-only package cell as absent", () => {
    const csv = "MPN,Package\nATMEGA328P-PU,   \n";
    const { requirements } = parseBomCsv(csv);
    expect(requirements[0].package).toBeUndefined();
  });

  it("reports a missing part number as a row error and skips that row, but keeps the rest", () => {
    const csv = "MPN,Qty\nSTM32F407VGT6,1\n,5\nLM358P,2\n";
    const { requirements, rowErrors } = parseBomCsv(csv);

    expect(requirements.map((r) => r.mpn)).toEqual(["STM32F407VGT6", "LM358P"]);
    expect(rowErrors).toEqual([{ row: 3, message: "Missing part number — row skipped." }]);
  });

  it("treats a whitespace-only single-column row as a blank line, not a data row", () => {
    // With only one column, "   " is indistinguishable from a blank line —
    // skipped silently rather than reported as a missing-part-number error.
    const csv = "MPN\n   \nSTM32F407VGT6\n";
    const { requirements, rowErrors } = parseBomCsv(csv);
    expect(requirements.map((r) => r.mpn)).toEqual(["STM32F407VGT6"]);
    expect(rowErrors).toEqual([]);
  });

  it("reports a whitespace-only part number as missing when other columns make the row clearly non-blank", () => {
    const csv = "MPN,Qty\n   ,5\nSTM32F407VGT6,1\n";
    const { requirements, rowErrors } = parseBomCsv(csv);
    expect(requirements.map((r) => r.mpn)).toEqual(["STM32F407VGT6"]);
    expect(rowErrors).toEqual([{ row: 2, message: "Missing part number — row skipped." }]);
  });

  it("allows duplicate part numbers — de-duping is the batch runner's job, not parsing's", () => {
    const csv = "MPN\nSTM32F407VGT6\nSTM32F407VGT6\n";
    const { requirements } = parseBomCsv(csv);
    expect(requirements).toHaveLength(2);
  });

  it("skips blank lines within the file", () => {
    const csv = "MPN\nSTM32F407VGT6\n\nLM358P\n";
    const { requirements, rowErrors } = parseBomCsv(csv);
    expect(requirements.map((r) => r.mpn)).toEqual(["STM32F407VGT6", "LM358P"]);
    expect(rowErrors).toEqual([]);
  });

  it("ignores columns it doesn't recognize", () => {
    const csv = 'MPN,Description,Qty\nSTM32F407VGT6,"32-bit MCU, ARM Cortex-M4",3\n';
    const { requirements, rowErrors } = parseBomCsv(csv);
    expect(rowErrors).toEqual([]);
    expect(requirements).toEqual([{ mpn: "STM32F407VGT6", package: undefined, qty: 3 }]);
  });

  it("passes unicode part numbers through unchanged", () => {
    const csv = "MPN\nRÉSISTANCE-µ100\n";
    const { requirements } = parseBomCsv(csv);
    expect(requirements[0].mpn).toBe("RÉSISTANCE-µ100");
  });

  it("returns a file-level error when the file is empty", () => {
    const { requirements, rowErrors } = parseBomCsv("");
    expect(requirements).toEqual([]);
    expect(rowErrors).toEqual([{ row: 0, message: "The file is empty." }]);
  });

  it("returns a file-level error when only whitespace/blank lines are present", () => {
    const { requirements, rowErrors } = parseBomCsv("\n\n   \n");
    expect(requirements).toEqual([]);
    expect(rowErrors.length).toBeGreaterThan(0);
  });

  it("returns a clear file-level error when there is no recognizable part-number column", () => {
    const csv = "Description,Qty\nsomething,5\n";
    const { requirements, rowErrors } = parseBomCsv(csv);
    expect(requirements).toEqual([]);
    expect(rowErrors).toHaveLength(1);
    expect(rowErrors[0].message).toMatch(/no part-number column/i);
  });

  it("handles a header-only file (no data rows) as zero requirements with no errors", () => {
    const { requirements, rowErrors } = parseBomCsv("MPN,Qty\n");
    expect(requirements).toEqual([]);
    expect(rowErrors).toEqual([]);
  });

  it("handles ragged rows shorter than the header without throwing", () => {
    const csv = "MPN,Package,Qty\nSTM32F407VGT6\n";
    const { requirements } = parseBomCsv(csv);
    expect(requirements).toEqual([{ mpn: "STM32F407VGT6", package: undefined, qty: 1 }]);
  });

  it("gives a clear, specific error for a real .xlsx file instead of dumping binary garbage", () => {
    // What a browser's FileReader.readAsText() actually produces for a real
    // .xlsx (a ZIP file) — starts with the ZIP magic bytes as raw text.
    const fakeXlsxAsText = "PK\u0003\u0004\u0014\u0000\u0000\u0000\u0000\u0000xl/worksheets/sheet1.xml";
    const { requirements, rowErrors } = parseBomCsv(fakeXlsxAsText);
    expect(requirements).toEqual([]);
    expect(rowErrors).toHaveLength(1);
    expect(rowErrors[0].message).toMatch(/doesn't look like a csv/i);
    expect(rowErrors[0].message).not.toContain("PK\u0003\u0004");
  });

  it("gives the same clear error for other binary content (invalid UTF-8 / control bytes), not just .xlsx", () => {
    const binaryGarbage = "��\u0001\u0002random binary junk";
    const { requirements, rowErrors } = parseBomCsv(binaryGarbage);
    expect(requirements).toEqual([]);
    expect(rowErrors[0].message).toMatch(/doesn't look like a csv/i);
  });

  it("does not misfire the binary-file check on ordinary CSV content (including tabs and newlines in the header)", () => {
    const csv = "MPN,Package,Qty\nSTM32F407VGT6,LQFP100,25\n";
    const { rowErrors } = parseBomCsv(csv);
    expect(rowErrors).toEqual([]);
  });
});
