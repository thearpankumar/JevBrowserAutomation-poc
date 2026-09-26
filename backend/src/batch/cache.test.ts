import { describe, expect, it } from "vitest";
import { TtlCache, normalizeCacheKey } from "./cache.js";

describe("TtlCache", () => {
  it("returns undefined for a key that was never set", () => {
    const cache = new TtlCache<string>();
    expect(cache.get("missing")).toBeUndefined();
  });

  it("round-trips a set value", () => {
    const cache = new TtlCache<string>();
    cache.set("k", "v");
    expect(cache.get("k")).toBe("v");
  });

  it("overwrites an existing value on a second set", () => {
    const cache = new TtlCache<string>();
    cache.set("k", "first");
    cache.set("k", "second");
    expect(cache.get("k")).toBe("second");
  });

  it("expires a value once the TTL has passed", () => {
    let now = 1000;
    const cache = new TtlCache<string>(500, () => now);
    cache.set("k", "v");
    now += 501;
    expect(cache.get("k")).toBeUndefined();
  });

  it("still returns the value just before the TTL expires", () => {
    let now = 1000;
    const cache = new TtlCache<string>(500, () => now);
    cache.set("k", "v");
    now += 499;
    expect(cache.get("k")).toBe("v");
  });

  it("holds distinct keys independently", () => {
    const cache = new TtlCache<number>();
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.get("a")).toBe(1);
    expect(cache.get("b")).toBe(2);
  });
});

describe("normalizeCacheKey", () => {
  it("combines supplier and mpn with a colon", () => {
    expect(normalizeCacheKey("DigiKey", "STM32F407VGT6")).toBe("DigiKey:stm32f407vgt6");
  });

  it("is case-insensitive on the mpn", () => {
    expect(normalizeCacheKey("Distrelec", "abc123")).toBe(normalizeCacheKey("Distrelec", "ABC123"));
  });

  it("trims surrounding whitespace on the mpn", () => {
    expect(normalizeCacheKey("DigiKey", "  ABC123  ")).toBe(normalizeCacheKey("DigiKey", "ABC123"));
  });

  it("keeps different suppliers for the same mpn as different keys", () => {
    expect(normalizeCacheKey("DigiKey", "ABC123")).not.toBe(normalizeCacheKey("Distrelec", "ABC123"));
  });
});
