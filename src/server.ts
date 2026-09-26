import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ComponentRequirement, SourcingResult } from "./types.js";
import { sourceFromBoth } from "./source.js";
import { sourceFromDigikey } from "./digikey/pipeline.js";
import { sourceFromDistrelec } from "./distrelec/pipeline.js";
import { parseBomCsv } from "./bom/parseCsv.js";
import { buildResultsCsv } from "./bom/exportCsv.js";
import { JobStore } from "./batch/jobStore.js";
import { runBatch } from "./batch/runBatch.js";
import { TtlCache } from "./batch/cache.js";
import { getConfig } from "./config.js";
import { logger } from "./logger.js";

const webLog = logger.child({ component: "web" });
const batchLog = logger.child({ component: "batch" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "..", "public");

// Fail fast: a missing/bad .env should stop the server from starting at all,
// with one clear message — not surface as a confusing error on whichever
// request happens to hit DigiKey or Jev first.
const config = getConfig();

const app = express();
// Default 100kb json body limit is too small for a real BOM CSV pasted into a JSON payload.
app.use(express.json({ limit: "15mb" }));
app.use(express.static(PUBLIC_DIR));

const jobStore = new JobStore();
const sourcingCache = new TtlCache<SourcingResult[]>();

app.post("/api/source", async (req, res) => {
  const mpn = typeof req.body?.mpn === "string" ? req.body.mpn.trim() : "";

  if (!mpn) {
    res.status(400).json({ error: "Part number is required." });
    return;
  }

  const requirement: ComponentRequirement = { mpn, qty: 1 };

  webLog.info({ mpn }, "sourcing...");

  try {
    const { results, errors } = await sourceFromBoth(requirement);
    for (const e of errors) {
      webLog.error({ supplier: e.supplier, err: e.message }, "pipeline failed");
    }
    res.json({ results, errors });
  } catch (err) {
    webLog.error({ err }, "unexpected error");
    res.status(500).json({ error: err instanceof Error ? err.message : "Unexpected server error." });
  }
});

app.post("/api/batch", (req, res) => {
  const csv = typeof req.body?.csv === "string" ? req.body.csv : "";
  if (!csv.trim()) {
    res.status(400).json({ error: "CSV content is required." });
    return;
  }

  const { requirements, rowErrors } = parseBomCsv(csv);
  if (requirements.length === 0) {
    res.status(400).json({ error: "No valid rows found in the uploaded file.", rowErrors });
    return;
  }

  const job = jobStore.create(requirements, rowErrors);
  batchLog.info({ jobId: job.id, partCount: requirements.length }, "starting batch");

  // Fire-and-forget: the client polls GET /api/batch/:id for live progress
  // instead of this request blocking for however long the whole BOM takes.
  runBatch(job, { sourceFromDigikey, sourceFromDistrelec }, { cache: sourcingCache }).catch((err) => {
    batchLog.error({ jobId: job.id, err }, "unexpected failure");
    job.status = "done";
    job.completedAt = new Date().toISOString();
  });

  res.status(202).json({ jobId: job.id, total: requirements.length, rowErrors });
});

app.get("/api/batch/:id", (req, res) => {
  const job = jobStore.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Batch job not found." });
    return;
  }
  res.json(job);
});

app.get("/api/batch/:id/export.csv", (req, res) => {
  const job = jobStore.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Batch job not found." });
    return;
  }
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${reportFilename(job.createdAt)}"`);
  res.send(buildResultsCsv(job.rows));
});

/** A readable, sortable filename instead of exposing the raw internal job id — e.g. "2026-09-26T19:23:29.030Z" -> "sourcing-report-2026-09-26-1923.csv". */
function reportFilename(createdAtIso: string): string {
  const stamp = createdAtIso
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "")
    .replace("T", "-")
    .slice(0, 13);
  return `sourcing-report-${stamp.slice(0, 8)}-${stamp.slice(9)}.csv`;
}

app.listen(config.port, () => {
  logger.info({ port: config.port }, `Sourcing UI running at http://localhost:${config.port}`);
});
