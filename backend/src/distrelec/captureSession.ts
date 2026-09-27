import { createInterface } from "node:readline/promises";
import { chromium } from "playwright";
import { SESSION_FILE } from "./session.js";

// Distrelec's login page runs Radware Bot Manager and, on the sign-in form
// specifically, an invisible reCAPTCHA gate that silently blocks an
// automated submit (confirmed live — no login network call ever fires, even
// though the click itself registers). A real person passes both trivially,
// so this captures their session instead of automating the login itself.
const REALISTIC_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: false }); // real, visible, on-screen window
  const context = await browser.newContext({ userAgent: REALISTIC_USER_AGENT, viewport: null });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  const page = await context.newPage();
  await page.goto("https://www.distrelec.ch/en/", { waitUntil: "domcontentloaded" });

  console.log("\nA Distrelec window just opened. In it:");
  console.log("  1. Dismiss the cookie banner if shown.");
  console.log("  2. Click 'Sign in' and log in with the Distrelec account to use for cart automation.");
  console.log("  3. Solve any 'I'm not a robot' check if one appears.\n");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await rl.question("Once you're logged in (the header shows your account, not 'Sign in'), press Enter here: ");
  rl.close();

  await context.storageState({ path: SESSION_FILE });
  console.log(`Session saved to ${SESSION_FILE}`);
  await browser.close();
}

main();
