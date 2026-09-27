import "./env.js";
import express, { type ErrorRequestHandler } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AddToCartResponse,
  AddToDistrelecCartResponse,
  ApiErrorResponse,
  BatchJob,
  ComponentRequirement,
  DigikeyStatusResponse,
  SourceResponse,
  SourcingResult,
  StartBatchResponse,
} from "@jev/shared";
import { sourceFromBoth } from "./source.js";
import { sourceFromDigikey } from "./digikey/pipeline.js";
import { sourceFromDistrelec } from "./distrelec/pipeline.js";
import { parseBomCsv } from "./bom/parseCsv.js";
import { buildResultsCsv, reportFilename } from "./bom/exportCsv.js";
import { JobStore } from "./batch/jobStore.js";
import { runBatch } from "./batch/runBatch.js";
import { TtlCache } from "./batch/cache.js";
import { getConfig } from "./config.js";
import { logger } from "./logger.js";
import { DigikeyOAuthClient } from "./digikey/oauth.js";
import { addItemsToDigikeyCart } from "./digikey/mylists.js";
import { getDistrelecSessionStatus, loadDistrelecSession } from "./distrelec/session.js";
import { addItemsToDistrelecCart } from "./distrelec/cart.js";
import { parseAddToCartRequest } from "./cartRequest.js";

const webLog = logger.child({ component: "web" });
const batchLog = logger.child({ component: "batch" });
const digikeyOAuthLog = logger.child({ component: "digikey-oauth-route" });
const distrelecCartLog = logger.child({ component: "distrelec-cart-route" });

// Fail fast: a missing/bad .env stops the server from starting at all, with
// one clear message — instead of surfacing as a confusing error on whichever
// request happens to hit DigiKey or Jev first.
const config = getConfig();

// The React app's production build (`npm run build`). Same relative depth from
// backend/src/ (tsx) and backend/dist/ (compiled). In development the UI is
// served by Vite on :5173 instead, which proxies /api to this server.
const STATIC_DIR = fileURLToPath(new URL("../../frontend/dist", import.meta.url));

const app = express();
// Default 100kb json body limit is too small for a real BOM CSV pasted into a JSON payload.
app.use(express.json({ limit: "15mb" }));

const jobStore = new JobStore();
const sourcingCache = new TtlCache<SourcingResult[]>();
const digikeyOAuth = new DigikeyOAuthClient();

