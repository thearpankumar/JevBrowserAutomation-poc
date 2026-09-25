import "dotenv/config";
import { ComponentRequirement } from "./types.js";
import { sourceFromBoth } from "./source.js";

async function main() {
  const [mpn, manufacturer, pkg, qtyArg] = process.argv.slice(2);

  if (!mpn) {
    console.error("Usage: npm run source -- <MPN> [manufacturer] [package] [qty]");
    process.exit(1);
  }

  const requirement: ComponentRequirement = {
    mpn,
    manufacturer,
    package: pkg,
    qty: qtyArg ? parseInt(qtyArg, 10) : 1,
  };

  console.log(`\nSourcing ${requirement.mpn} (qty ${requirement.qty})...\n`);

  const { results, errors } = await sourceFromBoth(requirement);

  for (const e of errors) {
    console.error(`[${e.supplier}] pipeline failed:`, e.message);
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
  console.error("Fatal error:", err);
  process.exit(1);
});
