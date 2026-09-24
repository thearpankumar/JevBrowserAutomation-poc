// Thin wrapper around Jev's decisions endpoint. See how-to-use-jev.md for the full reference.

const JEV_ENDPOINT = "https://openrouter.ai/api/alpha/decisions";
const JEV_MODEL = "~typesafe/jev-latest";

export type JevQuestionType = "choice" | "noul" | "score";

export interface JevQuestion {
  type: JevQuestionType;
  instructions: string;
  criteria: unknown;
}

export interface JevRequest {
  state: unknown;
  questions: Record<string, JevQuestion>;
}

export interface JevAnswer {
  type: JevQuestionType;
  choice?: string;
  noul?: number;
  score?: number;
  confidence?: number;
  probabilities?: Record<string, number>;
  legend?: Record<string, unknown>;
}

export interface JevResponse {
  model: string;
  answers: Record<string, JevAnswer>;
  usage: { input_tokens: number; output_tokens: number; cost: number };
  id: string;
  provider: string;
}

export async function askJev(request: JevRequest): Promise<JevResponse> {
  const apiKey = process.env.OPENROUTER_JEV_API;
  if (!apiKey) {
    throw new Error("OPENROUTER_JEV_API is not set (see .env.example)");
  }

  const res = await fetch(JEV_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: JEV_MODEL, ...request }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Jev request failed: ${res.status} ${res.statusText} — ${body}`);
  }

  return (await res.json()) as JevResponse;
}
