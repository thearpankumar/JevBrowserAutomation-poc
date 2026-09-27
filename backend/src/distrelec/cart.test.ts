import { describe, expect, it, vi } from "vitest";
import { addItemsToDistrelecCart } from "./cart.js";
import type { DistrelecSession } from "./session.js";

const SESSION: DistrelecSession = { accessToken: "test-token", expiresAt: Date.now() + 60_000 };

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, statusText: ok ? "OK" : "Error", json: async () => body, text: async () => JSON.stringify(body) };
}

function reviewResponse(overrides: Record<string, unknown> = {}) {
  return {
    matchingProducts: [],
    duplicateMpnProducts: [],
    unavailableProducts: [],
    notMatchingProductCodes: [],
    ...overrides,
  };
}

const MATCH = { productCode: "30402232", quantity: 2, reference: "STMicroelectronics", searchTerm: "STM32F407VGT6" };

describe("addItemsToDistrelecCart", () => {
  it("reviews the BOM, reuses an existing cart, and adds the matched items to it", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(reviewResponse({ matchingProducts: [MATCH] })))
      .mockResolvedValueOnce(jsonResponse({ carts: [{ code: "007IOBBW" }] })) // GET carts
      .mockResolvedValueOnce(jsonResponse({})); // bulk add

    const result = await addItemsToDistrelecCart(SESSION, [{ mpn: "STM32F407VGT6", manufacturer: "STMicroelectronics", quantity: 2 }], {
      fetchImpl,
    });

    expect(result).toEqual({ cartCode: "007IOBBW", addedCount: 1, skipped: [] });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("sends the CSV review body as 'quantity, mpn, reference' with the manufacturer as reference", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(reviewResponse()))
      .mockResolvedValueOnce(jsonResponse({ carts: [] }));
    await addItemsToDistrelecCart(
      SESSION,
      [
        { mpn: "STM32F407VGT6", manufacturer: "STMicroelectronics", quantity: 2 },
        { mpn: "RC0805FR-071KL", manufacturer: "YAGEO", quantity: 500 },
      ],
      { fetchImpl }
    );

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.distrelec.com/rest/v2/distrelec_CH/bom-tool/current/review?lang=en&curr=CHF&channel=B2C&country=CH");
    expect(init.headers.Authorization).toBe("Bearer test-token");
    expect(init.headers["Content-Type"]).toBe("text/csv");
    expect(init.body).toBe("2, STM32F407VGT6, STMicroelectronics\n500, RC0805FR-071KL, YAGEO");
  });

  it("falls back to the MPN itself as reference when no manufacturer is given", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse(reviewResponse()));
    await addItemsToDistrelecCart(SESSION, [{ mpn: "STM32F407VGT6", quantity: 1 }], { fetchImpl });

    expect(fetchImpl.mock.calls[0][1].body).toBe("1, STM32F407VGT6, STM32F407VGT6");
  });

  it("creates a new cart when the person has none yet", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(reviewResponse({ matchingProducts: [MATCH] })))
      .mockResolvedValueOnce(jsonResponse({ carts: [] })) // GET carts — none
      .mockResolvedValueOnce(jsonResponse({ code: "NEWCART1" }, true, 201)) // POST create
      .mockResolvedValueOnce(jsonResponse({})); // bulk add

    const result = await addItemsToDistrelecCart(SESSION, [{ mpn: "STM32F407VGT6", quantity: 1 }], { fetchImpl });

    expect(result.cartCode).toBe("NEWCART1");
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(fetchImpl.mock.calls[2][1].method).toBe("POST");
  });

  it("reports an ambiguous (duplicate-MPN) item as skipped, without adding it, and doesn't touch the cart if nothing else matched", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(reviewResponse({ duplicateMpnProducts: [{ searchTerm: "RC0805FR-071KL", mpn: "RC0805FR-071KL" }] }))
      );

    const result = await addItemsToDistrelecCart(SESSION, [{ mpn: "RC0805FR-071KL", quantity: 5 }], { fetchImpl });

    expect(result).toEqual({ cartCode: null, addedCount: 0, skipped: [{ mpn: "RC0805FR-071KL", reason: "ambiguous" }] });
    expect(fetchImpl).toHaveBeenCalledTimes(1); // review only — no cart lookup/creation for zero matches
  });

  it("reports an MPN Distrelec doesn't recognize at all as not_found, by elimination", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(reviewResponse({ matchingProducts: [MATCH] })))
      .mockResolvedValueOnce(jsonResponse({ carts: [{ code: "007IOBBW" }] }))
      .mockResolvedValueOnce(jsonResponse({}));

    const result = await addItemsToDistrelecCart(
      SESSION,
      [
        { mpn: "STM32F407VGT6", quantity: 2 },
        { mpn: "TOTALLYFAKEPART999", quantity: 1 },
      ],
      { fetchImpl }
    );

    expect(result.skipped).toEqual([{ mpn: "TOTALLYFAKEPART999", reason: "not_found" }]);
  });

  it("mixes matched, ambiguous, and not-found items in one request correctly", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          reviewResponse({
            matchingProducts: [MATCH],
            duplicateMpnProducts: [{ searchTerm: "RC0805FR-071KL" }],
          })
        )
      )
      .mockResolvedValueOnce(jsonResponse({ carts: [{ code: "007IOBBW" }] }))
      .mockResolvedValueOnce(jsonResponse({}));

    const result = await addItemsToDistrelecCart(
      SESSION,
      [
        { mpn: "STM32F407VGT6", quantity: 2 },
        { mpn: "RC0805FR-071KL", quantity: 5 },
        { mpn: "TOTALLYFAKEPART999", quantity: 1 },
      ],
      { fetchImpl }
    );

    expect(result.addedCount).toBe(1);
    expect(result.skipped).toEqual(
      expect.arrayContaining([
        { mpn: "RC0805FR-071KL", reason: "ambiguous" },
        { mpn: "TOTALLYFAKEPART999", reason: "not_found" },
      ])
    );
  });

  it("logs a warning and skips an entry with no recognizable MPN field, rather than crashing", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse(reviewResponse({ duplicateMpnProducts: [{ somethingElse: true }] })));

    const result = await addItemsToDistrelecCart(SESSION, [{ mpn: "A", quantity: 1 }], { fetchImpl });

    // The unrecognized duplicate entry is dropped, but "A" itself still shows up as not_found by elimination.
    expect(result.skipped).toEqual([{ mpn: "A", reason: "not_found" }]);
  });

  it("sends itemNumber, productCode, quantity, and reference for each matched product in the bulk request", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(reviewResponse({ matchingProducts: [MATCH] })))
      .mockResolvedValueOnce(jsonResponse({ carts: [{ code: "007IOBBW" }] }))
      .mockResolvedValueOnce(jsonResponse({}));

    await addItemsToDistrelecCart(SESSION, [{ mpn: "STM32F407VGT6", quantity: 2 }], { fetchImpl });

    const [url, init] = fetchImpl.mock.calls[2];
    expect(url).toBe(
      "https://api.distrelec.com/rest/v2/distrelec_CH/users/current/carts/007IOBBW/bulk?lang=en&curr=CHF&channel=B2C&country=CH"
    );
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      products: [{ itemNumber: "1", productCode: "30402232", quantity: 2, reference: "STMicroelectronics" }],
      addedFrom: "bom",
    });
  });

  it("throws with the response body when the review call fails", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ error: "bad request" }, false, 400));
    await expect(addItemsToDistrelecCart(SESSION, [{ mpn: "A", quantity: 1 }], { fetchImpl })).rejects.toThrow(/BOM review failed/);
  });

  it("throws when cart creation fails", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(reviewResponse({ matchingProducts: [MATCH] })))
      .mockResolvedValueOnce(jsonResponse({ carts: [] }))
      .mockResolvedValueOnce(jsonResponse({ error: "server error" }, false, 500));

    await expect(addItemsToDistrelecCart(SESSION, [{ mpn: "STM32F407VGT6", quantity: 1 }], { fetchImpl })).rejects.toThrow(
      /cart creation failed/
    );
  });

  it("throws when the bulk add call fails", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(reviewResponse({ matchingProducts: [MATCH] })))
      .mockResolvedValueOnce(jsonResponse({ carts: [{ code: "007IOBBW" }] }))
      .mockResolvedValueOnce(jsonResponse({ error: "boom" }, false, 502));

    await expect(addItemsToDistrelecCart(SESSION, [{ mpn: "STM32F407VGT6", quantity: 1 }], { fetchImpl })).rejects.toThrow(
      /add-to-cart failed/
    );
  });
});
