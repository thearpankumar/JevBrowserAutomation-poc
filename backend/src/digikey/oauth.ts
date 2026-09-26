import { randomUUID } from "node:crypto";
import { getConfig } from "../config.js";
import { logger } from "../logger.js";

const log = logger.child({ component: "digikey-oauth" });

// Verified against DigiKey's official "3 Legged Authorization" tutorial and
// their published OpenAPI spec — same token endpoint the existing
// client_credentials code already uses, just a different grant_type.
const AUTHORIZE_URL = "https://api.digikey.com/v1/oauth2/authorize";
const TOKEN_URL = "https://api.digikey.com/v1/oauth2/token";

export interface DigikeyTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

function requireRedirectUri(): string {
  const uri = getConfig().digikey.oauthRedirectUri;
  if (!uri) {
    throw new Error("DIGIKEY_OAUTH_REDIRECT_URI is not set — see .env.example");
  }
  return uri;
}

/**
 * Holds the OAuth state for exactly one connected DigiKey account.
 *
 * This POC has no user-account system at all yet, so there's nowhere to
 * store a token "per client" — this is deliberately a single slot for the
 * whole running process, fine for solo testing/demo use. A real multi-client
 * production version needs this keyed per logged-in user and persisted
 * (not in-memory), same caveat already flagged for JobStore/TtlCache.
 */
export class DigikeyOAuthClient {
  private connectedTokens: DigikeyTokens | null = null;
  private pendingState: string | null = null;

  constructor(private fetchImpl: typeof fetch = fetch) {}

  isConnected(): boolean {
    return this.connectedTokens !== null;
  }

  /** One-time-use anti-CSRF token — DigiKey echoes `state` back on the callback, so we can confirm this callback really came from a redirect we initiated. */
  generateState(): string {
    const state = randomUUID();
    this.pendingState = state;
    return state;
  }

  /**
   * Only clears the pending state on an actual match — a wrong/bogus value
   * must NOT invalidate the real pending flow (otherwise a single mistaken
   * or malicious callback could lock out the legitimate one still in
   * flight).
   */
  consumeState(state: string): boolean {
    const valid = this.pendingState !== null && this.pendingState === state;
    if (valid) this.pendingState = null;
    return valid;
  }

  buildAuthorizeUrl(state: string): string {
    const { clientId } = getConfig().digikey;
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: requireRedirectUri(),
      state,
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  /** DigiKey's authorization code expires in ~1 minute — call this immediately after the callback lands. */
  async exchangeCodeForTokens(code: string): Promise<DigikeyTokens> {
    const { clientId, clientSecret } = getConfig().digikey;

    const res = await this.fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: requireRedirectUri(),
        grant_type: "authorization_code",
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`DigiKey OAuth token exchange failed: ${res.status} ${res.statusText} — ${body}`);
    }

    const json = (await res.json()) as TokenResponse;
    this.connectedTokens = {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: Date.now() + json.expires_in * 1000,
    };
    log.info("DigiKey account connected");
    return this.connectedTokens;
  }

  /** DigiKey issues a brand-new refresh token on every refresh — the old one is spent and won't work again, so the new one must overwrite it, not just the access token. */
  private async refresh(): Promise<DigikeyTokens> {
    if (!this.connectedTokens) throw new Error("No DigiKey account connected.");
    const { clientId, clientSecret } = getConfig().digikey;

    const res = await this.fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: this.connectedTokens.refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // A broken/expired refresh token can't be retried — force a real reconnect instead of looping.
      this.connectedTokens = null;
      throw new Error(`DigiKey OAuth token refresh failed: ${res.status} ${res.statusText} — ${body}`);
    }

    const json = (await res.json()) as TokenResponse;
    this.connectedTokens = {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: Date.now() + json.expires_in * 1000,
    };
    return this.connectedTokens;
  }

  /** Returns a definitely-valid access token, refreshing first if it's within 30s of expiring (access tokens last 30 minutes). */
  async getValidAccessToken(): Promise<string> {
    if (!this.connectedTokens) throw new Error("No DigiKey account connected.");
    if (this.connectedTokens.expiresAt > Date.now() + 30_000) {
      return this.connectedTokens.accessToken;
    }
    const refreshed = await this.refresh();
    return refreshed.accessToken;
  }
}
