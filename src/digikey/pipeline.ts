import { ComponentRequirement, SourcingResult } from "../types.js";
import { fetchDigikeyProduct } from "./client.js";

export async function sourceFromDigikey(requirement: ComponentRequirement): Promise<SourcingResult> {
  const response = await fetchDigikeyProduct(requirement.mpn);
  const product = response.Product;

  if (!product) {
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
