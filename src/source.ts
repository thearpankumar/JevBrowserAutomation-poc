import { ComponentRequirement, SourcingResult } from "./types.js";
import { sourceFromDistrelec } from "./distrelec/pipeline.js";
import { sourceFromDigikey } from "./digikey/pipeline.js";

export interface SourceBothResult {
  results: SourcingResult[];
  errors: { supplier: "DigiKey" | "Distrelec"; message: string }[];
}

/** Shared by the CLI and the web server — one place that actually runs both suppliers. */
export async function sourceFromBoth(requirement: ComponentRequirement): Promise<SourceBothResult> {
  const [digikey, distrelec] = await Promise.allSettled([
    sourceFromDigikey(requirement),
    sourceFromDistrelec(requirement),
  ]);

  const results: SourcingResult[] = [];
  const errors: SourceBothResult["errors"] = [];

  for (const [supplier, settled] of [
    ["DigiKey", digikey],
    ["Distrelec", distrelec],
  ] as const) {
    if (settled.status === "fulfilled") {
      results.push(...settled.value);
    } else {
      errors.push({
        supplier,
        message: settled.reason instanceof Error ? settled.reason.message : String(settled.reason),
      });
    }
  }

  return { results, errors };
}
