import type { AddToCartResponse, CartItem } from "@jev/shared";
import { getConfig } from "../config.js";
import { logger } from "../logger.js";

const log = logger.child({ component: "digikey-mylists" });

// Verified against DigiKey's published MyLists OpenAPI spec
// (developer.digikey.com/node/2660/oas-download) — exact request field
// names below are confirmed. The CreateList *response* body's exact field
// name for the new list's id was NOT confirmed against a real live call
// (needs a connected account to actually test) — see the defensive
// extraction + explicit error in createList below rather than a guessed
// field name silently returning undefined.
const MYLISTS_BASE = "https://api.digikey.com/mylists/v1";

function authHeaders(accessToken: string): Record<string, string> {
  const { clientId } = getConfig().digikey;
  return {
    Authorization: `Bearer ${accessToken}`,
    "X-DIGIKEY-Client-Id": clientId,
    "Content-Type": "application/json",
  };
}

async function createList(accessToken: string, listName: string, fetchImpl: typeof fetch): Promise<string> {
  const res = await fetchImpl(`${MYLISTS_BASE}/lists`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ ListName: listName, Source: "b2b" }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`DigiKey MyLists create-list failed: ${res.status} ${res.statusText} — ${body}`);
  }

  const json = (await res.json()) as Record<string, unknown>;
  // Defensive: the exact response field name wasn't confirmed against a real
  // call — try the plausible casings rather than assume one and silently
  // return undefined if DigiKey's real response uses something else.
  const id = json.ListId ?? json.Id ?? json.id ?? json.listId;
  if (typeof id !== "string" && typeof id !== "number") {
    log.error({ response: json }, "could not find a list id field in DigiKey's create-list response — see comment in mylists.ts");
    throw new Error("DigiKey created the list but its response didn't contain a recognizable list id — check the real response shape.");
  }
  return String(id);
}

export async function addItemsToDigikeyCart(
  accessToken: string,
  items: CartItem[],
  opts: { listName?: string; fetchImpl?: typeof fetch } = {}
): Promise<AddToCartResponse> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const listName = opts.listName ?? `Sourcing POC — ${new Date().toISOString().slice(0, 10)}`;

  const listId = await createList(accessToken, listName, fetchImpl);
  log.info({ listId, itemCount: items.length }, "created DigiKey list, adding parts");

  const requestedParts = items.map((item) => ({
    RequestedPartNumber: item.mpn,
    ManufacturerName: item.manufacturer ?? undefined,
    Quantities: [{ Quantity: item.quantity }],
  }));

  const res = await fetchImpl(`${MYLISTS_BASE}/lists/${encodeURIComponent(listId)}/parts`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(requestedParts),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`DigiKey MyLists add-parts failed: ${res.status} ${res.statusText} — ${body}`);
  }

  const addedIdentifiers = (await res.json()) as string[];
  log.info({ listId, addedCount: addedIdentifiers.length }, "added parts to DigiKey list");
  return { listId, addedIdentifiers };
}
