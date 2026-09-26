import { digikeyApiBase, getDigikeyToken } from "./auth.js";
import { getConfig } from "../config.js";

// Product Information V4 — ProductDetails by part number.
// https://developer.digikey.com/products/product-information-v4/productsearch/productdetails

export interface DigikeyProduct {
  ManufacturerProductNumber?: string;
  Manufacturer?: { Name?: string };
  UnitPrice?: number;
  QuantityAvailable?: number;
  ProductUrl?: string;
  Description?: { ProductDescription?: string };
}

interface DigikeyProductDetailsResponse {
  Product?: DigikeyProduct;
}

interface DigikeyKeywordSearchResponse {
  Products?: DigikeyProduct[];
}

/**
 * DigiKey's API returns 404 for two different situations, both handled as
 * an error with the real reason attached rather than a generic throw:
 *  - the part genuinely doesn't exist ("Requested Product ... Not Found")
 *  - the MPN is ambiguous across manufacturers ("Duplicate Products found
 *    for X. Please narrow your search or provide manufacturerId")
 * The pipeline (digikey/pipeline.ts) treats the first as a clean not-found
 * result, and resolves the second via `searchDigikeyByKeyword` + a
 * manufacturer filter rather than giving up.
 */
export class DigikeyNotFoundError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "DigikeyNotFoundError";
  }
}

export async function fetchDigikeyProduct(mpn: string): Promise<DigikeyProductDetailsResponse> {
  const token = await getDigikeyToken();
  const clientId = getConfig().digikey.clientId;

  const url = `${digikeyApiBase()}/products/v4/search/${encodeURIComponent(mpn)}/productdetails`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-DIGIKEY-Client-Id": clientId,
      "X-DIGIKEY-Locale-Site": "US",
      "X-DIGIKEY-Locale-Language": "en",
      "X-DIGIKEY-Locale-Currency": "USD",
    },
  });

  if (res.status === 404) {
    const body = await res.text().catch(() => "");
    const reason = (() => {
      try {
        return JSON.parse(body).detail ?? body;
      } catch {
        return body;
      }
    })();
    throw new DigikeyNotFoundError(reason || "not found");
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`DigiKey product lookup failed: ${res.status} ${res.statusText} — ${body}`);
  }

  return (await res.json()) as DigikeyProductDetailsResponse;
}

/**
 * `productdetails` requires an exact, unambiguous MPN. There's no
 * MPN->manufacturerId lookup endpoint (`/products/v4/manufacturers` 404s),
 * so ambiguous MPNs are resolved here instead: this endpoint returns a real
 * list of candidate products (each with `Manufacturer.Name`), filtered by
 * the requirement's manufacturer.
 */
export async function searchDigikeyByKeyword(keyword: string): Promise<DigikeyProduct[]> {
  const token = await getDigikeyToken();
  const clientId = getConfig().digikey.clientId;

  const res = await fetch(`${digikeyApiBase()}/products/v4/search/keyword`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-DIGIKEY-Client-Id": clientId,
      "X-DIGIKEY-Locale-Site": "US",
      "X-DIGIKEY-Locale-Language": "en",
      "X-DIGIKEY-Locale-Currency": "USD",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ Keywords: keyword, Limit: 10, Offset: 0 }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`DigiKey keyword search failed: ${res.status} ${res.statusText} — ${body}`);
  }

  const body = (await res.json()) as DigikeyKeywordSearchResponse;
  return body.Products ?? [];
}
