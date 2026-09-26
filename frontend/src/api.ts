import type {
  AddToCartRequest,
  AddToCartResponse,
  ApiErrorResponse,
  BatchJob,
  BomRowError,
  CartItem,
  DigikeyStatusResponse,
  SourceRequest,
  SourceResponse,
  StartBatchRequest,
  StartBatchResponse,
} from "@jev/shared";

export const NETWORK_ERROR_MESSAGE = "Couldn't reach the server. Is it running?";
const GENERIC_ERROR_MESSAGE = "Something went wrong.";

export class ApiError extends Error {
  constructor(
    message: string,
    /** null when the request never got a usable response (network down, dev proxy with no backend). */
    readonly status: number | null,
    /** Per-row detail when a BOM upload is rejected — e.g. "this looks like an Excel file". */
    readonly rowErrors: BomRowError[] = []
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError(NETWORK_ERROR_MESSAGE, null);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    // Every API route answers with JSON, so a non-JSON response means we
    // didn't reach the API itself (e.g. the Vite dev proxy with the backend down).
    throw new ApiError(NETWORK_ERROR_MESSAGE, null);
  }

  if (!res.ok) {
    const err = body as Partial<ApiErrorResponse> | null;
    throw new ApiError(err?.error || GENERIC_ERROR_MESSAGE, res.status, err?.rowErrors ?? []);
  }
  return body as T;
}

function postJson<T>(path: string, payload: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export const api = {
  source: (mpn: string) => postJson<SourceResponse>("/api/source", { mpn } satisfies SourceRequest),
  startBatch: (csv: string) => postJson<StartBatchResponse>("/api/batch", { csv } satisfies StartBatchRequest),
  getBatch: (jobId: string) => request<BatchJob>(`/api/batch/${encodeURIComponent(jobId)}`),
  digikeyStatus: () => request<DigikeyStatusResponse>("/api/digikey/status"),
  addToDigikeyCart: (items: CartItem[]) => postJson<AddToCartResponse>("/api/digikey/cart/add", { items } satisfies AddToCartRequest),
};

export function exportCsvUrl(jobId: string): string {
  return `/api/batch/${encodeURIComponent(jobId)}/export.csv`;
}

/** A full-page navigation, not a fetch: OAuth has to happen as a real browser redirect to DigiKey's login page. */
export const DIGIKEY_CONNECT_URL = "/api/digikey/oauth/start";
