import { describe, expect, it } from "vitest";
import type { Supplier } from "@jev/shared";
import {
  allSelectableKeys,
  computeSelectionSummary,
  confidenceBadge,
  defaultSelectedKeys,
  isNotFoundResult,
  resolveSelectedKeys,
  rowKey,
  selectedItemsForSupplier,
} from "./selection";
import { makeJob, makeNotFound, makeResult, makeRow } from "../test/fixtures";

describe("isNotFoundResult", () => {
  it("is true when manufacturer, price, and sourceUrl are all null", () => {
    expect(isNotFoundResult(makeNotFound())).toBe(true);
  });

  it("is false when any of those fields is present", () => {
    expect(isNotFoundResult(makeResult())).toBe(false);
    expect(isNotFoundResult(makeResult({ manufacturer: null, price: null }))).toBe(false); // sourceUrl still set
  });
});

describe("confidenceBadge", () => {
  it("labels >=0.85 as a confirmed match", () => {
    expect(confidenceBadge(0.85)).toEqual({ cls: "accept", label: "Confirmed match" });
    expect(confidenceBadge(1)).toEqual({ cls: "accept", label: "Confirmed match" });
  });

  it("labels 0.4-0.849 as needing review", () => {
    expect(confidenceBadge(0.4)).toEqual({ cls: "review", label: "Needs review" });
    expect(confidenceBadge(0.84)).toEqual({ cls: "review", label: "Needs review" });
  });

  it("labels below 0.4 as a weak match", () => {
    expect(confidenceBadge(0.39)).toEqual({ cls: "reject", label: "Weak match" });
    expect(confidenceBadge(0)).toEqual({ cls: "reject", label: "Weak match" });
  });
});

describe("rowKey", () => {
  it("combines row and result index with a colon", () => {
    expect(rowKey(2, 1)).toBe("2:1");
  });

  it("is distinct for different row/result pairs", () => {
    expect(rowKey(0, 1)).not.toBe(rowKey(1, 0));
  });
});

describe("defaultSelectedKeys", () => {
  it("pre-selects only confirmed-match (>=0.85) real results", () => {
    const job = makeJob([
      makeRow("A", [makeResult({ confidence: 0.97 }), makeResult({ confidence: 0.5, supplier: "Distrelec" })]),
      makeRow("B", [makeResult({ confidence: 0.2 })]),
    ]);
    expect(defaultSelectedKeys(job)).toEqual(["0:0"]);
  });

  it("never pre-selects a not-found result", () => {
    expect(defaultSelectedKeys(makeJob([makeRow("A", [makeNotFound()])]))).toEqual([]);
  });

  it("returns an empty array when there are no rows", () => {
    expect(defaultSelectedKeys(makeJob([]))).toEqual([]);
  });

  it("returns an empty array when no result meets the confirmed-match threshold", () => {
    const job = makeJob([makeRow("A", [makeResult({ confidence: 0.5 }), makeResult({ confidence: 0.1 })])]);
    expect(defaultSelectedKeys(job)).toEqual([]);
  });
});

describe("allSelectableKeys", () => {
  it("includes every real result regardless of confidence", () => {
    const job = makeJob([makeRow("A", [makeResult({ confidence: 0.97 }), makeResult({ confidence: 0.1, supplier: "Distrelec" })])]);
    expect(allSelectableKeys(job)).toEqual(["0:0", "0:1"]);
  });

  it("excludes not-found results", () => {
    expect(allSelectableKeys(makeJob([makeRow("A", [makeResult(), makeNotFound()])]))).toEqual(["0:0"]);
  });
});

describe("resolveSelectedKeys", () => {
  const job = makeJob([
    makeRow("A", [makeResult({ confidence: 0.97 }), makeResult({ confidence: 0.5, supplier: "Distrelec" })]),
    makeRow("B", [makeNotFound()]),
    makeRow("C", [makeResult({ confidence: 0.9 })]),
  ]);

  it("with no choices, matches the confirmed-match defaults", () => {
    expect(resolveSelectedKeys(job, new Map())).toEqual(defaultSelectedKeys(job));
  });

  it("an explicit uncheck overrides a confirmed-match default", () => {
    expect(resolveSelectedKeys(job, new Map([["0:0", false]]))).toEqual(["2:0"]);
  });

  it("an explicit check selects a result that isn't selected by default", () => {
    expect(resolveSelectedKeys(job, new Map([["0:1", true]]))).toEqual(["0:0", "0:1", "2:0"]);
  });

  it("never selects a not-found result, even if a choice says so", () => {
    expect(resolveSelectedKeys(job, new Map([["1:0", true]]))).not.toContain("1:0");
  });

  it("a result that arrives later (not in choices yet) gets its default, without disturbing earlier choices", () => {
    const before = makeJob([makeRow("A", [makeResult({ confidence: 0.97 })])]);
    const choices = new Map([["0:0", false]]);
    expect(resolveSelectedKeys(before, choices)).toEqual([]);

    const after = makeJob([...before.rows, makeRow("B", [makeResult({ confidence: 0.95 })])]);
    expect(resolveSelectedKeys(after, choices)).toEqual(["1:0"]);
  });

  it("ignores choices for keys that don't exist in the job", () => {
    expect(resolveSelectedKeys(job, new Map([["9:9", true]]))).toEqual(defaultSelectedKeys(job));
  });
});

