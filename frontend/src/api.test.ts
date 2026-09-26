import { describe, expect, it, vi } from "vitest";
import { api, ApiError, exportCsvUrl, NETWORK_ERROR_MESSAGE } from "./api";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("api client", () => {
  it("POSTs JSON to the right endpoint and returns the parsed body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [], errors: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.source("STM32F407VGT6")).resolves.toEqual({ results: [], errors: [] });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/source");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({ mpn: "STM32F407VGT6" });
  });

  it("uses the server's error message and status on a non-2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "Part number is required." }, 400)));

    const err = await api.source("").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe("Part number is required.");
    expect((err as ApiError).status).toBe(400);
  });

  it("carries the per-row details of a rejected BOM upload", async () => {
    const rowErrors = [{ row: 0, message: "This doesn't look like a CSV file." }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "No valid rows found in the uploaded file.", rowErrors }, 400)));

    const err = (await api.startBatch("PK…").catch((e: unknown) => e)) as ApiError;
    expect(err.message).toBe("No valid rows found in the uploaded file.");
    expect(err.rowErrors).toEqual(rowErrors);
  });

  it("falls back to a generic message when an error body has no message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 500)));
    await expect(api.digikeyStatus()).rejects.toThrow("Something went wrong.");
  });

  it("reports a network failure as 'couldn't reach the server'", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const err = (await api.digikeyStatus().catch((e: unknown) => e)) as ApiError;
    expect(err.message).toBe(NETWORK_ERROR_MESSAGE);
    expect(err.status).toBeNull();
  });

  it("reports a non-JSON response (e.g. dev proxy with the backend down) as 'couldn't reach the server'", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>Bad gateway</html>", { status: 502 })));
    await expect(api.digikeyStatus()).rejects.toThrow(NETWORK_ERROR_MESSAGE);
  });

  it("URL-encodes job ids", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);
    await api.getBatch("a/b?c");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/batch/a%2Fb%3Fc");
    expect(exportCsvUrl("a/b")).toBe("/api/batch/a%2Fb/export.csv");
  });

  it("sends cart items as { items }", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ listId: "l1", addedIdentifiers: ["x"] }));
    vi.stubGlobal("fetch", fetchMock);
    const items = [{ mpn: "A", manufacturer: "M", quantity: 2 }];

    await expect(api.addToDigikeyCart(items)).resolves.toEqual({ listId: "l1", addedIdentifiers: ["x"] });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/digikey/cart/add");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ items });
  });
});
