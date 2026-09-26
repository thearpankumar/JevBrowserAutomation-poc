import { Browser, chromium, Page } from "playwright";
import { logger } from "../logger.js";

const log = logger.child({ component: "distrelec" });

// distrelec.com is just a country-selector page (Distrelec is now part of RS
// Group; most countries redirect into rs-online.com). The Swiss store is the
// one still running standalone as distrelec.ch.
const DISTRELEC_BASE_URL = "https://www.distrelec.ch/en/";

const REALISTIC_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

/**
 * Distrelec runs Radware Bot Manager. A default headless launch gets
 * challenged immediately (keyed off the literal "HeadlessChrome" UA
 * string); a realistic UA + hiding navigator.webdriver got through once but
 * was blocked on a repeat attempt, so it's not a reliable bypass. Headed
 * mode is the only path that got through consistently, hence the default —
 * not production-viable as-is (see README Status), the real fix is proper
 * anti-bot handling or a legitimate access agreement with Distrelec.
 */
export async function launchBrowser(opts: { headless?: boolean } = {}): Promise<Browser> {
  return chromium.launch({
    headless: opts.headless ?? false,
    // Headed (not headless) is what gets past bot detection — see the note
    // above. Positioning the window off-screen keeps it out of the way
    // (e.g. behind a UI someone's using) without making it headless, which
    // would bring the detection problem straight back.
    args: ["--window-position=-2400,0", "--window-size=1280,900"],
  });
}

async function newStealthPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    userAgent: REALISTIC_USER_AGENT,
    viewport: { width: 1280, height: 800 },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  return context.newPage();
}

async function dismissCookieBanner(page: Page): Promise<void> {
  // The consent modal (Angular/Spartacus storefront) takes several seconds
  // to actually render after domcontentloaded — give it real room. Best
  // effort only: even after a successful click, an empty `.cookie-modal`
  // backdrop div can linger and keep intercepting pointer events, which is
  // why page interactions below use `force: true` rather than depending on
  // this succeeding cleanly.
  const acceptAll = page.getByRole("button", { name: /accept all/i });
  try {
    await acceptAll.first().click({ timeout: 15000 });
  } catch {
    // no banner shown, already dismissed, or blocked by its own backdrop — fine either way
  }
}

// A fixed delay guesses at rendering time and loses the race unpredictably.
// Waiting for the specific backend response to complete is deterministic —
// it either has happened or it hasn't. Results come from
// `search.distrelec.com/api/apps/webshop/query/search?q=...`; product-page
// stock/availability comes from a separate `.../products/availability`
// call. A short buffer still follows the response wait, since the response
// landing and Angular finishing its DOM diff aren't quite the same instant.
const SEARCH_API_PATTERN = /search\.distrelec\.com\/api\/apps\/webshop\/query\/search/i;
const PRODUCT_AVAILABILITY_API_PATTERN = /api\.distrelec\.com\/.*\/products\/availability/i;

async function waitForRealContent(page: Page, mpn: string, label: string): Promise<void> {
  // Network wait is best-effort and falls through on timeout — if
  // Distrelec ever changes this endpoint, this degrades back to the
  // content-based wait below rather than hanging.
  await page
    .waitForResponse((res) => SEARCH_API_PATTERN.test(res.url()) || PRODUCT_AVAILABILITY_API_PATTERN.test(res.url()), {
      timeout: 12000,
    })
    .catch(() => {
      log.warn({ mpn, label }, "no matching API response observed within 12s — falling back to content wait");
    });

  // Content-based wait as a second, independent signal/fallback — cheap to
  // keep even with the network wait in place, and it's what still worked
  // in earlier runs when this fires first.
  await page
    .getByText(mpn, { exact: false })
    .first()
    .waitFor({ state: "attached", timeout: 8000 })
    .catch(() => {
      log.warn({ mpn, label }, "never appeared within 8s — proceeding anyway");
    });

  // Small buffer for Angular to finish its DOM diff after the API response
  // it was waiting on actually lands.
  await page.waitForTimeout(800);
}

export interface SearchApiDoc {
  productNumber?: string;
  url?: string;
  title?: string;
  typeName?: string;
  distManufacturer?: string;
  singleMinPriceNet?: number;
  currency?: string;
  salesStatus?: number;
  buyable?: boolean;
  // A JSON-encoded string (not a real array), e.g.
  // '[{"attributeName":"Package Type","value":"TO-263",...}, ...]'. Real,
  // labeled spec data straight from the search result — see
  // extract.ts#packageFromDisplayFields.
  displayFields?: string;
}

export interface SearchResult {
  page: Page;
  /**
   * Parsed docs straight from the search backend's own JSON response — not
   * scraped from rendered DOM. `null` means the API call itself was never
   * observed (pattern mismatch / site change), meaning DOM-scraping is the
   * only option left; an empty array means the API was reached and
   * genuinely returned zero results.
   */
  apiDocs: SearchApiDoc[] | null;
}

