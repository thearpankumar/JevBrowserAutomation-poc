// Real end-to-end smoke test: drives the running app in a real (headless)
// browser against the REAL DigiKey and Distrelec — it uses real API quota and
// launches real Distrelec browser sessions, so it's run by hand, never in CI.
//
//   npm run build && npm start      # in one terminal (or `npm run dev`)
//   npm run e2e                     # in another; E2E_BASE_URL=http://localhost:5173 for dev
//
// Set E2E_CHECK_DIGIKEY_LOGIN=1 to also confirm "Connect DigiKey account"
// reaches DigiKey's real login page (needs DIGIKEY_OAUTH_REDIRECT_URI set).
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const BOM_PATH = fileURLToPath(new URL("./fixtures/sample-bom.csv", import.meta.url));
const BATCH_TIMEOUT_MS = 240_000;

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
// Only our own app's errors count — third-party pages we navigate to (DigiKey's
// login page runs a Cloudflare bot check that 403s a headless browser) aren't ours.
const appOrigin = new URL(BASE_URL).origin;
const isOurs = () => page.url().startsWith(appOrigin);
const pageErrors = [];
page.on("pageerror", (err) => isOurs() && pageErrors.push(err.message));
page.on("console", (msg) => msg.type() === "error" && isOurs() && pageErrors.push(msg.text()));

try {
  await page.goto(BASE_URL);
  check("app loads", (await page.title()) === "Component Sourcing");

  // ---- Single part ----
  console.log("\nSingle part search (real suppliers)…");
  await page.getByLabel("Part number").fill("STM32F407VGT6");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("heading", { name: "DigiKey" }).waitFor({ timeout: 180_000 });
  const cards = await page.locator("#panel-single .result-card").allTextContents();
  check(
    "DigiKey result shown",
    cards.some((c) => c.includes("STMicroelectronics"))
  );
  check("Distrelec result shown", await page.getByRole("heading", { name: "Distrelec" }).isVisible());
  check("confidence badges shown", (await page.locator("#panel-single .badge").count()) >= 2);

  // ---- Batch ----
  console.log("\nBatch run (real suppliers)…");
  await page.getByRole("tab", { name: "Batch (BOM)" }).click();
  await page.setInputFiles("#bomFile", BOM_PATH);
  check("chosen file name shown", (await page.locator(".dropzone-filename").textContent()) === "sample-bom.csv");
  await page.getByRole("button", { name: /upload & run/i }).click();
  await page.getByRole("link", { name: "Download report (CSV)" }).waitFor({ timeout: BATCH_TIMEOUT_MS });

  const chips = await page.locator(".chip").allTextContents();
  check("stat chips: 4 parts, 1 not found", chips[0] === "4Parts" && chips[4] === "1Not found", chips.join(" | "));
  check("not-found line shown", await page.getByText("No match found on either supplier.").isVisible());

  const boxes = page.locator(".row-check");
  const total = await boxes.count();
  const preChecked = await page.locator(".row-check:checked").count();
  check("a checkbox per real result", total >= 6, `${total}`);
  check("confirmed matches pre-checked", preChecked > 0, `${preChecked}/${total}`);

  const summaryBefore = await page.locator(".selection-cart-count").allTextContents();
  await boxes.first().click();
  const summaryAfter = await page.locator(".selection-cart-count").allTextContents();
  check("summary updates on toggle", summaryBefore.join() !== summaryAfter.join(), `${summaryBefore} → ${summaryAfter}`);

  await page.getByRole("button", { name: "Select all", exact: true }).click();
  check("Select all", (await page.locator(".row-check:checked").count()) === total);
  await page.getByRole("button", { name: "Clear" }).click();
  check("Clear", (await page.locator(".row-check:checked").count()) === 0);
  await page.getByRole("button", { name: "Select all confirmed" }).click();
  check("Select all confirmed", (await page.locator(".row-check:checked").count()) === preChecked);

  const download = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download report (CSV)" }).click(),
  ]).then(([d]) => d);
  check(
    "CSV report downloads with a readable name",
    /^sourcing-report-\d{8}-\d{4}\.csv$/.test(download.suggestedFilename()),
    download.suggestedFilename()
  );

  check("Distrelec cart button disabled (not built yet)", await page.getByRole("button", { name: "Add to Distrelec cart" }).isDisabled());
  // Checked before the optional DigiKey step, which leaves our app.
  check("no browser console errors from the app", pageErrors.length === 0, pageErrors.join(" | "));

  if (process.env.E2E_CHECK_DIGIKEY_LOGIN === "1") {
    const connect = page.getByRole("button", { name: "Connect DigiKey account" });
    if (await connect.isVisible()) {
      await Promise.all([page.waitForURL(/digikey\.com/, { timeout: 30_000 }), connect.click()]);
      check("Connect DigiKey reaches DigiKey's real login page", /digikey\.com/.test(page.url()), new URL(page.url()).host);
    } else {
      check("Connect DigiKey button present (account already connected — skipped)", true);
    }
  }
} catch (err) {
  check("smoke test ran to completion", false, err instanceof Error ? err.message : String(err));
} finally {
  await browser.close();
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
