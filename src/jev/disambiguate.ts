import { askJev, JevQuestion, JevResponse } from "./client.js";
import { CandidateResult, ComponentRequirement } from "../types.js";

/**
 * Jev call #1: given raw search-result candidates, find every one that's a
 * genuine product page for the required part. `requirement` carries no
 * manufacturer — more than one manufacturer's version of a part name is a
 * legitimate match, so this asks "is this a real match at all?" per
 * candidate rather than picking a single winner the way a manufacturer
 * filter used to.
 *
 * One `noul` (true/false-ish, 0-1) question per candidate, all inside a
 * single Jev request — cheaper and simpler than a multi-select type Jev
 * doesn't have. Each question's `instructions` stays short and refers back
 * to `state.candidates[index]` rather than repeating the candidate's text/
 * link inline — with the old per-candidate paragraph, capping how many
 * candidates got judged (to bound request size) risked silently dropping a
 * genuine match that landed outside the cap. DOM-scrape-fallback candidates
 * in particular often don't contain the literal MPN in their link text/URL
 * (Distrelec URLs are description slugs, not part numbers), so there's no
 * reliable way to pre-sort the real match to the front before capping —
 * judging every extracted candidate (matches extractCandidates' own
 * MAX_CANDIDATES=80 cap) is what the old single `choice` call did too.
 */
const MAX_CANDIDATES_TO_JUDGE = 80;
const MATCH_THRESHOLD = 0.5;

export interface CandidateMatch {
  index: number;
  manufacturer: string | null;
  score: number;
}

export async function selectMatchingCandidates(
  requirement: ComponentRequirement,
  candidates: CandidateResult[]
): Promise<{ matches: CandidateMatch[]; raw: JevResponse }> {
  const judged = candidates.slice(0, MAX_CANDIDATES_TO_JUDGE);

  const questions: Record<string, JevQuestion> = {};
  for (const c of judged) {
    questions[`match_${c.index}`] = {
      type: "noul",
      instructions: `Is \`candidates[${c.index}]\` (in \`state\`) a genuine product page for the required part described in \`requirement\`?`,
      criteria: {
        true: "This is an actual product page for the required part — not a datasheet/PDF, category page, or unrelated result.",
        false: "This is not a match — a different part, or not a product page at all.",
      },
    };
  }

  const raw = await askJev({
    state: {
      requirement,
      note: "requirement has no manufacturer specified — any manufacturer's version of this part is an acceptable match.",
      candidates: judged.map((c) => ({ index: c.index, text: c.text, url: c.url, manufacturer: c.manufacturer ?? null })),
    },
    questions,
  });

  const matches: CandidateMatch[] = [];
  for (const c of judged) {
    const score = raw.answers[`match_${c.index}`]?.noul ?? 0;
    if (score >= MATCH_THRESHOLD) {
      matches.push({ index: c.index, manufacturer: c.manufacturer ?? null, score });
    }
  }

  return { matches, raw };
}
