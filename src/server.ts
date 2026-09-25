import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ComponentRequirement } from "./types.js";
import { sourceFromBoth } from "./source.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

const app = express();
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

app.post("/api/source", async (req, res) => {
  const mpn = typeof req.body?.mpn === "string" ? req.body.mpn.trim() : "";

  if (!mpn) {
    res.status(400).json({ error: "Part number is required." });
    return;
  }

  const requirement: ComponentRequirement = { mpn, qty: 1 };

  console.log(`[web] sourcing "${mpn}"...`);

  try {
    const { results, errors } = await sourceFromBoth(requirement);
    for (const e of errors) {
      console.error(`[web] [${e.supplier}] pipeline failed:`, e.message);
    }
    res.json({ results, errors });
  } catch (err) {
    console.error("[web] unexpected error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Unexpected server error." });
  }
});

app.listen(PORT, () => {
  console.log(`\nSourcing UI running at http://localhost:${PORT}\n`);
});
