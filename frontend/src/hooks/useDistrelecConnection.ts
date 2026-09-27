import { useEffect, useState } from "react";
import { api } from "../api";

/**
 * Unlike DigiKey, there's no per-browser OAuth connect flow: "connected"
 * means a person has run `npm run distrelec:login` on the server and that
 * session hasn't expired yet (see backend/src/distrelec/session.ts).
 */
export function useDistrelecConnection(): boolean {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .distrelecStatus()
      .then((status) => {
        if (!cancelled) setConnected(status.connected);
      })
      .catch(() => {
        if (!cancelled) setConnected(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return connected;
}
