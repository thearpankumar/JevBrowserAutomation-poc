import type { SelectionChoices } from "./selection";

const STORAGE_KEY = "jev-digikey-return-state";

interface StoredReturnState {
  jobId: string;
  choices: [string, boolean][];
}

/**
 * Saved just before the full-page redirect to DigiKey's login page, so the
 * in-progress batch and its selections can be restored when the browser
 * lands back on this origin. sessionStorage survives the round trip because
 * it's scoped to (origin, tab), not to whatever page loaded in between.
 */
export function saveDigikeyReturnState(jobId: string, choices: SelectionChoices): void {
  const payload: StoredReturnState = { jobId, choices: [...choices] };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage unavailable (private browsing, quota) — the redirect just won't restore.
  }
}

/** Reads and clears the saved state — restoring is one-shot, a later refresh shouldn't replay it. */
export function takeDigikeyReturnState(): { jobId: string; choices: SelectionChoices } | null {
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as StoredReturnState;
    if (typeof parsed.jobId !== "string" || !Array.isArray(parsed.choices)) return null;
    return { jobId: parsed.jobId, choices: new Map(parsed.choices) };
  } catch {
    return null;
  }
}
