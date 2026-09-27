import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { DistrelecStatusResponse } from "@jev/shared";

/**
 * Distrelec's login page is bot-protected (see navigate.ts) — instead of
 * automating it, a person logs in once in a real, visible browser
 * (`npm run distrelec:login`) and the resulting session is saved here. This
 * module just reads that file; it never drives a browser itself.
 */
export const SESSION_FILE = fileURLToPath(new URL("../../.distrelec-session.json", import.meta.url));

const AUTH_KEY = "spartacus⚿⚿auth";
const DISTRELEC_ORIGIN = "https://www.distrelec.ch";

export interface DistrelecSession {
  accessToken: string;
  /** Epoch ms. */
  expiresAt: number;
}

interface PlaywrightStorageState {
  origins?: { origin: string; localStorage?: { name: string; value: string }[] }[];
}

/**
 * Reads the bearer token a person's manual login left in Playwright's saved
 * storage state. The token is short-lived (observed ~2 hours) with no
 * refresh token available client-side — Spartacus (Distrelec's storefront
 * framework) doesn't persist one — so once it expires the only fix is
 * repeating the manual login, not a silent refresh.
 */
export function loadDistrelecSession(opts: { sessionFile?: string } = {}): DistrelecSession {
  const sessionFile = opts.sessionFile ?? SESSION_FILE;

  let raw: string;
  try {
    raw = readFileSync(sessionFile, "utf8");
  } catch {
    throw new Error(`No Distrelec session found at ${sessionFile} — run \`npm run distrelec:login\` to create one.`);
  }

  const state = JSON.parse(raw) as PlaywrightStorageState;
  const origin = state.origins?.find((o) => o.origin === DISTRELEC_ORIGIN);
  const entry = origin?.localStorage?.find((kv) => kv.name === AUTH_KEY);
  if (!entry) {
    throw new Error("Distrelec session file has no auth token — it may be corrupt; run `npm run distrelec:login` again.");
  }

  const parsed = JSON.parse(entry.value) as { token?: { access_token?: string; expires_at?: string } };
  const accessToken = parsed.token?.access_token;
  const expiresAtRaw = parsed.token?.expires_at;
  if (!accessToken || !expiresAtRaw) {
    throw new Error("Distrelec session file's auth token is missing expected fields — run `npm run distrelec:login` again.");
  }

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) {
    throw new Error("Distrelec session has expired — run `npm run distrelec:login` again.");
  }

  return { accessToken, expiresAt };
}

/** For GET /api/distrelec/status — reports the session's state instead of throwing. */
export function getDistrelecSessionStatus(opts: { sessionFile?: string } = {}): DistrelecStatusResponse {
  try {
    const session = loadDistrelecSession(opts);
    return { connected: true, expiresAt: new Date(session.expiresAt).toISOString() };
  } catch {
    return { connected: false };
  }
}