function sendError(res: express.Response, status: number, body: ApiErrorResponse): void {
  res.status(status).json(body);
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

// ---- Sourcing ----

app.post("/api/source", async (req, res) => {
  const mpn = typeof req.body?.mpn === "string" ? req.body.mpn.trim() : "";
  if (!mpn) {
    sendError(res, 400, { error: "Part number is required." });
    return;
  }

  const requirement: ComponentRequirement = { mpn, qty: 1 };
  webLog.info({ mpn }, "sourcing...");

  try {
    const { results, errors } = await sourceFromBoth(requirement);
    for (const e of errors) {
      webLog.error({ supplier: e.supplier, err: e.message }, "pipeline failed");
    }
    res.json({ results, errors } satisfies SourceResponse);
  } catch (err) {
    webLog.error({ err }, "unexpected error");
    sendError(res, 500, { error: errorMessage(err, "Unexpected server error.") });
  }
});

// ---- Batch (BOM) ----

app.post("/api/batch", (req, res) => {
  const csv = typeof req.body?.csv === "string" ? req.body.csv : "";
  if (!csv.trim()) {
    sendError(res, 400, { error: "CSV content is required." });
    return;
  }

  const { requirements, rowErrors } = parseBomCsv(csv);
  if (requirements.length === 0) {
    sendError(res, 400, { error: "No valid rows found in the uploaded file.", rowErrors });
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

  res.status(202).json({ jobId: job.id, total: requirements.length, rowErrors } satisfies StartBatchResponse);
});

app.get("/api/batch/:id", (req, res) => {
  const job = jobStore.get(req.params.id);
  if (!job) {
    sendError(res, 404, { error: "Batch job not found." });
    return;
  }
  res.json(job satisfies BatchJob);
});

app.get("/api/batch/:id/export.csv", (req, res) => {
  const job = jobStore.get(req.params.id);
  if (!job) {
    sendError(res, 404, { error: "Batch job not found." });
    return;
  }
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${reportFilename(job.createdAt)}"`);
  res.send(buildResultsCsv(job.rows));
});

// ---- DigiKey account connection (OAuth) + cart ----

app.get("/api/digikey/status", (_req, res) => {
  res.json({ connected: digikeyOAuth.isConnected() } satisfies DigikeyStatusResponse);
});

app.get("/api/digikey/oauth/start", (_req, res) => {
  try {
    const state = digikeyOAuth.generateState();
    res.redirect(digikeyOAuth.buildAuthorizeUrl(state));
  } catch (err) {
    digikeyOAuthLog.error({ err }, "could not start OAuth flow");
    sendError(res, 500, { error: errorMessage(err, "Could not start DigiKey connection.") });
  }
});

/** Back to the frontend with the outcome in the query string (the frontend shows a banner for it). */
function redirectToApp(res: express.Response, outcome: "connected" | "denied" | "error"): void {
  res.redirect(`${config.appBaseUrl}/?digikey=${outcome}`);
}

app.get("/api/digikey/oauth/callback", async (req, res) => {
  const { code, state, error } = req.query;

  if (typeof error === "string") {
    digikeyOAuthLog.warn({ error }, "user did not approve DigiKey connection");
    redirectToApp(res, "denied");
    return;
  }

  if (typeof state !== "string" || !digikeyOAuth.consumeState(state)) {
    digikeyOAuthLog.warn("OAuth callback with missing/invalid state — rejecting");
    redirectToApp(res, "error");
    return;
  }

  if (typeof code !== "string") {
    redirectToApp(res, "error");
    return;
  }

  try {
    await digikeyOAuth.exchangeCodeForTokens(code);
    redirectToApp(res, "connected");
  } catch (err) {
    digikeyOAuthLog.error({ err }, "token exchange failed");
    redirectToApp(res, "error");
  }
});

app.post("/api/digikey/cart/add", async (req, res) => {
  if (!digikeyOAuth.isConnected()) {
    sendError(res, 409, { error: "No DigiKey account connected. Connect one first." });
    return;
  }

  const parsed = parseAddToCartRequest(req.body);
  if (!parsed.ok) {
    sendError(res, 400, { error: parsed.error });
    return;
  }

  try {
    const accessToken = await digikeyOAuth.getValidAccessToken();
    const result = await addItemsToDigikeyCart(accessToken, parsed.items);
    res.json(result satisfies AddToCartResponse);
  } catch (err) {
    digikeyOAuthLog.error({ err }, "add to DigiKey cart failed");
    sendError(res, 502, { error: errorMessage(err, "Adding to DigiKey cart failed.") });
  }
});

// ---- Distrelec cart ----
//
// No per-user OAuth here: Distrelec's login is bot-protected (see
// distrelec/navigate.ts), so this reuses one shared account's session,
// captured by a person once via `npm run distrelec:login` — see
// distrelec/session.ts. "Connected" below means that saved session is
// present and not expired, not that this browser/user has connected anything.

app.get("/api/distrelec/status", (_req, res) => {
  res.json(getDistrelecSessionStatus());
});

app.post("/api/distrelec/cart/add", async (req, res) => {
  const parsed = parseAddToCartRequest(req.body);
  if (!parsed.ok) {
    sendError(res, 400, { error: parsed.error });
    return;
  }

  let session;
  try {
    session = loadDistrelecSession();
  } catch (err) {
    sendError(res, 409, { error: errorMessage(err, "No Distrelec session connected.") });
    return;
  }

  try {
    const result = await addItemsToDistrelecCart(session, parsed.items);
    res.json(result satisfies AddToDistrelecCartResponse);
  } catch (err) {
    distrelecCartLog.error({ err }, "add to Distrelec cart failed");
    sendError(res, 502, { error: errorMessage(err, "Adding to Distrelec cart failed.") });
  }
});

// Anything else under /api is a JSON 404, never the frontend's index.html.
app.use("/api", (_req, res) => {
  sendError(res, 404, { error: "Not found." });
});

// ---- Frontend ----

app.use(express.static(STATIC_DIR));
// Page URLs get the app shell; a missing *file* (favicon, a stale asset after
// a redeploy) is a real 404 instead of HTML the browser would try to parse.
app.use((req, res, next) => {
  if (req.method !== "GET" || path.extname(req.path)) return next();
  res.sendFile(path.join(STATIC_DIR, "index.html"));
});

const handleUnexpectedError: ErrorRequestHandler = (err, _req, res, _next) => {
  webLog.error({ err }, "unhandled error");
  if (res.headersSent) return;
  sendError(res, 500, { error: "Unexpected server error." });
};
app.use(handleUnexpectedError);

app.listen(config.port, () => {
  if (!existsSync(path.join(STATIC_DIR, "index.html"))) {
    logger.warn({ staticDir: STATIC_DIR }, "frontend build not found — run `npm run build`, or use `npm run dev` for development");
  }
  logger.info({ port: config.port }, `Sourcing UI running at http://localhost:${config.port}`);
});
