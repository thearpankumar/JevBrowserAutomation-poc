import { ComponentRequirement, SourcingResult } from "../types.js";
import { launchBrowser, openCandidate, searchDistrelec } from "./navigate.js";
import { candidatesFromApiDocs, extractCandidates, extractProductData, packageFromDisplayFields, productDataFromApi } from "./extract.js";
import { disambiguateCandidates } from "../jev/disambiguate.js";
import { verifySpecMatch } from "../jev/verifySpec.js";

const PIPELINE_TIMEOUT_MS = 90_000;

export async function sourceFromDistrelec(requirement: ComponentRequirement): Promise<SourcingResult> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Distrelec pipeline exceeded ${PIPELINE_TIMEOUT_MS}ms — see build-order note in extract.ts about unbounded loops`)),
      PIPELINE_TIMEOUT_MS
    );
  });

  try {
    return await Promise.race([runDistrelecPipeline(requirement), timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

async function runDistrelecPipeline(requirement: ComponentRequirement): Promise<SourcingResult> {
  console.log(`[Distrelec] ${requirement.mpn}: launching browser...`);
  const browser = await launchBrowser();

  try {
    console.log(`[Distrelec] ${requirement.mpn}: searching...`);
    const { page: resultsPage, apiDocs } = await searchDistrelec(browser, requirement.mpn);

    console.log(`[Distrelec] ${requirement.mpn}: extracting candidates...`);
    // Prefer the search API's own JSON (deterministic, complete) over
    // scraping the rendered DOM (subject to Angular's render-timing race —
    // see navigate.ts). Only fall back to DOM scraping if the API response
    // was never observed at all (site/endpoint change).
    const candidates = apiDocs !== null ? candidatesFromApiDocs(apiDocs) : await extractCandidates(resultsPage, requirement.mpn);
    console.log(`[Distrelec] ${requirement.mpn}: found ${candidates.length} candidates (source: ${apiDocs !== null ? "search API" : "DOM scrape fallback"})`);

    if (candidates.length === 0) {
      return notFoundResult(requirement, "no candidates extracted from search results");
    }

    console.log(`[Distrelec] ${requirement.mpn}: asking Jev to disambiguate...`);
    const { chosenIndex, raw: disambiguateRaw } = await disambiguateCandidates(requirement, candidates);
    console.log(`[Distrelec] ${requirement.mpn}: Jev chose index ${chosenIndex}`);
    if (chosenIndex === null) {
      return notFoundResult(requirement, "Jev found no plausible match among candidates", { disambiguate: disambiguateRaw });
    }

    const chosen = candidates[chosenIndex];
    if (!chosen.url) {
      return notFoundResult(requirement, "chosen candidate had no product URL", { disambiguate: disambiguateRaw });
    }

    // The chosen search-result doc's `displayFields` carries real labeled
    // spec attributes (e.g. "Package Type": "TO-263") — only available when
    // candidates came from the search API (chosenIndex lines up 1:1 with
    // apiDocs in that case).
    const chosenApiDoc = apiDocs?.[chosenIndex] ?? null;
    const packageFromSearch = packageFromDisplayFields(chosenApiDoc?.displayFields);

    console.log(`[Distrelec] ${requirement.mpn}: opening chosen product page...`);
    const { apiProduct, apiAvailability, apiPrice } = await openCandidate(resultsPage, chosen.url, requirement.mpn);

    // Same preference as the candidates step: structured API fields over
    // DOM-scraped/regex-parsed text, field by field — one endpoint being
    // unavailable shouldn't drag down fields the others already answered.
    const domExtracted = await extractProductData(resultsPage);
    const apiExtracted =
      apiProduct || apiAvailability || apiPrice ? productDataFromApi(apiProduct, apiAvailability, apiPrice, domExtracted.rawText) : null;
    const extracted = apiExtracted
      ? {
          mpn: apiExtracted.mpn ?? domExtracted.mpn,
          manufacturer: apiExtracted.manufacturer ?? domExtracted.manufacturer,
          package: packageFromSearch ?? domExtracted.package,
          price: apiExtracted.price ?? domExtracted.price,
          stock: apiExtracted.stock ?? domExtracted.stock,
          description: apiExtracted.description,
          rawText: domExtracted.rawText,
        }
      : { ...domExtracted, package: packageFromSearch ?? domExtracted.package, description: null };
    console.log(`[Distrelec] ${requirement.mpn}: package = ${extracted.package ?? "(unknown)"}`);
    console.log(
      `[Distrelec] ${requirement.mpn}: product data source: manufacturer/stock/price from ${apiExtracted ? "product API" : "DOM scrape fallback"}`
    );

    console.log(`[Distrelec] ${requirement.mpn}: asking Jev to verify spec match...`);
    const { confidence, raw: verifyRaw } = await verifySpecMatch(requirement, extracted);
    console.log(`[Distrelec] ${requirement.mpn}: Jev confidence = ${confidence}`);

    return {
      supplier: "Distrelec",
      mpn: requirement.mpn,
      manufacturer: extracted.manufacturer,
      price: extracted.price,
      // Distrelec (Swiss store) always prices in CHF — default to it when the
      // price API wasn't captured (DOM-fallback path) rather than leaving a
      // real price with no currency attached.
      currency: apiPrice?.price?.currencyIso ?? (extracted.price ? "CHF" : null),
      // `parseInt(...) || null` would silently turn a genuine "0 in stock"
      // result into `null`, since 0 is falsy — indistinguishable from a
      // failed capture. Check for NaN explicitly instead.
      stock: (() => {
        if (!extracted.stock) return null;
        const n = parseInt(extracted.stock, 10);
        return Number.isNaN(n) ? null : n;
      })(),
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
