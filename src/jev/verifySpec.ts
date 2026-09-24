import { askJev, JevResponse } from "./client.js";
import { ComponentRequirement } from "../types.js";

export interface ExtractedProductData {
  mpn: string | null;
  manufacturer: string | null;
  package: string | null;
  price: string | null;
  stock: string | null;
  /**
   * Free-text product description/title — a fallback source for
   * package/spec details when `package` itself is null (not every source
   * has a distinct labeled package field).
   */
  description: string | null;
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
          "in `requirement` (correct MPN/manufacturer/package, not just a similar part)? " +
          "Distributor sites commonly abbreviate manufacturer names (e.g. \"ST\" for " +
          "STMicroelectronics, \"TI\" for Texas Instruments) — treat a clear, " +
          "unambiguous abbreviation as a match rather than penalizing it for not " +
          "being the full legal name. `package` is frequently not a separate labeled " +
          "field and will be null even for a correct match — check `description` and " +
          "`rawText` for package/spec details before treating a missing `package` field " +
          "as a sign of a mismatch.",
        criteria: {
          true: "The extracted product is the exact part required (or a directly equivalent variant).",
          false: "The extracted product is a different part, wrong manufacturer, or wrong package.",
        },
      },
    },
  });

  return { confidence: raw.answers.matches?.noul ?? 0, raw };
}
