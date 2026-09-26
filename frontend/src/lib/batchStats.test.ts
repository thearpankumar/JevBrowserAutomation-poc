import { describe, expect, it } from "vitest";
import { computeBatchStats } from "./batchStats";
import { makeJob, makeNotFound, makeResult, makeRow } from "../test/fixtures";

describe("computeBatchStats", () => {
  it("counts BOM lines in total, and results by confidence band", () => {
    const job = makeJob([
      makeRow("A", [makeResult({ confidence: 1 }), makeResult({ confidence: 0.97, supplier: "Distrelec" })]),
      makeRow("B", [makeResult({ confidence: 0.6 })]),
      makeRow("C", [makeResult({ confidence: 0.1 })]),
    ]);
    expect(computeBatchStats(job)).toEqual({ total: 3, accept: 2, review: 1, reject: 1, notFound: 0 });
  });

  it("counts a line as not found only once both suppliers have finished with nothing real", () => {
    const job = makeJob([makeRow("A", [makeNotFound(), makeNotFound({ supplier: "Distrelec" })])]);
    expect(computeBatchStats(job).notFound).toBe(1);
  });

  it("does not count a line as not found while a supplier is still checking", () => {
    const job = makeJob([makeRow("A", [makeNotFound()], 1, { distrelecDone: false })]);
    expect(computeBatchStats(job).notFound).toBe(0);
  });

  it("ignores not-found results on a line that also has a real match", () => {
    const job = makeJob([makeRow("A", [makeResult({ confidence: 1 }), makeNotFound({ supplier: "Distrelec" })])]);
    expect(computeBatchStats(job)).toEqual({ total: 1, accept: 1, review: 0, reject: 0, notFound: 0 });
  });

  it("handles an empty job", () => {
    expect(computeBatchStats(makeJob([]))).toEqual({ total: 0, accept: 0, review: 0, reject: 0, notFound: 0 });
  });
});
