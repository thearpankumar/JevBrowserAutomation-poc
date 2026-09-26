import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Each test re-imports fresh via vi.resetModules() below (env vars need to be
// set before the module's config reads them), so there's no static import here.

const REQUIRED_ENV = {
  OPENROUTER_JEV_API: "test-jev-key",
  DIGIKEY_CLIENT_ID: "test-client-id",
  DIGIKEY_CLIENT_SECRET: "test-client-secret",
  DIGIKEY_OAUTH_REDIRECT_URI: "https://example.ngrok-free.dev/api/digikey/oauth/callback",
};
const ENV_KEYS = Object.keys(REQUIRED_ENV);
const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
  Object.assign(process.env, REQUIRED_ENV);
  vi.resetModules();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

function fakeTokenResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({ access_token: "access-1", refresh_token: "refresh-1", expires_in: 1800, ...overrides }),
    text: async () => "",
  };
}

describe("DigikeyOAuthClient", () => {
  it("starts not connected", async () => {
    const { DigikeyOAuthClient } = await import("./oauth.js");
    const client = new DigikeyOAuthClient();
    expect(client.isConnected()).toBe(false);
  });

  it("builds an authorize URL with the correct base, client id, redirect uri, and state", async () => {
    const { DigikeyOAuthClient } = await import("./oauth.js");
    const client = new DigikeyOAuthClient();
    const url = new URL(client.buildAuthorizeUrl("my-state"));

    expect(url.origin + url.pathname).toBe("https://api.digikey.com/v1/oauth2/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe("https://example.ngrok-free.dev/api/digikey/oauth/callback");
    expect(url.searchParams.get("state")).toBe("my-state");
  });

  it("throws a clear error building the authorize URL when DIGIKEY_OAUTH_REDIRECT_URI is unset", async () => {
    delete process.env.DIGIKEY_OAUTH_REDIRECT_URI;
    const { DigikeyOAuthClient } = await import("./oauth.js");
    const client = new DigikeyOAuthClient();
    expect(() => client.buildAuthorizeUrl("s")).toThrow(/DIGIKEY_OAUTH_REDIRECT_URI is not set/);
  });

  it("generateState returns a non-empty, unique-looking value each call", async () => {
    const { DigikeyOAuthClient } = await import("./oauth.js");
    const client = new DigikeyOAuthClient();
    const a = client.generateState();
    const b = client.generateState();
    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
  });

  it("consumeState returns true for the exact pending state and false otherwise", async () => {
    const { DigikeyOAuthClient } = await import("./oauth.js");
    const client = new DigikeyOAuthClient();
    const state = client.generateState();
    expect(client.consumeState("wrong-state")).toBe(false);
    expect(client.consumeState(state)).toBe(true);
  });

  it("consumeState is one-time-use — a second consume of the same state fails", async () => {
    const { DigikeyOAuthClient } = await import("./oauth.js");
    const client = new DigikeyOAuthClient();
    const state = client.generateState();
    expect(client.consumeState(state)).toBe(true);
    expect(client.consumeState(state)).toBe(false);
  });

  it("consumeState fails when no state was ever generated", async () => {
    const { DigikeyOAuthClient } = await import("./oauth.js");
    const client = new DigikeyOAuthClient();
    expect(client.consumeState("anything")).toBe(false);
  });

  it("exchangeCodeForTokens posts the right grant_type and fields, and marks the client connected", async () => {
    const { DigikeyOAuthClient } = await import("./oauth.js");
    const fetchImpl = vi.fn().mockResolvedValue(fakeTokenResponse());
    const client = new DigikeyOAuthClient(fetchImpl);

    await client.exchangeCodeForTokens("the-code");

    expect(client.isConnected()).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.digikey.com/v1/oauth2/token");
    const body = new URLSearchParams(init.body as string);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("the-code");
    expect(body.get("client_id")).toBe("test-client-id");
    expect(body.get("client_secret")).toBe("test-client-secret");
    expect(body.get("redirect_uri")).toBe("https://example.ngrok-free.dev/api/digikey/oauth/callback");
  });

  it("exchangeCodeForTokens throws with the response body on a non-ok response, and stays disconnected", async () => {
    const { DigikeyOAuthClient } = await import("./oauth.js");
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 400, statusText: "Bad Request", text: async () => "invalid_grant" });
    const client = new DigikeyOAuthClient(fetchImpl);

    await expect(client.exchangeCodeForTokens("bad-code")).rejects.toThrow(/invalid_grant/);
    expect(client.isConnected()).toBe(false);
  });

  it("getValidAccessToken throws when nothing is connected", async () => {
    const { DigikeyOAuthClient } = await import("./oauth.js");
    const client = new DigikeyOAuthClient();
    await expect(client.getValidAccessToken()).rejects.toThrow(/No DigiKey account connected/);
  });

  it("getValidAccessToken returns the current token without a network call when it's not near expiry", async () => {
    const { DigikeyOAuthClient } = await import("./oauth.js");
    const fetchImpl = vi.fn().mockResolvedValue(fakeTokenResponse());
    const client = new DigikeyOAuthClient(fetchImpl);
    await client.exchangeCodeForTokens("code");
    fetchImpl.mockClear();

    const token = await client.getValidAccessToken();

    expect(token).toBe("access-1");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("getValidAccessToken refreshes automatically when the token is near expiry, and the new refresh token replaces the old one", async () => {
    const { DigikeyOAuthClient } = await import("./oauth.js");
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(fakeTokenResponse({ expires_in: 10 })) // exchange: expires in 10s, immediately "near expiry"
      .mockResolvedValueOnce(fakeTokenResponse({ access_token: "access-2", refresh_token: "refresh-2" })); // refresh
    const client = new DigikeyOAuthClient(fetchImpl);
    await client.exchangeCodeForTokens("code");

    const token = await client.getValidAccessToken();

    expect(token).toBe("access-2");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const refreshBody = new URLSearchParams(fetchImpl.mock.calls[1][1].body as string);
    expect(refreshBody.get("grant_type")).toBe("refresh_token");
    expect(refreshBody.get("refresh_token")).toBe("refresh-1"); // the original refresh token was used to ask for a new one
  });

  it("disconnects (forces reconnect) when a refresh fails instead of looping on a broken token", async () => {
    const { DigikeyOAuthClient } = await import("./oauth.js");
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(fakeTokenResponse({ expires_in: 10 }))
      .mockResolvedValueOnce({ ok: false, status: 401, statusText: "Unauthorized", text: async () => "expired refresh token" });
    const client = new DigikeyOAuthClient(fetchImpl);
    await client.exchangeCodeForTokens("code");

    await expect(client.getValidAccessToken()).rejects.toThrow(/token refresh failed/);
    expect(client.isConnected()).toBe(false);
  });
});
