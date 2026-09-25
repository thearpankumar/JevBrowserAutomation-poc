import { CandidateResult, ComponentRequirement, SourcingResult } from "../types.js";
import { launchBrowser, openCandidate, searchDistrelec, SearchApiDoc } from "./navigate.js";
import { candidatesFromApiDocs, extractCandidates, extractProductData, packageFromDisplayFields, productDataFromApi } from "./extract.js";
import { CandidateMatch, selectMatchingCandidates } from "../jev/disambiguate.js";
import { verifySpecMatch } from "../jev/verifySpec.js";
import { JevResponse } from "../jev/client.js";
import { Page } from "playwright";

// Raised from the old single-candidate budget: with no manufacturer given
// up front, a part name can resolve to several distinct manufacturers, each
// needing its own product-page open + verify round trip.
const PIPELINE_TIMEOUT_MS = 150_000;

// No manufacturer was given to filter by, so every distinct manufacturer
// among Jev's plausible matches is its own legitimate result — capped so a
// generic part name with many resellers/variants doesn't open dozens of
// product pages in one request.
const MAX_MANUFACTURER_GROUPS = 5;

export async function sourceFromDistrelec(requirement: ComponentRequirement): Promise<SourcingResult[]> {
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

/**
 * Jev's matches carry manufacturer when it came from the search API
 * (candidatesFromApiDocs); DOM-scrape-fallback candidates don't have it.
 * Known manufacturers are deduped case-insensitively, one representative
 * candidate each (highest match score); unknown-manufacturer candidates
 * can't be deduped against each other, so each is kept as its own
 * (capped) group.
 */
function groupMatchesByManufacturer(matches: CandidateMatch[]): CandidateMatch[] {
  const byManufacturer = new Map<string, CandidateMatch>();
  const unknownManufacturer: CandidateMatch[] = [];

  for (const m of [...matches].sort((a, b) => b.score - a.score)) {
    if (!m.manufacturer) {
      unknownManufacturer.push(m);
      continue;
    }
    const key = m.manufacturer.toLowerCase();
    if (!byManufacturer.has(key)) byManufacturer.set(key, m);
  }

  return [...byManufacturer.values(), ...unknownManufacturer].slice(0, MAX_MANUFACTURER_GROUPS);
}

async function runDistrelecPipeline(requirement: ComponentRequirement): Promise<SourcingResult[]> {
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
      return [notFoundResult(requirement, "no candidates extracted from search results")];
    }

    console.log(`[Distrelec] ${requirement.mpn}: asking Jev which candidates genuinely match...`);
    const { matches, raw: selectRaw } = await selectMatchingCandidates(requirement, candidates);
    console.log(`[Distrelec] ${requirement.mpn}: Jev found ${matches.length} plausible match(es)`);

    if (matches.length === 0) {
      return [notFoundResult(requirement, "Jev found no plausible match among candidates", { disambiguate: selectRaw })];
    }

    const representatives = groupMatchesByManufacturer(matches);
    console.log(
      `[Distrelec] ${requirement.mpn}: resolving ${representatives.length} distinct manufacturer(s): ${representatives
        .map((m) => m.manufacturer ?? "(unknown)")
        .join(", ")}`
    );

    const results: SourcingResult[] = [];
    for (const match of representatives) {
      const candidate = candidates[match.index];
      try {
        const result = await resolveCandidate(resultsPage, requirement, candidate, apiDocs, selectRaw);
        results.push(result);
      } catch (e) {
        console.warn(
          `[Distrelec] ${requirement.mpn}: failed to resolve candidate ${match.index} (${candidate.manufacturer ?? "unknown manufacturer"}): ${
            e instanceof Error ? e.message : String(e)
          }`
        );
      }
    }

    return results.length > 0 ? results : [notFoundResult(requirement, "all matched candidates failed to resolve", { disambiguate: selectRaw })];
  } finally {
    await browser.close();
  }
}

/** Opens one chosen candidate's product page, extracts its data, and asks Jev to verify the spec match. */
async function resolveCandidate(
  resultsPage: Page,
  requirement: ComponentRequirement,
  candidate: CandidateResult,
  apiDocs: SearchApiDoc[] | null,
  disambiguateRaw: JevResponse
): Promise<SourcingResult> {
  if (!candidate.url) {
    return notFoundResult(requirement, "chosen candidate had no product URL", { disambiguate: disambiguateRaw });
  }

  // The chosen search-result doc's `displayFields` carries real labeled
  // spec attributes (e.g. "Package Type": "TO-263") — only available when
  // candidates came from the search API (candidate.index lines up 1:1 with
  // apiDocs in that case).
  const chosenApiDoc = apiDocs?.[candidate.index] ?? null;
  const packageFromSearch = packageFromDisplayFields(chosenApiDoc?.displayFields);

  console.log(`[Distrelec] ${requirement.mpn}: opening candidate ${candidate.index} (${candidate.manufacturer ?? "unknown manufacturer"})...`);
  const { apiProduct, apiAvailability, apiPrice } = await openCandidate(resultsPage, candidate.url, requirement.mpn);

  // Same preference as the candidates step: structured API fields over
  // DOM-scraped/regex-parsed text, field by field — one endpoint being
  // unavailable shouldn't drag down fields the others already answered.
  const domExtracted = await extractProductData(resultsPage);
  const apiExtracted =
    apiProduct || apiAvailability || apiPrice ? productDataFromApi(apiProduct, apiAvailability, apiPrice, domExtracted.rawText) : null;
  const extracted = apiExtracted
    ? {
        mpn: apiExtracted.mpn ?? domExtracted.mpn,
        manufacturer: apiExtracted.manufacturer ?? candidate.manufacturer ?? domExtracted.manufacturer,
        package: packageFromSearch ?? domExtracted.package,
        price: apiExtracted.price ?? domExtracted.price,
        stock: apiExtracted.stock ?? domExtracted.stock,
        description: apiExtracted.description,
        rawText: domExtracted.rawText,
      }
    : {
        ...domExtracted,
        manufacturer: domExtracted.manufacturer ?? candidate.manufacturer ?? null,
        package: packageFromSearch ?? domExtracted.package,
        description: null,
      };
  console.log(`[Distrelec] ${requirement.mpn}: package = ${extracted.package ?? "(unknown)"}`);
  console.log(
    `[Distrelec] ${requirement.mpn}: product data source: manufacturer/stock/price from ${apiExtracted ? "product API" : "DOM scrape fallback"}`
  );

  console.log(`[Distrelec] ${requirement.mpn}: asking Jev to verify spec match for ${extracted.manufacturer ?? "(unknown manufacturer)"}...`);
  const { confidence, raw: verifyRaw } = await verifySpecMatch(requirement, extracted);
  console.log(`[Distrelec] ${requirement.mpn}: Jev confidence = ${confidence} (${extracted.manufacturer ?? "unknown"})`);

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
    sourceUrl: candidate.url,
    fetchedAt: new Date().toISOString(),
  };
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
