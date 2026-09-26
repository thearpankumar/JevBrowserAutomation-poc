import "dotenv/config";
import { ComponentRequirement } from "./types.js";
import { sourceFromBoth } from "./source.js";
import { getConfig } from "./config.js";
import { logger } from "./logger.js";

const log = logger.child({ component: "cli" });

async function main() {
  // Fail fast on a missing/bad .env instead of after already printing "Sourcing X...".
  getConfig();

  const [mpn, pkg, qtyArg] = process.argv.slice(2);

  if (!mpn) {
    console.error("Usage: npm run source -- <MPN> [package] [qty]");
    process.exit(1);
  }

  const requirement: ComponentRequirement = {
    mpn,
    package: pkg,
    qty: qtyArg ? parseInt(qtyArg, 10) : 1,
  };

  log.info({ mpn: requirement.mpn, qty: requirement.qty }, "sourcing...");

  const { results, errors } = await sourceFromBoth(requirement);

  for (const e of errors) {
    log.error({ supplier: e.supplier, err: e.message }, "pipeline failed");
  }

  console.table(
    results.map((r) => ({
      supplier: r.supplier,
      manufacturer: r.manufacturer,
      price: r.price,
      currency: r.currency,
      stock: r.stock,
      confidence: r.confidence,
      sourceUrl: r.sourceUrl,
    }))
  );

  console.log("\nFull results (including Jev decision trace for Distrelec):\n");
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  log.error({ err }, "fatal error");
  process.exit(1);
});
