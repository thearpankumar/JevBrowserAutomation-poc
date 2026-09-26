// DigiKey OAuth2 token manager. See https://developer.digikey.com — register
// an app under Product Information V4 to get a client id/secret.
//
// NOTE: this uses the client_credentials grant. The Developer Portal's only
// app-creation flow is "Create Production App" (no separate sandbox app),
// and the resulting credentials authenticate against the production
// endpoint only — sandbox-api.digikey.com returns "Invalid clientId" for
// them. Defaulting to production below as a result; some DigiKey scopes
// (e.g. live pricing tied to a specific account) may still require the
// 3-legged Authorization Code flow instead of client_credentials — not hit
// yet for Product Information V4.

import { getConfig } from "../config.js";

const SANDBOX_TOKEN_URL = "https://sandbox-api.digikey.com/v1/oauth2/token";
const LIVE_TOKEN_URL = "https://api.digikey.com/v1/oauth2/token";

let cachedToken: { value: string; expiresAt: number } | null = null;

export function digikeyApiBase(): string {
  return getConfig().digikey.useSandbox ? "https://sandbox-api.digikey.com" : "https://api.digikey.com";
}

export async function getDigikeyToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.value;
  }

  const { clientId, clientSecret, useSandbox } = getConfig().digikey;
  const tokenUrl = useSandbox ? SANDBOX_TOKEN_URL : LIVE_TOKEN_URL;

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`DigiKey token request failed: ${res.status} ${res.statusText} — ${body}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return cachedToken.value;
}
