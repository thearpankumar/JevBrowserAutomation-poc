import { askJev, JevResponse } from "./client.js";
import { CandidateResult, ComponentRequirement } from "../types.js";

/**
 * Jev call #1: given raw search-result candidates, pick the one that matches
 * the requirement. Returns the chosen candidate's index, or null if none of
 * them are a plausible match.
 */
export async function disambiguateCandidates(
  requirement: ComponentRequirement,
  candidates: CandidateResult[]
): Promise<{ chosenIndex: number | null; raw: JevResponse }> {
  const options = candidates.map((c) => `${c.index}: ${c.text}`);
  options.push(`${candidates.length}: none of these match`);

  const raw = await askJev({
    state: {
      requirement,
      candidates: candidates.map((c) => ({ index: c.index, text: c.text })),
    },
    questions: {
      pick: {
        type: "choice",
        instructions:
          "Given `requirement` (the exact part being sourced) and `candidates` " +
          "(raw search results from a distributor site), which candidate index " +
          "is the correct match for the required part? If none of the candidates " +
          `plausibly match, choose "${candidates.length}".`,
        criteria: options,
      },
    },
  });

  const choice = raw.answers.pick?.choice;
  const chosenIndex = choice !== undefined ? parseInt(choice.split(":")[0], 10) : null;
  const noMatch = chosenIndex === candidates.length;

  return { chosenIndex: noMatch || chosenIndex === null || Number.isNaN(chosenIndex) ? null : chosenIndex, raw };
}
