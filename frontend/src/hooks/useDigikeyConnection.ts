import { useEffect, useState } from "react";
import { api } from "../api";

/** Outcome the backend appends as `?digikey=…` when it redirects back from DigiKey's login page. */
export type DigikeyReturnOutcome = "connected" | "denied" | "error";

const RETURN_PARAM = "digikey";

function readDigikeyReturn(search: string): DigikeyReturnOutcome | null {
  const value = new URLSearchParams(search).get(RETURN_PARAM);
  return value === "connected" || value === "denied" || value === "error" ? value : null;
}

export function useDigikeyConnection() {
  const [connected, setConnected] = useState(false);
  // Read once on first render (pure), then strip it from the URL in an effect
  // below — so a refresh doesn't replay the banner.
  const [returnOutcome] = useState(() => readDigikeyReturn(window.location.search));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has(RETURN_PARAM)) return;
    params.delete(RETURN_PARAM);
    const query = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .digikeyStatus()
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

  return { connected, returnOutcome };
}
