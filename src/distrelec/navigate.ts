import { Browser, chromium, Page } from "playwright";

const DISTRELEC_BASE_URL = "https://www.distrelec.com";

/**
 * NOTE: locator strategies below are a first pass, written from Distrelec's
 * general site conventions, not yet verified against the live DOM. Before
 * relying on this in a demo, run `npm run source -- <MPN>` with
 * `headless: false` once and adjust the locators to whatever actually
 * renders — that verification pass is step 1 of the build plan.
 */

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({ headless: true });
}

export async function searchDistrelec(browser: Browser, mpn: string): Promise<Page> {
  const page = await browser.newPage();
  await page.goto(DISTRELEC_BASE_URL, { waitUntil: "domcontentloaded" });

  // Prefer role/label-based locators over CSS classes so this survives
  // visual redesigns — see the resilience discussion in the architecture doc.
  const searchBox = page.getByRole("searchbox").or(page.getByRole("textbox", { name: /search/i }));
  await searchBox.first().click();
  await searchBox.first().fill(mpn);
  await searchBox.first().press("Enter");

  await page.waitForLoadState("domcontentloaded");
  return page;
}

export async function openCandidate(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
}