describe("computeSelectionSummary", () => {
  it("counts and sums only the selected keys, split by supplier", () => {
    const job = makeJob([
      makeRow("A", [makeResult({ price: "10.00" }), makeResult({ price: "20.00", supplier: "Distrelec", currency: "CHF" })]),
      makeRow("B", [makeResult({ price: "5.00" })]),
    ]);

    const summary = computeSelectionSummary(job, ["0:0", "0:1"]); // B's DigiKey row (1:0) NOT selected

    expect(summary.DigiKey).toEqual({ count: 1, subtotal: 10, currency: "USD" });
    expect(summary.Distrelec).toEqual({ count: 1, subtotal: 20, currency: "CHF" });
  });

  it("returns zeroed buckets for an empty selection", () => {
    const summary = computeSelectionSummary(makeJob([makeRow("A", [makeResult()])]), []);
    expect(summary.DigiKey).toEqual({ count: 0, subtotal: 0, currency: null });
    expect(summary.Distrelec).toEqual({ count: 0, subtotal: 0, currency: null });
  });

  it("ignores a selected key that points at a not-found result", () => {
    expect(computeSelectionSummary(makeJob([makeRow("A", [makeNotFound()])]), ["0:0"]).DigiKey.count).toBe(0);
  });

  it("treats a missing/unparseable price as 0 rather than throwing or producing NaN", () => {
    const summary = computeSelectionSummary(makeJob([makeRow("A", [makeResult({ price: "n/a" })])]), ["0:0"]);
    expect(summary.DigiKey.subtotal).toBe(0);
  });

  it("sums multiple selected items for the same supplier correctly", () => {
    const job = makeJob([
      makeRow("A", [makeResult({ price: "10.00" })]),
      makeRow("B", [makeResult({ price: "15.50" })]),
      makeRow("C", [makeResult({ price: "4.49" })]),
    ]);
    const summary = computeSelectionSummary(job, ["0:0", "1:0", "2:0"]);
    expect(summary.DigiKey.count).toBe(3);
    expect(summary.DigiKey.subtotal).toBeCloseTo(29.99, 2);
  });

  it("accepts a Set as well as an array of keys", () => {
    const job = makeJob([makeRow("A", [makeResult({ price: "1.00" })])]);
    expect(computeSelectionSummary(job, new Set(["0:0"])).DigiKey.count).toBe(1);
  });

  it("ignores a supplier the summary doesn't track (defensive — shouldn't happen with real data)", () => {
    const job = makeJob([makeRow("A", [makeResult({ supplier: "SomeOtherSupplier" as Supplier })])]);
    const summary = computeSelectionSummary(job, ["0:0"]);
    expect(summary.DigiKey.count).toBe(0);
    expect(summary.Distrelec.count).toBe(0);
  });
});

describe("selectedItemsForSupplier", () => {
  it("returns mpn, manufacturer, and the row's requested qty for each selected result of that supplier", () => {
    const job = makeJob([makeRow("STM32F407VGT6", [makeResult({ manufacturer: "STMicroelectronics" })], 25)]);
    expect(selectedItemsForSupplier(job, ["0:0"], "DigiKey")).toEqual([
      { mpn: "STM32F407VGT6", manufacturer: "STMicroelectronics", quantity: 25 },
    ]);
  });

  it("excludes results from a different supplier even if selected", () => {
    expect(selectedItemsForSupplier(makeJob([makeRow("A", [makeResult({ supplier: "Distrelec" })])]), ["0:0"], "DigiKey")).toEqual([]);
  });

  it("excludes unselected results even for the matching supplier", () => {
    expect(selectedItemsForSupplier(makeJob([makeRow("A", [makeResult()])]), [], "DigiKey")).toEqual([]);
  });

  it("excludes a not-found result even if its key is (incorrectly) in the selection", () => {
    expect(selectedItemsForSupplier(makeJob([makeRow("A", [makeNotFound()])]), ["0:0"], "DigiKey")).toEqual([]);
  });

  it("collects selected items across multiple rows for the same supplier", () => {
    const job = makeJob([makeRow("A", [makeResult()], 2), makeRow("B", [makeResult()], 3)]);
    expect(selectedItemsForSupplier(job, ["0:0", "1:0"], "DigiKey")).toEqual([
      { mpn: "A", manufacturer: "STMicroelectronics", quantity: 2 },
      { mpn: "B", manufacturer: "STMicroelectronics", quantity: 3 },
    ]);
  });
});
