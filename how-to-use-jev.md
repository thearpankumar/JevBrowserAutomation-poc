# How to use Jev (via OpenRouter)

**Jev** is TypeSafe AI's "System One" model — a _structured-decision_ model, not a chat/prose model. You give it a `state` (your data) and a set of typed `questions`, and it returns typed answers (a choice, a true/false-style score, or a numeric score) — never generated text. Released 2026-09-15, currently version `jev-1.13.0`.

Use it when you need a fast, predictable, schema-constrained judgment (classification, routing, moderation, yes/no checks) rather than a generated explanation.

## Auth

Same as any OpenRouter model — a Bearer token in the `Authorization` header. This project's key lives in `.env` as `OPENROUTER_JEV_API`.

```
Authorization: Bearer <OPENROUTER_JEV_API>
Content-Type: application/json
```

## Endpoint

Jev does **not** use the standard `/api/v1/chat/completions` endpoint. It has its own:

```
POST https://openrouter.ai/api/alpha/decisions
```

## Model IDs

| ID                     | Meaning                                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `typesafe/jev-1.13`    | Pinned to version 1.13 specifically                                                                                               |
| `~typesafe/jev-latest` | Always the current latest version (resolves to a dated build, e.g. `typesafe/jev-1.13-20260917`, in the response's `model` field) |

## Request shape

```json
{
  "model": "~typesafe/jev-latest",
  "state": {
    "...": "any JSON object, array, or string — the data Jev should judge"
  },
  "questions": {
    "<question_id>": {
      "type": "choice | noul | score",
      "instructions": "What judgment to perform, referencing fields from `state`",
      "criteria": "shape depends on `type`, see below"
    }
  }
}
```

You can ask multiple questions in one request — each key under `questions` gets its own answer in the response.

### Question types

| Type     | `criteria` shape                                                                                                                                         | Answer shape                                                                           | Use for                              |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------ |
| `noul`   | `{ "true": "...", "false": "..." }` — description of each outcome                                                                                        | `{ "noul": 0.0–1.0 }` (probability of "true")                                          | Yes/no judgments                     |
| `choice` | Record: `{ "<option key>": "<description>" }` — **not** an array; the live API returns `400 Invalid input: expected record, received array` for an array | `{ "choice": "<one of the keys>" }`                                                    | Picking one option from a fixed list |
| `score`  | Array of ordered labels (low → high)                                                                                                                     | `{ "score": <float>, "confidence": <float>, "probabilities": {...}, "legend": {...} }` | Rating something on an ordered scale |

## Example

```bash
curl -X POST "https://openrouter.ai/api/alpha/decisions" \
  -H "Authorization: Bearer $OPENROUTER_JEV_API" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "~typesafe/jev-latest",
    "state": {
      "part": {
        "mpn": "STM32F411CEU6",
        "description": "ARM Cortex-M4 32-bit MCU, 512KB Flash, 128KB RAM, LQFP-48"
      },
      "category_definition": "Microcontrollers and embedded processors."
    },
    "questions": {
      "matches_category": {
        "type": "noul",
        "instructions": "Does the item described in `part` belong in the category defined by `category_definition`?",
        "criteria": {
          "true": "The item is the kind of thing the category definition describes.",
          "false": "The item belongs in a different category."
        }
      }
    }
  }'
```

### Response

```json
{
  "model": "typesafe/jev-1.13-20260917",
  "answers": {
    "matches_category": { "type": "noul", "noul": 0.99 }
  },
  "usage": {
    "input_tokens": 398,
    "output_tokens": 21,
    "cost": 0.000016716
  },
  "id": "gen-dec-xxxxx",
  "provider": "TypeSafe"
}
```

No prose to parse — `answers.matches_category.noul` is directly usable as a confidence score in code.

## Limits

Two independent limits apply per API key:

- **Credit limit (spending)**: an optional per-key cap, resets on whatever cadence the key was configured with (e.g. daily). Check `GET https://openrouter.ai/api/v1/key` (Bearer auth, same header as above) — the response's `limit`/`limit_remaining`/`limit_reset` fields show the cap, what's left, and when it resets. Exceeding it returns `402 Payment Required`.
- **Rate limit (requests/day)**: separate from spending, applies specifically to `:free` chat model variants — tiered by all-time credits purchased on the account (50 requests/day under 10 credits purchased, 1,000/day at 10+), plus 20 requests/minute. Tracked in the same key-info response under `free_model_daily_requests`. Jev itself is a paid model, not a free variant, so its calls count against the credit limit only, not this request cap. Exceeding it returns `429 Too Many Requests`.

## References

- [Jev SDK for TypeScript and Python](https://openrouter.ai/docs/guides/community/typesafe-sdk)
- [How to Use Jev: Moderation with the Jev API in TypeScript](https://openrouter.ai/blog/tutorials/how-to-use-jev/)
- [What Is Jev? TypeSafe's Decision Model Explained](https://openrouter.ai/blog/insights/what-is-jev/)
- [Jev Latest on OpenRouter](https://openrouter.ai/~typesafe/jev-latest)
- [Jev 1.13 on OpenRouter](https://openrouter.ai/typesafe/jev-1.13)
- [TypeSafe AI docs](https://docs.typesafe.ai/)
