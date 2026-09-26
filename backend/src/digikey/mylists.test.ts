import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addItemsToDigikeyCart } from "./mylists.js";

const REQUIRED_ENV = { OPENROUTER_JEV_API: "x", DIGIKEY_CLIENT_ID: "test-client-id", DIGIKEY_CLIENT_SECRET: "y" };
const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of Object.keys(REQUIRED_ENV)) originalEnv[key] = process.env[key];
  Object.assign(process.env, REQUIRED_ENV);
});

afterEach(() => {
  for (const key of Object.keys(REQUIRED_ENV)) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, statusText: ok ? "OK" : "Error", json: async () => body, text: async () => JSON.stringify(body) };
}

describe("addItemsToDigikeyCart", () => {
  it("creates a list, then posts the selected items to it, and returns the list id + added identifiers", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ListId: "list-123" }))
      .mockResolvedValueOnce(jsonResponse(["part-1", "part-2"]));

    const result = await addItemsToDigikeyCart(
      "access-token",
      [
        { mpn: "STM32F407VGT6", manufacturer: "STMicroelectronics", quantity: 25 },
        { mpn: "RC0805FR-071KL", manufacturer: "YAGEO", quantity: 500 },
      ],
      { fetchImpl }
    );

    expect(result).toEqual({ listId: "list-123", addedIdentifiers: ["part-1", "part-2"] });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("sends the correct auth headers on the create-list call", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ListId: "l1" }))
      .mockResolvedValueOnce(jsonResponse([]));
    await addItemsToDigikeyCart("my-token", [{ mpn: "A", quantity: 1 }], { fetchImpl });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.digikey.com/mylists/v1/lists");
    expect(init.headers.Authorization).toBe("Bearer my-token");
    expect(init.headers["X-DIGIKEY-Client-Id"]).toBe("test-client-id");
  });

  it("posts to the correct add-parts URL for the created list id", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ListId: "abc-999" }))
      .mockResolvedValueOnce(jsonResponse([]));
    await addItemsToDigikeyCart("token", [{ mpn: "A", quantity: 1 }], { fetchImpl });

    const [url] = fetchImpl.mock.calls[1];
    expect(url).toBe("https://api.digikey.com/mylists/v1/lists/abc-999/parts");
  });

  it("sends RequestedPartNumber, ManufacturerName, and a Quantities array matching each item", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ListId: "l1" }))
      .mockResolvedValueOnce(jsonResponse([]));
    await addItemsToDigikeyCart("token", [{ mpn: "STM32F407VGT6", manufacturer: "STMicroelectronics", quantity: 25 }], { fetchImpl });

    const [, init] = fetchImpl.mock.calls[1];
    const body = JSON.parse(init.body);
    expect(body).toEqual([
      { RequestedPartNumber: "STM32F407VGT6", ManufacturerName: "STMicroelectronics", Quantities: [{ Quantity: 25 }] },
    ]);
  });

  it("omits ManufacturerName when not provided rather than sending null/undefined literally as a bad value", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ListId: "l1" }))
      .mockResolvedValueOnce(jsonResponse([]));
    await addItemsToDigikeyCart("token", [{ mpn: "A", quantity: 1 }], { fetchImpl });

    const body = JSON.parse(fetchImpl.mock.calls[1][1].body);
    expect("ManufacturerName" in body[0]).toBe(false);
  });

  it("uses a sensible default list name including today's date when none is given", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ListId: "l1" }))
      .mockResolvedValueOnce(jsonResponse([]));
    await addItemsToDigikeyCart("token", [{ mpn: "A", quantity: 1 }], { fetchImpl });

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.ListName).toMatch(/^Sourcing POC — \d{4}-\d{2}-\d{2}$/);
    expect(body.Source).toBe("b2b");
  });

  it("uses a custom list name when provided", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ListId: "l1" }))
      .mockResolvedValueOnce(jsonResponse([]));
    await addItemsToDigikeyCart("token", [{ mpn: "A", quantity: 1 }], { fetchImpl, listName: "My custom list" });

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.ListName).toBe("My custom list");
  });

  it("throws with the response body when list creation fails, and never attempts the add-parts call", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ error: "quota exceeded" }, false, 429));
    await expect(addItemsToDigikeyCart("token", [{ mpn: "A", quantity: 1 }], { fetchImpl })).rejects.toThrow(/create-list failed/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("throws when the create-list response has no recognizable id field, instead of silently proceeding with 'undefined'", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ someOtherField: "whatever" }));
    await expect(addItemsToDigikeyCart("token", [{ mpn: "A", quantity: 1 }], { fetchImpl })).rejects.toThrow(/list id/);
  });

  it("accepts Id, id, or listId as fallback casings for the list id field", async () => {
    for (const field of ["Id", "id", "listId"]) {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ [field]: "val-1" }))
        .mockResolvedValueOnce(jsonResponse([]));
      const result = await addItemsToDigikeyCart("token", [{ mpn: "A", quantity: 1 }], { fetchImpl });
      expect(result.listId).toBe("val-1");
    }
  });

  it("throws with the response body when adding parts fails", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ListId: "l1" }))
      .mockResolvedValueOnce(jsonResponse({ error: "bad part number" }, false, 400));
    await expect(addItemsToDigikeyCart("token", [{ mpn: "BAD", quantity: 1 }], { fetchImpl })).rejects.toThrow(/add-parts failed/);
  });

  it("handles an empty item list without erroring (creates an empty list)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ListId: "l1" }))
      .mockResolvedValueOnce(jsonResponse([]));
    const result = await addItemsToDigikeyCart("token", [], { fetchImpl });
    expect(result).toEqual({ listId: "l1", addedIdentifiers: [] });
  });
});
