import { Page } from "playwright";
import { CandidateResult } from "../types.js";
import { ExtractedProductData } from "../jev/verifySpec.js";

/**
 * Deliberately dumb extraction: pull raw text/links off the page and hand
 * the mess to Jev to interpret, rather than encoding assumptions about the
 * page's structure here. This is what keeps the pipeline resilient to
 * layout changes — see the Navigation vs. Judgment split in the
 * architecture doc.
 */
export async function extractCandidates(page: Page): Promise<CandidateResult[]> {
  // A result "item" is approximated as any link whose accessible text is
  // non-trivial — broad on purpose, Jev filters the noise, not this code.
  const links = await page.getByRole("link").all();
  const candidates: CandidateResult[] = [];
  let index = 0;

  for (const link of links) {
    const text = (await link.innerText().catch(() => ""))?.trim();
    const href = await link.getAttribute("href").catch(() => null);
    if (text && text.length > 8) {
      candidates.push({ index, text, url: href });
      index += 1;
    }
  }

  return candidates;
}

export async function extractProductData(page: Page): Promise<ExtractedProductData> {
  const rawText = (await page.locator("body").innerText().catch(() => "")).slice(0, 4000);
  return {
    mpn: null,
    manufacturer: null,
    package: null,
    price: null,
    stock: null,
    rawText,
  };
}
