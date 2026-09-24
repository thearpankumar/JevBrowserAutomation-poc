import { digikeyApiBase, getDigikeyToken } from "./auth.js";

// Product Information V4 — ProductDetails by part number.
// https://developer.digikey.com/products/product-information-v4/productsearch/productdetails

interface DigikeyProductDetailsResponse {
  Product?: {
    ManufacturerProductNumber?: string;
    Manufacturer?: { Name?: string };
    UnitPrice?: number;
    QuantityAvailable?: number;
    ProductUrl?: string;
    Description?: { ProductDescription?: string };
  };
}

export async function fetchDigikeyProduct(mpn: string): Promise<DigikeyProductDetailsResponse> {
  const token = await getDigikeyToken();
  const clientId = process.env.DIGIKEY_CLIENT_ID!;

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

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`DigiKey product lookup failed: ${res.status} ${res.statusText} — ${body}`);
  }

  return (await res.json()) as DigikeyProductDetailsResponse;
}
