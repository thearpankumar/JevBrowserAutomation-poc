import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDistrelecSessionStatus, loadDistrelecSession } from "./session.js";

let dir: string;
let sessionFile: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "distrelec-session-test-"));
  sessionFile = join(dir, "session.json");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeStorageState(
  overrides: {
    origin?: string;
    authKey?: string;
    authValue?: unknown;
  } = {}
): void {
  const { origin = "https://www.distrelec.ch", authKey = "spartacus⚿⚿auth", authValue } = overrides;
  const state = {
    origins: [
      {
        origin,
        localStorage: authValue === undefined ? [] : [{ name: authKey, value: JSON.stringify(authValue) }],
      },
    ],
  };
  writeFileSync(sessionFile, JSON.stringify(state));
}

describe("loadDistrelecSession", () => {
  it("throws a clear error when the session file doesn't exist", () => {
    expect(() => loadDistrelecSession({ sessionFile: join(dir, "missing.json") })).toThrow(/No Distrelec session found/);
  });

  it("throws when the file has no matching origin/auth entry", () => {
    writeStorageState({ authValue: undefined });
    expect(() => loadDistrelecSession({ sessionFile })).toThrow(/no auth token/);
  });

  it("throws when the origin doesn't match Distrelec's", () => {
    writeStorageState({
      origin: "https://www.google.com",
      authValue: { token: { access_token: "x", expires_at: String(Date.now() + 1000) } },
    });
    expect(() => loadDistrelecSession({ sessionFile })).toThrow(/no auth token/);
  });

  it("throws when the auth entry is missing the access token or expiry", () => {
    writeStorageState({ authValue: { token: {} } });
    expect(() => loadDistrelecSession({ sessionFile })).toThrow(/missing expected fields/);
  });

  it("throws when the token has already expired", () => {
    writeStorageState({ authValue: { token: { access_token: "expired-token", expires_at: String(Date.now() - 1000) } } });
    expect(() => loadDistrelecSession({ sessionFile })).toThrow(/session has expired/);
  });

  it("returns the access token and expiry for a valid, unexpired session", () => {
    const expiresAt = Date.now() + 60_000;
    writeStorageState({ authValue: { token: { access_token: "good-token", expires_at: String(expiresAt) } } });

    const session = loadDistrelecSession({ sessionFile });

    expect(session.accessToken).toBe("good-token");
    expect(session.expiresAt).toBe(expiresAt);
  });
});

describe("getDistrelecSessionStatus", () => {
  it("reports disconnected without throwing when there's no session", () => {
    expect(getDistrelecSessionStatus({ sessionFile: join(dir, "missing.json") })).toEqual({ connected: false });
  });

  it("reports connected with the expiry as an ISO string for a valid session", () => {
    const expiresAt = Date.now() + 60_000;
    writeStorageState({ authValue: { token: { access_token: "good-token", expires_at: String(expiresAt) } } });

    expect(getDistrelecSessionStatus({ sessionFile })).toEqual({ connected: true, expiresAt: new Date(expiresAt).toISOString() });
  });
});
