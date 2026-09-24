import { askJev, JevResponse } from "./client.js";
import { CandidateResult, ComponentRequirement } from "../types.js";

/**
 * Jev call #1: given raw search-result candidates, pick the one that matches
 * the requirement. Returns the chosen candidate's index, or null if none of
 * them are a plausible match.
 */
const NO_MATCH_KEY = "none";

export async function disambiguateCandidates(
  requirement: ComponentRequirement,
  candidates: CandidateResult[]
): Promise<{ chosenIndex: number | null; raw: JevResponse }> {
  // `choice` criteria must be a record (option key -> description), not an
  // array — the live API rejects an array with a 400.
  //
  // Candidates include their URL, not just text, so Jev can reason about
  // link type (a .pdf/download link vs. an actual product page) itself,
  // rather than hardcoding a URL filter in code.
  const criteria: Record<string, string> = {};
  for (const c of candidates) {
    criteria[String(c.index)] = `text: "${c.text}" | link: ${c.url ?? "(no url)"}`;
  }
  criteria[NO_MATCH_KEY] = "None of the candidates plausibly match the requirement.";

  const raw = await askJev({
    state: {
      requirement,
      candidates: candidates.map((c) => ({ index: c.index, text: c.text, url: c.url })),
    },
    questions: {
      pick: {
        type: "choice",
        instructions:
          "Given `requirement` (the exact part being sourced) and `candidates` " +
          "(raw search results from a distributor site, each with its link text " +
          "and URL), which candidate index is the correct match — an actual " +
          "product page for the required part, not a datasheet/PDF, category, " +
          `or unrelated page? Choose "${NO_MATCH_KEY}" if none of the candidates ` +
          "plausibly match.",
        criteria,
      },
    },
  });

  const choice = raw.answers.pick?.choice;
  if (choice === undefined || choice === NO_MATCH_KEY) {
    return { chosenIndex: null, raw };
  }

  const chosenIndex = parseInt(choice, 10);
  return { chosenIndex: Number.isNaN(chosenIndex) ? null : chosenIndex, raw };
}
