import { askJev, JevResponse } from "./client.js";
import { ComponentRequirement } from "../types.js";

export interface ExtractedProductData {
  mpn: string | null;
  manufacturer: string | null;
  package: string | null;
  price: string | null;
  stock: string | null;
  rawText: string;
}

/**
 * Jev call #2: given the extracted product-page data, verify it actually
 * satisfies the requirement. Returns a 0-1 confidence score.
 */
export async function verifySpecMatch(
  requirement: ComponentRequirement,
  extracted: ExtractedProductData
): Promise<{ confidence: number; raw: JevResponse }> {
  const raw = await askJev({
    state: { requirement, extracted },
    questions: {
      matches: {
        type: "noul",
        instructions:
          "Does the product data in `extracted` actually satisfy the requirement " +
          "in `requirement` (correct MPN/manufacturer/package, not just a similar part)?",
        criteria: {
          true: "The extracted product is the exact part required (or a directly equivalent variant).",
          false: "The extracted product is a different part, wrong manufacturer, or wrong package.",
        },
      },
    },
  });

  return { confidence: raw.answers.matches?.noul ?? 0, raw };
}
