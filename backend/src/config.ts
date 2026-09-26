export interface AppConfig {
  port: number;
  /**
   * Where the browser is sent back to after DigiKey's login page, with no
   * trailing slash. Empty = same origin as this server (production, where
   * Express serves the built frontend itself). In development the frontend
   * runs on the Vite dev server instead, e.g. "http://localhost:5173".
   */
  appBaseUrl: string;
  openrouterJevApiKey: string;
  digikey: {
    clientId: string;
    clientSecret: string;
    useSandbox: boolean;
    /**
     * Only needed for the OAuth "connect your DigiKey account" flow (cart
     * access), not for product search — so it's optional here rather than
     * failing the whole server at startup. Must exactly match what's
     * registered as the app's "OAuth Callback" on developer.digikey.com.
     */
    oauthRedirectUri: string | null;
  };
}

let cached: AppConfig | null = null;

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set — see .env.example`);
  }
  return value;
}

/**
 * Reads and validates every required env var in one place, with one clear
 * error naming exactly what's missing — instead of each caller reading
 * process.env directly and failing deep inside a request. Cached after the
 * first successful read (env vars don't change mid-process); call it once
 * eagerly at startup (see server.ts / cli.ts) so a misconfigured .env fails
 * immediately and loudly, not on whatever request happens to need it first.
 */
export function getConfig(): AppConfig {
  if (cached) return cached;
  cached = {
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
    appBaseUrl: (process.env.APP_BASE_URL ?? "").replace(/\/+$/, ""),
    openrouterJevApiKey: required("OPENROUTER_JEV_API"),
    digikey: {
      clientId: required("DIGIKEY_CLIENT_ID"),
      clientSecret: required("DIGIKEY_CLIENT_SECRET"),
      useSandbox: (process.env.DIGIKEY_USE_SANDBOX ?? "false").toLowerCase() === "true",
      oauthRedirectUri: process.env.DIGIKEY_OAUTH_REDIRECT_URI ?? null,
    },
  };
  return cached;
}
