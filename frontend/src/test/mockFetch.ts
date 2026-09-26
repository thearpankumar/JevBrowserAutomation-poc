import { vi } from "vitest";

interface MockResponse {
  status?: number;
  body: unknown;
}

type Route = MockResponse | ((init: RequestInit | undefined) => MockResponse);

/**
 * Stubs global fetch with a tiny router keyed by "METHOD /path". A route given
 * as an array answers with each entry in turn, then keeps repeating the last
 * one (handy for polling). Unknown routes fail the test loudly.
 */
export function mockFetch(routes: Record<string, Route | Route[]>) {
  const counters = new Map<string, number>();

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
    const key = `${(init?.method ?? "GET").toUpperCase()} ${url}`;
    const route = routes[key];
    if (!route) throw new Error(`Unexpected request in test: ${key}`);

    let entry: Route;
    if (Array.isArray(route)) {
      const n = counters.get(key) ?? 0;
      counters.set(key, n + 1);
      entry = route[Math.min(n, route.length - 1)];
    } else {
      entry = route;
    }
    const { status = 200, body } = typeof entry === "function" ? entry(init) : entry;
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The parsed JSON body of the n-th call to a given route. */
export function requestBody(fetchMock: ReturnType<typeof mockFetch>, key: string, n = 0): unknown {
  const calls = fetchMock.mock.calls.filter(([url, init]) => `${(init?.method ?? "GET").toUpperCase()} ${url}` === key);
  const init = calls[n]?.[1];
  return init?.body ? JSON.parse(String(init.body)) : undefined;
}
