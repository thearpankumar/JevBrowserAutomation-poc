import { Page } from "playwright";
import { CandidateResult } from "../types.js";
import { ExtractedProductData } from "../jev/verifySpec.js";
import { AvailabilityApiDoc, PriceApiDoc, ProductApiDoc, SearchApiDoc } from "./navigate.js";

const MAX_CANDIDATES = 80;
const DISTRELEC_ORIGIN = "https://www.distrelec.ch";

/**
 * Preferred path (see navigate.ts): build candidates directly from the
 * search API's own JSON, not scraped DOM text — deterministic, complete,
 * and immune to the Angular render-timing race entirely.
 */
export function candidatesFromApiDocs(docs: SearchApiDoc[]): CandidateResult[] {
  return docs.map((doc, index) => ({
    index,
    text: doc.title ?? doc.typeName ?? doc.productNumber ?? "(untitled)",
    url: doc.url ? new URL(doc.url, DISTRELEC_ORIGIN).toString() : null,
    manufacturer: doc.distManufacturer ?? null,
  }));
}

/**
 * `displayFields` is a JSON-encoded array of labeled spec attributes, e.g.
 * `{"attributeName":"Package Type","value":"TO-263"}` — a real structured
 * field, preferred over inferring package from free-text description.
 */
export function packageFromDisplayFields(displayFields: string | undefined): string | null {
  if (!displayFields) return null;
  try {
    const fields: { attributeName?: string; value?: string }[] = JSON.parse(displayFields);
    const packageField = fields.find((f) => /package/i.test(f.attributeName ?? ""));
    return packageField?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * Fallback path (see navigate.ts): DOM scraping for when the search API
 * response isn't observed. Deliberately dumb — pull raw text/links off the
 * page and hand the mess to Jev to interpret, rather than encoding
 * assumptions about the page's structure here.
 *
 * Runs as a single page.evaluate() rather than looping Playwright API calls
 * per-element — a real storefront page can have hundreds of links, and a
 * round trip per element for innerText()/getAttribute() scales badly.
 *
 * Angular's render timing is inconsistent enough that a single extraction
 * pass can run before the real results list has rendered — retries
 * (re-querying the already-loaded page, not re-navigating) until the MPN
 * shows up are more robust than any fixed delay. A genuine no-results case
 * still terminates normally once attempts run out.
 */
export async function extractCandidates(page: Page, mpn: string): Promise<CandidateResult[]> {
  const maxAttempts = 4;
  let candidates = await extractCandidatesOnce(page, mpn);

  for (let attempt = 1; attempt < maxAttempts; attempt++) {
    // A plain "mentions the MPN" check is too loose — a self-referential
    // "Search: <mpn>" breadcrumb link mentions the MPN but isn't a product
    // page. Distrelec's real product URLs consistently match `/p/<id>` —
    // require that shape too before treating extraction as done. (This only
    // affects the retry decision, not what Jev is allowed to pick from.)
    const hasLikelyProductMatch = candidates.some(
      (c) => (c.text.toLowerCase().includes(mpn.toLowerCase()) || (c.url ?? "").toLowerCase().includes(mpn.toLowerCase())) && /\/p\/\d+/i.test(c.url ?? "")
    );
    if (hasLikelyProductMatch) break;

    console.warn(`[Distrelec] ${mpn} not among ${candidates.length} candidates yet (attempt ${attempt}/${maxAttempts}) — waiting and re-extracting`);
    await page.waitForTimeout(2000);
    candidates = await extractCandidatesOnce(page, mpn);
  }

  return candidates;
}

async function extractCandidatesOnce(page: Page, mpn: string): Promise<CandidateResult[]> {
  const raw = await page.evaluate((mpnArg) => {
    const anchors = Array.from(document.querySelectorAll("a"));
    const out: { text: string; url: string | null }[] = [];
    for (const a of anchors) {
      const text = (a.textContent ?? "").trim();
      const href = a.getAttribute("href");

      // A "share by email" link can embed the full product description as
      // a mailto: body param, which reads as strongly relevant text but
      // isn't a navigable product page. Whether a link is even a webpage
      // (vs. mailto:/tel:/javascript:) is a deterministic technical fact,
      // not a judgment call, so it's filtered here rather than left for Jev.
      if (href && /^(mailto|tel|javascript):/i.test(href.trim())) continue;

      if (text.length > 8) {
        // Resolve to absolute — `href` is frequently a same-site relative
        // path ("/en/...") which page.goto() can't navigate to directly.
        out.push({ text, url: href ? new URL(href, location.href).toString() : null });
      }
    }
    // Capping by DOM order before filtering can cut off the real product
    // result (its position among hundreds of nav/footer links varies).
    // Prioritize anything that mentions the MPN so a hard cap downstream
    // can't exclude a genuine match — a technical relevance pre-sort, not
    // the disambiguation judgment itself (Jev still picks among whatever
    // survives, including "none").
    //
    // Inlined rather than a named local function: esbuild/tsx wraps named
    // locals with a `__name` helper that doesn't exist inside this isolated
    // page.evaluate() context and throws ReferenceError at runtime.
    const needle = mpnArg.toLowerCase();
    out.sort((a, b) => {
      const aHit = a.text.toLowerCase().includes(needle) || (a.url ?? "").toLowerCase().includes(needle) ? 1 : 0;
      const bHit = b.text.toLowerCase().includes(needle) || (b.url ?? "").toLowerCase().includes(needle) ? 1 : 0;
      return bHit - aHit;
    });
    return out;
  }, mpn);

  return raw.slice(0, MAX_CANDIDATES).map((r, index) => ({ index, text: r.text, url: r.url }));
}

/**
 * Best-effort field parsing from raw page text (fallback path — labels
 * like "Manufacturer:\nST" aren't guaranteed to hold across redesigns).
 * This only populates display fields — the judgment call still goes to Jev
 * against the full `rawText`, so a parsing miss here degrades the report's
 * display, not the confidence score's correctness.
 */
function parseProductFields(rawText: string): Pick<ExtractedProductData, "mpn" | "manufacturer" | "package" | "price" | "stock" | "description"> {
  const mpnMatch = rawText.match(/Manufacturer Part Number:\s*\n?\s*(\S+)/i);
  const manufacturerMatch = rawText.match(/Manufacturer:\s*\n?\s*(\S+)/i);
  const priceMatch = rawText.match(/CHF\s*([\d.,]+)\s*\n*\(Exc\.?\s*Vat\)/i) ?? rawText.match(/CHF\s*([\d.,]+)/i);
  const stockMatches = [...rawText.matchAll(/(\d[\d,]*)\s*In stock/gi)];
  const totalStock = stockMatches.length
    ? stockMatches.reduce((sum, m) => sum + parseInt(m[1].replace(/,/g, ""), 10), 0)
    : null;

  return {
    mpn: mpnMatch?.[1] ?? null,
    manufacturer: manufacturerMatch?.[1] ?? null,
    package: null, // not reliably labeled on the page; left to Jev's judgment on rawText
    // Bare number, no currency prefix — currency is tracked separately on
    // the final SourcingResult. Baking it in here duplicated it downstream
    // (e.g. a UI showing currency + price as one string got "CHF CHF 1.01").
    price: priceMatch ? priceMatch[1] : null,
    stock: totalStock !== null ? String(totalStock) : null,
    description: null, // DOM fallback path — rawText carries this context instead
  };
}

/**
 * Preferred path (see navigate.ts): build the product's data directly from
 * the product-detail, availability, and price APIs' own JSON, not
 * regex-parsed DOM text — same reasoning as candidatesFromApiDocs. `rawText`
 * is still included as supplementary context for Jev, but the labeled
 * fields come from the clean, structured source when available.
 */
export function productDataFromApi(
  apiProduct: ProductApiDoc | null,
  apiAvailability: AvailabilityApiDoc | null,
  apiPrice: PriceApiDoc | null,
  rawText: string
): ExtractedProductData {
  const stockLevelTotal = apiAvailability?.productAvailability?.[0]?.stockLevelTotal;
  const price = apiPrice?.price;
  return {
    mpn: apiProduct?.typeName ?? null,
    manufacturer: apiProduct?.distManufacturer?.name ?? null,
    package: null, // not a distinct labeled field in the API response either — see `description`
    // Bare number, no currency prefix — see the note in parseProductFields above.
    price: price?.value != null ? String(price.value) : null,
    stock: stockLevelTotal !== undefined ? String(stockLevelTotal) : null,
    description: apiProduct?.description ?? null,
    rawText,
  };
}

export async function extractProductData(page: Page): Promise<ExtractedProductData> {
  const rawText = (await page.locator("body").innerText().catch(() => "")).slice(0, 6000);
  return {
    ...parseProductFields(rawText),
    rawText,
  };
}
