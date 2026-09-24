import { ComponentRequirement, SourcingResult } from "../types.js";
import { launchBrowser, openCandidate, searchDistrelec } from "./navigate.js";
import { extractCandidates, extractProductData } from "./extract.js";
import { disambiguateCandidates } from "../jev/disambiguate.js";
import { verifySpecMatch } from "../jev/verifySpec.js";

export async function sourceFromDistrelec(requirement: ComponentRequirement): Promise<SourcingResult> {
  const browser = await launchBrowser();

  try {
    const resultsPage = await searchDistrelec(browser, requirement.mpn);
    const candidates = await extractCandidates(resultsPage);

    if (candidates.length === 0) {
      return notFoundResult(requirement, "no candidates extracted from search results");
    }

    const { chosenIndex, raw: disambiguateRaw } = await disambiguateCandidates(requirement, candidates);
    if (chosenIndex === null) {
      return notFoundResult(requirement, "Jev found no plausible match among candidates", { disambiguate: disambiguateRaw });
    }

    const chosen = candidates[chosenIndex];
    if (!chosen.url) {
      return notFoundResult(requirement, "chosen candidate had no product URL", { disambiguate: disambiguateRaw });
    }

    await openCandidate(resultsPage, chosen.url);
    const extracted = await extractProductData(resultsPage);
    const { confidence, raw: verifyRaw } = await verifySpecMatch(requirement, extracted);

    return {
      supplier: "Distrelec",
      mpn: requirement.mpn,
      manufacturer: extracted.manufacturer,
      price: extracted.price,
      currency: null,
      stock: extracted.stock ? parseInt(extracted.stock, 10) || null : null,
      leadTime: null,
      confidence,
      jevTrace: { disambiguate: disambiguateRaw, verifySpec: verifyRaw },
      sourceUrl: chosen.url,
      fetchedAt: new Date().toISOString(),
    };
  } finally {
    await browser.close();
  }
}

function notFoundResult(
  requirement: ComponentRequirement,
  reason: string,
  jevTrace?: SourcingResult["jevTrace"]
): SourcingResult {
  console.warn(`[Distrelec] ${requirement.mpn}: not found — ${reason}`);
  return {
    supplier: "Distrelec",
    mpn: requirement.mpn,
    manufacturer: null,
    price: null,
    currency: null,
    stock: null,
    leadTime: null,
    confidence: 0,
    jevTrace,
    sourceUrl: null,
    fetchedAt: new Date().toISOString(),
  };
}
