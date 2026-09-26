export interface AppConfig {
  port: number;
  openrouterJevApiKey: string;
  digikey: {
    clientId: string;
    clientSecret: string;
    useSandbox: boolean;
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
    openrouterJevApiKey: required("OPENROUTER_JEV_API"),
    digikey: {
      clientId: required("DIGIKEY_CLIENT_ID"),
      clientSecret: required("DIGIKEY_CLIENT_SECRET"),
      useSandbox: (process.env.DIGIKEY_USE_SANDBOX ?? "false").toLowerCase() === "true",
    },
  };
  return cached;
}
