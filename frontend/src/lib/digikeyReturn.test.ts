import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveDigikeyReturnState, takeDigikeyReturnState } from "./digikeyReturn";

beforeEach(() => {
  sessionStorage.clear();
});

describe("saveDigikeyReturnState / takeDigikeyReturnState", () => {
  it("round-trips a job id and its selection choices", () => {
    const choices = new Map([
      ["0:0", true],
      ["1:0", false],
    ]);

    saveDigikeyReturnState("batch_1", choices);
    const restored = takeDigikeyReturnState();

    expect(restored).not.toBeNull();
    expect(restored?.jobId).toBe("batch_1");
    expect([...(restored?.choices ?? [])]).toEqual([...choices]);
  });

  it("is one-shot — a second read after the first returns null", () => {
    saveDigikeyReturnState("batch_1", new Map());

    takeDigikeyReturnState();
    expect(takeDigikeyReturnState()).toBeNull();
  });

  it("returns null when nothing was saved", () => {
    expect(takeDigikeyReturnState()).toBeNull();
  });

  it("returns null and doesn't throw on corrupted storage", () => {
    sessionStorage.setItem("jev-digikey-return-state", "not json");
    expect(takeDigikeyReturnState()).toBeNull();
  });

  it("returns null on malformed but valid JSON (missing fields)", () => {
    sessionStorage.setItem("jev-digikey-return-state", JSON.stringify({ foo: "bar" }));
    expect(takeDigikeyReturnState()).toBeNull();
  });

  it("doesn't throw when sessionStorage access fails", () => {
    const getSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked");
    });

    expect(() => takeDigikeyReturnState()).not.toThrow();
    expect(takeDigikeyReturnState()).toBeNull();

    getSpy.mockRestore();
  });
});
