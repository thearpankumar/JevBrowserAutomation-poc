# JevBrowserAutomation-poc

Proof-of-concept notes and reference material for using **Jev**, TypeSafe AI's structured-decision model (accessed via OpenRouter), as part of a browser automation workflow.

Jev is not a chat/prose model — you send it a `state` (data) plus typed `questions`, and it returns typed answers (a choice, a probability-style score, or a numeric score) instead of generated text. This makes it useful for fast, predictable judgments — classification, routing, moderation, yes/no checks — inside an automation pipeline.

## Contents

- [`how-to-use-jev.md`](./how-to-use-jev.md) — reference guide covering auth, the decisions endpoint, model IDs, request/response shapes, question types, and rate/credit limits.
- [`src/`](./src) — the POC: BOM-style component sourcing from **Distrelec** (no public API — Playwright browser automation, with Jev used to disambiguate search results and verify the chosen product actually matches spec) and **DigiKey** (public Product Information V4 API — no Jev needed, the data is already structured and trusted).

## Why two suppliers, two approaches

DigiKey exposes a clean developer API, so sourcing from it is a direct API call — no judgment involved. Distrelec doesn't expose a public API, so a search results page has to be navigated and read the way a human would; Jev stands in for the human judgment call of "which result is actually correct" and "does this data really match what was asked for." The POC proves the harder path (Distrelec + Jev) works and stays resilient to page changes, and pairs it with the trivial path (DigiKey) to produce a real side-by-side comparison.

## Architecture

Full target architecture (including production-only refinements not built in this POC — a vision-based navigation fallback, a per-supplier circuit breaker, and confidence-threshold calibration) is documented separately. This POC implements the core loop only: `navigate → extract → Jev disambiguate → navigate → extract → Jev verify → result`, for Distrelec, plus a plain API call for DigiKey — no job queue, database, cache, or ranking engine.

## Setup

```bash
npm install
npx playwright install chromium
cp .env.example .env   # fill in OPENROUTER_JEV_API and DIGIKEY_CLIENT_ID/SECRET
```

## Usage

```bash
npm run source -- STM32F407VGT6 STMicroelectronics LQFP-100 100
```

Prints a side-by-side table (DigiKey vs. Distrelec) plus the full JSON result, including Jev's disambiguation/verification trace for the Distrelec result.

## Status

Early-stage proof of concept. Distrelec's page locators (`src/distrelec/navigate.ts`) are a first pass and have not yet been verified against the live site — that verification is the first build step before the rest of the pipeline can be trusted end to end.

## License

Licensed under the [Apache License 2.0](./LICENSE).
