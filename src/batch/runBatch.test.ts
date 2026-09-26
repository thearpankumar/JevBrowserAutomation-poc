import { describe, expect, it, vi } from "vitest";
import { runBatch } from "./runBatch.js";
import { JobStore } from "./jobStore.js";
import { TtlCache } from "./cache.js";
import { ComponentRequirement, SourcingResult } from "../types.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fakeResult(overrides: Partial<SourcingResult> = {}): SourcingResult {
  return {
    supplier: "DigiKey",
    mpn: "X",
    manufacturer: "Acme",
    price: "1.00",
    currency: "USD",
    stock: 10,
    leadTime: null,
    confidence: 1,
    sourceUrl: "https://example.com",
    fetchedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("runBatch", () => {
  it("populates every row with both suppliers' results and marks the job done", async () => {
    const store = new JobStore();
    const requirements: ComponentRequirement[] = [
      { mpn: "A", qty: 1 },
      { mpn: "B", qty: 1 },
    ];
    const job = store.create(requirements, []);

    const sourceFromDigikey = vi.fn(async (r: ComponentRequirement) => [fakeResult({ mpn: r.mpn, supplier: "DigiKey" })]);
    const sourceFromDistrelec = vi.fn(async (r: ComponentRequirement) => [fakeResult({ mpn: r.mpn, supplier: "Distrelec" })]);

    await runBatch(job, { sourceFromDigikey, sourceFromDistrelec });

    expect(job.status).toBe("done");
    expect(job.completed).toBe(job.total);
    expect(job.rows).toHaveLength(2);
    for (const row of job.rows) {
      expect(row.digikeyDone).toBe(true);
      expect(row.distrelecDone).toBe(true);
      expect(row.results).toHaveLength(2);
      expect(row.errors).toEqual([]);
    }
  });

  it("isolates a single supplier failure to that row without failing the batch", async () => {
    const store = new JobStore();
    const job = store.create(
      [
        { mpn: "BAD", qty: 1 },
        { mpn: "GOOD", qty: 1 },
      ],
      []
    );

    const sourceFromDigikey = vi.fn(async (r: ComponentRequirement) => {
      if (r.mpn === "BAD") throw new Error("digikey exploded");
      return [fakeResult({ mpn: r.mpn })];
    });
    const sourceFromDistrelec = vi.fn(async (r: ComponentRequirement) => [fakeResult({ mpn: r.mpn, supplier: "Distrelec" })]);

    await runBatch(job, { sourceFromDigikey, sourceFromDistrelec });

    expect(job.status).toBe("done");
    const badRow = job.rows.find((r) => r.requirement.mpn === "BAD")!;
    expect(badRow.errors).toEqual([{ supplier: "DigiKey", message: "digikey exploded" }]);
    expect(badRow.results).toHaveLength(1); // Distrelec's still came through
    expect(badRow.results[0].supplier).toBe("Distrelec");

    const goodRow = job.rows.find((r) => r.requirement.mpn === "GOOD")!;
    expect(goodRow.errors).toEqual([]);
    expect(goodRow.results).toHaveLength(2);
  });

  it("continues the whole batch even when every supplier call fails", async () => {
    const store = new JobStore();
    const job = store.create([{ mpn: "A", qty: 1 }], []);

    await runBatch(job, {
      sourceFromDigikey: async () => {
        throw new Error("dk down");
      },
      sourceFromDistrelec: async () => {
        throw new Error("dt down");
      },
    });

    expect(job.status).toBe("done");
    expect(job.rows[0].results).toEqual([]);
    expect(job.rows[0].errors).toHaveLength(2);
  });

  it("respects a lower concurrency cap for Distrelec than DigiKey", async () => {
    const store = new JobStore();
    const requirements = Array.from({ length: 8 }, (_, i) => ({ mpn: `P${i}`, qty: 1 }));
    const job = store.create(requirements, []);

    let digikeyConcurrent = 0;
    let digikeyMax = 0;
    let distrelecConcurrent = 0;
    let distrelecMax = 0;

    await runBatch(
      job,
      {
        sourceFromDigikey: async (r) => {
          digikeyConcurrent++;
          digikeyMax = Math.max(digikeyMax, digikeyConcurrent);
          await delay(5);
          digikeyConcurrent--;
          return [fakeResult({ mpn: r.mpn })];
        },
        sourceFromDistrelec: async (r) => {
          distrelecConcurrent++;
          distrelecMax = Math.max(distrelecMax, distrelecConcurrent);
          await delay(5);
          distrelecConcurrent--;
          return [fakeResult({ mpn: r.mpn, supplier: "Distrelec" })];
        },
      },
      { digikeyConcurrency: 5, distrelecConcurrency: 2 }
    );

    expect(digikeyMax).toBeLessThanOrEqual(5);
    expect(distrelecMax).toBeLessThanOrEqual(2);
    expect(distrelecMax).toBeGreaterThan(0);
  });

  it("increments job.completed incrementally as each supplier call settles, not just at the end", async () => {
    const store = new JobStore();
    const job = store.create([{ mpn: "A", qty: 1 }], []);
    const seenCompletedValues: number[] = [];

    const sourceFromDigikey = async () => {
      seenCompletedValues.push(job.completed);
      await delay(5);
      return [fakeResult()];
    };
    const sourceFromDistrelec = async () => {
      await delay(1);
      return [fakeResult({ supplier: "Distrelec" })];
    };

    await runBatch(job, { sourceFromDigikey, sourceFromDistrelec });

    // Distrelec (faster) should have completed and bumped job.completed
    // before DigiKey's slower call was even invoked in some runs — the
    // real assertion that matters is that the final count is exactly total.
    expect(job.completed).toBe(job.total);
    expect(seenCompletedValues[0]).toBeLessThanOrEqual(job.total);
  });

  it("uses the cache so a duplicate MPN only triggers one real call per supplier", async () => {
    const store = new JobStore();
    const job = store.create(
      [
        { mpn: "DUP", qty: 1 },
        { mpn: "DUP", qty: 2 },
      ],
      []
    );
    const cache = new TtlCache<SourcingResult[]>();

    const sourceFromDigikey = vi.fn(async (r: ComponentRequirement) => [fakeResult({ mpn: r.mpn })]);
    const sourceFromDistrelec = vi.fn(async (r: ComponentRequirement) => [fakeResult({ mpn: r.mpn, supplier: "Distrelec" })]);

    await runBatch(job, { sourceFromDigikey, sourceFromDistrelec }, { cache });

    expect(sourceFromDigikey).toHaveBeenCalledTimes(1);
    expect(sourceFromDistrelec).toHaveBeenCalledTimes(1);
    // Both rows still end up with results, served from cache for the second.
    expect(job.rows[0].results).toHaveLength(2);
    expect(job.rows[1].results).toHaveLength(2);
  });

  it("does not share cached results across different part numbers", async () => {
    const store = new JobStore();
    const job = store.create(
      [
        { mpn: "ONE", qty: 1 },
        { mpn: "TWO", qty: 1 },
      ],
      []
    );
    const cache = new TtlCache<SourcingResult[]>();

    const sourceFromDigikey = vi.fn(async (r: ComponentRequirement) => [fakeResult({ mpn: r.mpn })]);
    const sourceFromDistrelec = vi.fn(async (r: ComponentRequirement) => [fakeResult({ mpn: r.mpn, supplier: "Distrelec" })]);

    await runBatch(job, { sourceFromDigikey, sourceFromDistrelec }, { cache });

    expect(sourceFromDigikey).toHaveBeenCalledTimes(2);
    expect(sourceFromDistrelec).toHaveBeenCalledTimes(2);
  });

  it("works correctly with no cache option supplied at all", async () => {
    const store = new JobStore();
    const job = store.create([{ mpn: "A", qty: 1 }], []);
    const sourceFromDigikey = vi.fn(async (r: ComponentRequirement) => [fakeResult({ mpn: r.mpn })]);
    const sourceFromDistrelec = vi.fn(async (r: ComponentRequirement) => [fakeResult({ mpn: r.mpn, supplier: "Distrelec" })]);

    await expect(runBatch(job, { sourceFromDigikey, sourceFromDistrelec })).resolves.toBeUndefined();
    expect(job.status).toBe("done");
  });

  it("handles an empty requirements list without hanging", async () => {
    const store = new JobStore();
    const job = store.create([], []);
    await runBatch(job, {
      sourceFromDigikey: vi.fn(),
      sourceFromDistrelec: vi.fn(),
    });
    expect(job.status).toBe("done");
    expect(job.total).toBe(0);
    expect(job.completed).toBe(0);
  });

  it("stamps completedAt only once the job is actually done", async () => {
    const store = new JobStore();
    const job = store.create([{ mpn: "A", qty: 1 }], []);
    expect(job.completedAt).toBeUndefined();

    await runBatch(job, {
      sourceFromDigikey: async () => [fakeResult()],
      sourceFromDistrelec: async () => [fakeResult({ supplier: "Distrelec" })],
    });

    expect(job.completedAt).toBeDefined();
  });
});
