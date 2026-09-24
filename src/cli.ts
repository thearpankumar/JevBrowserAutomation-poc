import "dotenv/config";
import { ComponentRequirement, SourcingResult } from "./types.js";
import { sourceFromDistrelec } from "./distrelec/pipeline.js";
import { sourceFromDigikey } from "./digikey/pipeline.js";

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

  const [digikey, distrelec] = await Promise.allSettled([
    sourceFromDigikey(requirement),
    sourceFromDistrelec(requirement),
  ]);

  const results: SourcingResult[] = [];
  for (const [label, settled] of [
    ["DigiKey", digikey],
    ["Distrelec", distrelec],
  ] as const) {
    if (settled.status === "fulfilled") {
      results.push(settled.value);
    } else {
      console.error(`[${label}] pipeline failed:`, settled.reason);
    }
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
