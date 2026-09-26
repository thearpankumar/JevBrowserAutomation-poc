import { describe, expect, it, vi } from "vitest";
import { mapWithConcurrency } from "./concurrency.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("mapWithConcurrency", () => {
  it("returns an empty array for an empty input without calling the worker", async () => {
    const worker = vi.fn();
    const results = await mapWithConcurrency([], 3, worker);
    expect(results).toEqual([]);
    expect(worker).not.toHaveBeenCalled();
  });

  it("processes every item exactly once", async () => {
    const items = [1, 2, 3, 4, 5];
    const seen: number[] = [];
    await mapWithConcurrency(items, 2, async (item) => {
      seen.push(item);
    });
    expect(seen.sort()).toEqual(items);
  });

  it("preserves result order matching input order regardless of completion order", async () => {
    const items = [30, 10, 20];
    const results = await mapWithConcurrency(items, 3, async (item) => {
      await delay(item);
      return item;
    });
    expect(results.map((r) => (r.status === "fulfilled" ? r.value : null))).toEqual([30, 10, 20]);
  });

  it("never runs more than `limit` workers concurrently", async () => {
    let current = 0;
    let max = 0;
    const items = Array.from({ length: 10 }, (_, i) => i);

    await mapWithConcurrency(items, 3, async () => {
      current++;
      max = Math.max(max, current);
      await delay(5);
      current--;
    });

    expect(max).toBeLessThanOrEqual(3);
  });

  it("runs fully sequentially when limit is 1", async () => {
    let current = 0;
    let overlapped = false;
    const items = [1, 2, 3];

    await mapWithConcurrency(items, 1, async () => {
      current++;
      if (current > 1) overlapped = true;
      await delay(2);
      current--;
    });

    expect(overlapped).toBe(false);
  });

  it("clamps an oversized limit down to the item count without erroring", async () => {
    const items = [1, 2];
    const results = await mapWithConcurrency(items, 100, async (item) => item * 2);
    expect(results.map((r) => (r.status === "fulfilled" ? r.value : null))).toEqual([2, 4]);
  });

  it("isolates a rejected item — other items still complete and the call itself doesn't throw", async () => {
    const items = [1, 2, 3];
    const results = await mapWithConcurrency(items, 3, async (item) => {
      if (item === 2) throw new Error("boom");
      return item;
    });

    expect(results[0]).toEqual({ status: "fulfilled", value: 1 });
    expect(results[1].status).toBe("rejected");
    expect((results[1] as { status: "rejected"; reason: unknown }).reason).toBeInstanceOf(Error);
    expect(results[2]).toEqual({ status: "fulfilled", value: 3 });
  });

  it("invokes onItemSettled exactly once per item, with the matching index and outcome", async () => {
    const items = ["a", "b", "c"];
    const seen = new Map<number, string>();

    await mapWithConcurrency(
      items,
      2,
      async (item) => item.toUpperCase(),
      (index, settled) => {
        seen.set(index, settled.status === "fulfilled" ? settled.value : "ERR");
      }
    );

    expect(seen.size).toBe(3);
    expect(seen.get(0)).toBe("A");
    expect(seen.get(1)).toBe("B");
    expect(seen.get(2)).toBe("C");
  });

  it("reports a rejection to onItemSettled instead of throwing out of the pool", async () => {
    const calls: Array<"fulfilled" | "rejected"> = [];
    await mapWithConcurrency(
      [1],
      1,
      async () => {
        throw new Error("nope");
      },
      (_, settled) => calls.push(settled.status)
    );
    expect(calls).toEqual(["rejected"]);
  });
});