export async function searchDistrelec(browser: Browser, mpn: string): Promise<SearchResult> {
  const page = await newStealthPage(browser);
  await page.goto(DISTRELEC_BASE_URL, { waitUntil: "domcontentloaded" });
  await dismissCookieBanner(page);

  // The search field has no accessible role of "searchbox", just a plain
  // textbox with this placeholder.
  //
  // `force: true`: a stale `.cookie-modal` backdrop div can remain in the
  // DOM (empty, but still intercepting pointer events) even after being
  // dismissed — skip the pointer-interception check rather than depend on
  // that widget's exact removal timing.
  const searchBox = page.getByPlaceholder(/search products, manufacturers or categories/i);
  await searchBox.first().fill(mpn, { force: true });

  // `search.distrelec.com/.../query/search` returns clean, complete,
  // structured JSON (manufacturer, price, stock status, URL, title)
  // deterministically — reading the response body directly avoids the
  // Angular DOM render-race entirely instead of trying to out-guess it.
  // DOM scraping stays as a fallback (see extractCandidates) for if this
  // endpoint ever changes.
  //
  // Reading the body happens inside the .then() attached directly to the
  // response promise, as close to the response event as possible: waiting
  // and calling .json() afterward hit "Response body is not available for
  // a response that was navigated away from" — a further client-side
  // navigation discards the buffered body quickly.
  const apiDocsPromise = page
    .waitForResponse((res) => SEARCH_API_PATTERN.test(res.url()), { timeout: 12000 })
    .then(async (res) => {
      try {
        const body = await res.json();
        const docs: SearchApiDoc[] = body?.response?.docs ?? [];
        log.info({ docCount: docs.length }, "search API returned doc(s) directly (no DOM scraping needed)");
        return docs;
      } catch (e) {
        log.warn({ err: (e as Error).message }, "search API response body unreadable — falling back to DOM scraping");
        return null;
      }
    })
    .catch(() => {
      log.warn("search API response NOT observed within 12s — falling back to DOM scraping");
      return null;
    });

  await searchBox.first().press("Enter");
  await page.waitForLoadState("domcontentloaded");
  const apiDocs = await apiDocsPromise;

  // Still wait for real DOM content too — needed for the DOM-scrape
  // fallback path, and openCandidate/product-page navigation still happens
  // on this same page afterward regardless of which path found the match.
  await waitForRealContent(page, mpn, "results page");

  return { page, apiDocs };
}

export interface ProductApiDoc {
  typeName?: string;
  description?: string;
  distManufacturer?: { name?: string };
}

export interface AvailabilityApiDoc {
  productAvailability?: { stockLevelTotal?: number }[];
}

export interface PriceApiDoc {
  price?: { value?: number; currencyIso?: string };
}

export interface ProductPageResult {
  apiProduct: ProductApiDoc | null;
  apiAvailability: AvailabilityApiDoc | null;
  apiPrice: PriceApiDoc | null;
}

const PRODUCT_DETAIL_API_PATTERN = /api\.distrelec\.com\/.*\/products\/\d+(\?|$)/i;
// The DOM-regex price parse (parseProductFields) isn't reliable on every
// product page's exact wording — read the real prices API directly instead.
const PRICE_API_PATTERN = /api\.distrelec\.com\/.*\/products\/\d+\/prices\?/i;

export async function openCandidate(page: Page, url: string, mpn: string): Promise<ProductPageResult> {
  // Same finding as the search results page — manufacturer/description
  // come from `.../products/{id}`, stock from `.../products/availability`,
  // and price from `.../products/{id}/prices`, all clean structured JSON.
  // Capturing all three directly avoids the same DOM render-race the
  // search step had.
  const apiProductPromise = page
    .waitForResponse((res) => PRODUCT_DETAIL_API_PATTERN.test(res.url()), { timeout: 12000 })
    .then((res) => res.json().catch(() => null))
    .catch(() => null);
  const apiAvailabilityPromise = page
    .waitForResponse((res) => PRODUCT_AVAILABILITY_API_PATTERN.test(res.url()), { timeout: 12000 })
    .then((res) => res.json().catch(() => null))
    .catch(() => null);
  const apiPricePromise = page
    .waitForResponse((res) => PRICE_API_PATTERN.test(res.url()), { timeout: 12000 })
    .then((res) => res.json().catch(() => null))
    .catch(() => null);

  await page.goto(url, { waitUntil: "domcontentloaded" });
  let apiAvailability = await apiAvailabilityPromise;

  // This specific capture (unlike product-detail and price) can still come
  // back null even when the page loaded fine — the passive listen sometimes
  // loses the race. The product id is derivable straight from `url`
  // (`/p/<id>`), so rather than guess a longer timeout, ask for it directly
  // as a fallback instead of passively waiting again.
  if (!apiAvailability) {
    const productIdMatch = url.match(/\/p\/(\d+)/);
    if (productIdMatch) {
      log.warn({ mpn }, "availability response missed — requesting it directly instead of retrying the passive wait");
      try {
        const directRes = await page.request.get(
          `https://api.distrelec.com/rest/v2/distrelec_CH/products/availability?fields=FULL&productCodes=${productIdMatch[1]}&lang=en&curr=CHF&channel=B2B&country=CH`
        );
        apiAvailability = directRes.ok() ? await directRes.json() : null;
      } catch {
        apiAvailability = null;
      }
    }
  }
  const [apiProduct, apiPrice] = await Promise.all([apiProductPromise, apiPricePromise]);

  await waitForRealContent(page, mpn, "product page");

  return { apiProduct, apiAvailability, apiPrice };
}
