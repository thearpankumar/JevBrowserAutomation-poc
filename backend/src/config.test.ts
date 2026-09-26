import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const REQUIRED_ENV = {
  OPENROUTER_JEV_API: "test-jev-key",
  DIGIKEY_CLIENT_ID: "test-client-id",
  DIGIKEY_CLIENT_SECRET: "test-client-secret",
};

const ENV_KEYS = [
  "PORT",
  "OPENROUTER_JEV_API",
  "DIGIKEY_CLIENT_ID",
  "DIGIKEY_CLIENT_SECRET",
  "DIGIKEY_USE_SANDBOX",
  "DIGIKEY_OAUTH_REDIRECT_URI",
  "APP_BASE_URL",
] as const;
const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
  for (const key of ENV_KEYS) delete process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  vi.resetModules();
});

async function freshGetConfig() {
  vi.resetModules();
  const mod = await import("./config.js");
  return mod.getConfig;
}

describe("getConfig", () => {
  it("returns a valid config when every required var is set", async () => {
    Object.assign(process.env, REQUIRED_ENV);
    const getConfig = await freshGetConfig();
    const config = getConfig();
    expect(config.openrouterJevApiKey).toBe("test-jev-key");
    expect(config.digikey.clientId).toBe("test-client-id");
    expect(config.digikey.clientSecret).toBe("test-client-secret");
  });

  it("defaults port to 3000 when PORT is not set", async () => {
    Object.assign(process.env, REQUIRED_ENV);
    const getConfig = await freshGetConfig();
    expect(getConfig().port).toBe(3000);
  });

  it("uses PORT when it is set", async () => {
    Object.assign(process.env, REQUIRED_ENV, { PORT: "8080" });
    const getConfig = await freshGetConfig();
    expect(getConfig().port).toBe(8080);
  });

  it("defaults appBaseUrl to empty (same origin) when APP_BASE_URL is unset", async () => {
    Object.assign(process.env, REQUIRED_ENV);
    const getConfig = await freshGetConfig();
    expect(getConfig().appBaseUrl).toBe("");
  });

  it("reads appBaseUrl from APP_BASE_URL and strips trailing slashes", async () => {
    Object.assign(process.env, REQUIRED_ENV, { APP_BASE_URL: "http://localhost:5173//" });
    const getConfig = await freshGetConfig();
    expect(getConfig().appBaseUrl).toBe("http://localhost:5173");
  });

  it("defaults digikey.useSandbox to false when unset", async () => {
    Object.assign(process.env, REQUIRED_ENV);
    const getConfig = await freshGetConfig();
    expect(getConfig().digikey.useSandbox).toBe(false);
  });

  it("reads digikey.useSandbox as true only for the literal string 'true' (case-insensitive)", async () => {
    Object.assign(process.env, REQUIRED_ENV, { DIGIKEY_USE_SANDBOX: "TRUE" });
    const getConfig = await freshGetConfig();
    expect(getConfig().digikey.useSandbox).toBe(true);
  });

  it("throws a clear, specific error naming the missing var when OPENROUTER_JEV_API is unset", async () => {
    Object.assign(process.env, { DIGIKEY_CLIENT_ID: "x", DIGIKEY_CLIENT_SECRET: "y" });
    const getConfig = await freshGetConfig();
    expect(() => getConfig()).toThrow(/OPENROUTER_JEV_API is not set/);
  });

  it("throws a clear, specific error naming the missing var when DIGIKEY_CLIENT_ID is unset", async () => {
    Object.assign(process.env, { OPENROUTER_JEV_API: "x", DIGIKEY_CLIENT_SECRET: "y" });
    const getConfig = await freshGetConfig();
    expect(() => getConfig()).toThrow(/DIGIKEY_CLIENT_ID is not set/);
  });

  it("throws a clear, specific error naming the missing var when DIGIKEY_CLIENT_SECRET is unset", async () => {
    Object.assign(process.env, { OPENROUTER_JEV_API: "x", DIGIKEY_CLIENT_ID: "y" });
    const getConfig = await freshGetConfig();
    expect(() => getConfig()).toThrow(/DIGIKEY_CLIENT_SECRET is not set/);
  });

  it("defaults digikey.oauthRedirectUri to null when unset — OAuth cart access is optional, not required to start", async () => {
    Object.assign(process.env, REQUIRED_ENV);
    const getConfig = await freshGetConfig();
    expect(getConfig().digikey.oauthRedirectUri).toBeNull();
  });

  it("reads digikey.oauthRedirectUri from DIGIKEY_OAUTH_REDIRECT_URI when set", async () => {
    Object.assign(process.env, REQUIRED_ENV, { DIGIKEY_OAUTH_REDIRECT_URI: "https://example.ngrok-free.dev/api/digikey/oauth/callback" });
    const getConfig = await freshGetConfig();
    expect(getConfig().digikey.oauthRedirectUri).toBe("https://example.ngrok-free.dev/api/digikey/oauth/callback");
  });

  it("caches the result — a second call returns the same values without re-validating", async () => {
    Object.assign(process.env, REQUIRED_ENV);
    const getConfig = await freshGetConfig();
    const first = getConfig();
    delete process.env.OPENROUTER_JEV_API; // if it re-read env now, this would throw
    const second = getConfig();
    expect(second).toBe(first);
    expect(second.openrouterJevApiKey).toBe("test-jev-key");
  });
});
