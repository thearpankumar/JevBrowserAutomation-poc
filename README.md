# JevBrowserAutomation-poc

Proof-of-concept notes and reference material for using **Jev**, TypeSafe AI's structured-decision model (accessed via OpenRouter), as part of a browser automation workflow.

Jev is not a chat/prose model — you send it a `state` (data) plus typed `questions`, and it returns typed answers (a choice, a probability-style score, or a numeric score) instead of generated text. This makes it useful for fast, predictable judgments — classification, routing, moderation, yes/no checks — inside an automation pipeline.

## Contents

- [`how-to-use-jev.md`](./how-to-use-jev.md) — reference guide covering auth, the decisions endpoint, model IDs, request/response shapes, question types, and rate/credit limits.

## Status

Early-stage proof of concept. This repo currently holds reference documentation; automation code will be added as the POC develops.

## License

Licensed under the [Apache License 2.0](./LICENSE).
