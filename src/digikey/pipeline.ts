import { ComponentRequirement, SourcingResult } from "../types.js";
import { DigikeyNotFoundError, DigikeyProduct, fetchDigikeyProduct, searchDigikeyByKeyword } from "./client.js";

function notFoundResult(requirement: ComponentRequirement, reason: string): SourcingResult {
  console.warn(`[DigiKey] ${requirement.mpn}: not found — ${reason}`);
  return {
    supplier: "DigiKey",
    mpn: requirement.mpn,
    manufacturer: null,
    price: null,
    currency: null,
    stock: null,
    leadTime: null,
    confidence: 0,
    sourceUrl: null,
    fetchedAt: new Date().toISOString(),
  };
}

function resultFromProduct(product: DigikeyProduct, requirement: ComponentRequirement): SourcingResult {
  return {
    supplier: "DigiKey",
    mpn: product.ManufacturerProductNumber ?? requirement.mpn,
    manufacturer: product.Manufacturer?.Name ?? null,
    price: product.UnitPrice != null ? product.UnitPrice.toFixed(2) : null,
    currency: "USD",
    stock: product.QuantityAvailable ?? null,
    leadTime: null,
    // Trusted, structured, authoritative data — nothing for Jev to judge.
    confidence: 1.0,
    sourceUrl: product.ProductUrl ?? null,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Resolves the "duplicate products across manufacturers" case: pulls the
 * real candidate list via KeywordSearch. With no manufacturer given to
 * filter by, every distinct manufacturer with an exact MPN match is a
 * legitimate, separate result — not narrowed down to one.
 */
async function resolveAmbiguousMatches(requirement: ComponentRequirement): Promise<SourcingResult[]> {
  const candidates = await searchDigikeyByKeyword(requirement.mpn);
  const exactMatches = candidates.filter((p) => p.ManufacturerProductNumber?.toLowerCase() === requirement.mpn.toLowerCase());

  const byManufacturer = new Map<string, DigikeyProduct>();
  for (const p of exactMatches) {
    const key = (p.Manufacturer?.Name ?? "").toLowerCase();
    if (!key || byManufacturer.has(key)) continue;
    byManufacturer.set(key, p);
  }

  if (byManufacturer.size === 0) {
    console.warn(`[DigiKey] ${requirement.mpn}: keyword search found ${candidates.length} candidate(s) but none matched the MPN exactly`);
    return [];
  }

  console.log(
    `[DigiKey] ${requirement.mpn}: resolved ambiguity to ${byManufacturer.size} distinct manufacturer(s) among ${candidates.length} candidate(s): ${[
      ...byManufacturer.values(),
    ]
      .map((p) => p.Manufacturer?.Name)
      .join(", ")}`
  );
  return [...byManufacturer.values()].map((p) => resultFromProduct(p, requirement));
}

export async function sourceFromDigikey(requirement: ComponentRequirement): Promise<SourcingResult[]> {
  let response;
  try {
    response = await fetchDigikeyProduct(requirement.mpn);
  } catch (e) {
    // Any other error (auth failure, network, 5xx) is a real infra problem
    // and should keep propagating rather than being treated as "not found".
    if (e instanceof DigikeyNotFoundError) {
      if (/duplicate products/i.test(e.message)) {
        const resolved = await resolveAmbiguousMatches(requirement);
        if (resolved.length > 0) return resolved;
      }
      return [notFoundResult(requirement, e.message)];
    }
    throw e;
  }

  const product = response.Product;
  if (!product) {
    return [notFoundResult(requirement, "empty Product in response")];
  }

  return [resultFromProduct(product, requirement)];
}
