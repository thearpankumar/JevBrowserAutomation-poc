import { ComponentRequirement, SourcingResult } from "../types.js";

const HEADERS = ["Part Number", "Supplier", "Manufacturer", "Price", "Currency", "Stock", "Confidence", "Status", "Source URL"];

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function statusFor(confidence: number, found: boolean): string {
  if (!found) return "Not found";
  if (confidence >= 0.85) return "Confirmed match";
  if (confidence >= 0.4) return "Needs review";
  return "Weak match";
}

export interface ExportableBatchRow {
  requirement: ComponentRequirement;
  results: SourcingResult[];
}

/** Same shape as the web UI's confidence badges — one row per (part, supplier, manufacturer) match, or one "Not found" row when nothing matched at all. */
export function buildResultsCsv(rows: ExportableBatchRow[]): string {
  const lines = [HEADERS.join(",")];

  for (const row of rows) {
    if (row.results.length === 0) {
      lines.push(csvLine([row.requirement.mpn, "", "", "", "", "", "", "Not found", ""]));
      continue;
    }

    for (const r of row.results) {
      const found = r.manufacturer != null || r.price != null || r.sourceUrl != null;
      lines.push(
        csvLine([
          row.requirement.mpn,
          r.supplier,
          r.manufacturer ?? "",
          r.price ?? "",
          r.currency ?? "",
          r.stock != null ? String(r.stock) : "",
          String(r.confidence),
          statusFor(r.confidence, found),
          r.sourceUrl ?? "",
        ])
      );
    }
  }

  return lines.join("\r\n") + "\r\n";
}

function csvLine(fields: string[]): string {
  return fields.map(csvEscape).join(",");
}
