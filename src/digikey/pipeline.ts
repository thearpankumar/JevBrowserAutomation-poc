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

function looselyMatchesManufacturer(candidate: string | undefined, required: string | undefined): boolean {
  if (!candidate || !required) return false;
  const a = candidate.toLowerCase();
  const b = required.toLowerCase();
  return a.includes(b) || b.includes(a);
}

/**
 * Resolves the "duplicate products across manufacturers" case: pulls the
 * real candidate list via KeywordSearch and filters by the requirement's
 * manufacturer.
 */
async function resolveAmbiguousMatch(requirement: ComponentRequirement): Promise<SourcingResult | null> {
  if (!requirement.manufacturer) {
    return null; // nothing to filter by — can't resolve, caller falls back to not-found
  }

  const candidates = await searchDigikeyByKeyword(requirement.mpn);
  const matches = candidates.filter(
    (p) => p.ManufacturerProductNumber?.toLowerCase() === requirement.mpn.toLowerCase() && looselyMatchesManufacturer(p.Manufacturer?.Name, requirement.manufacturer)
  );

  if (matches.length === 1) {
    console.log(`[DigiKey] ${requirement.mpn}: resolved ambiguity via manufacturer filter ("${requirement.manufacturer}") among ${candidates.length} candidate(s)`);
    return resultFromProduct(matches[0], requirement);
  }

  console.warn(
    `[DigiKey] ${requirement.mpn}: manufacturer filter ("${requirement.manufacturer}") matched ${matches.length} of ${candidates.length} candidates — can't resolve uniquely`
  );
  return null;
}

export async function sourceFromDigikey(requirement: ComponentRequirement): Promise<SourcingResult> {
  let response;
  try {
    response = await fetchDigikeyProduct(requirement.mpn);
  } catch (e) {
    // Any other error (auth failure, network, 5xx) is a real infra problem
    // and should keep propagating rather than being treated as "not found".
    if (e instanceof DigikeyNotFoundError) {
      if (/duplicate products/i.test(e.message)) {
        const resolved = await resolveAmbiguousMatch(requirement);
        if (resolved) return resolved;
      }
      return notFoundResult(requirement, e.message);
    }
    throw e;
  }

  const product = response.Product;
  if (!product) {
    return notFoundResult(requirement, "empty Product in response");
  }

  return resultFromProduct(product, requirement);
}
