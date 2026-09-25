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
          "in `requirement` (correct MPN/part name and package, not just a similarly " +
          "named part)? `requirement` does not specify a manufacturer — more than one " +
          "manufacturer's version of this part is an acceptable match, so do not " +
          "penalize `extracted` for its manufacturer alone; `extracted.manufacturer` is " +
          "informational, not something to check against `requirement`. `package` is " +
          "frequently not a separate labeled field and will be null even for a correct " +
          "match — check `description` and `rawText` for package/spec details before " +
          "treating a missing `package` field as a sign of a mismatch.",
        criteria: {
          true: "The extracted product is the exact part required (or a directly equivalent variant), regardless of which manufacturer makes it.",
          false: "The extracted product is a different part or wrong package — not a genuine match to the required part.",
        },
      },
    },
  });

  return { confidence: raw.answers.matches?.noul ?? 0, raw };
}
