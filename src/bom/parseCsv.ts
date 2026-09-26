import { ComponentRequirement } from "../types.js";

export interface BomRowError {
  /** 1-based, counting the header row as row 1 — matches what a person sees when they open the file in a spreadsheet app. */
  row: number;
  message: string;
}

export interface ParsedBom {
  requirements: ComponentRequirement[];
  rowErrors: BomRowError[];
}

const MPN_ALIASES = ["mpn", "partnumber", "partno", "manufacturerpartnumber", "manufacturerpartno", "part"];
const PACKAGE_ALIASES = ["package", "pkg", "packagetype"];
const QTY_ALIASES = ["qty", "quantity", "qtyrequired", "quantityrequired"];

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Minimal RFC4180-style CSV tokenizer: quoted fields, "" as an escaped quote,
 * commas/newlines inside quotes, and either CRLF or LF line endings. Good
 * enough for real spreadsheet-exported CSVs without pulling in a dependency.
 */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  function pushField() {
    row.push(field);
    field = "";
  }
  function pushRow() {
    pushField();
    rows.push(row);
    row = [];
  }

  while (i < len) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      pushField();
      i++;
      continue;
    }
    if (c === "\r") {
      // swallowed — the following "\n" (or end of input) closes the row
      i++;
      continue;
    }
    if (c === "\n") {
      pushRow();
      i++;
      continue;
    }
    field += c;
    i++;
  }

  // Only flush a trailing row if there's actually unflushed content — avoids
  // a phantom empty row when the file ends with a newline.
  if (field.length > 0 || row.length > 0) {
    pushRow();
  }

  return rows;
}

function isBlankRow(row: string[]): boolean {
  return row.length === 1 && row[0].trim() === "";
}

/**
 * A browser's FileReader.readAsText() decodes whatever bytes it's given as
 * UTF-8 no matter the actual file type — a real .xlsx/.docx/.zip (or an old
 * binary .xls) doesn't error, it just comes out as garbled text starting
 * with the ZIP magic bytes ("PK...") or the U+FFFD replacement character
 * from invalid UTF-8 sequences. Catch that up front with a clear message
 * instead of letting it fall through to "no part-number column found" with
 * a wall of binary garbage in the error.
 */
function looksLikeNonTextFile(text: string): boolean {
  const head = text.slice(0, 8);
  if (head.startsWith("PK")) return true;
  // eslint-disable-next-line no-control-regex
  return /[\x00-\x08\x0e-\x1f�]/.test(head);
}

export function parseBomCsv(text: string): ParsedBom {
  if (looksLikeNonTextFile(text)) {
    return {
      requirements: [],
      rowErrors: [
        {
          row: 0,
          message:
            'This doesn\'t look like a CSV file. If this is an Excel file, use "Save As" / "Export" and choose CSV format, then upload that instead.',
        },
      ],
    };
  }

  const rawRows = parseCsvRows(text).filter((r) => !isBlankRow(r));
  const rowErrors: BomRowError[] = [];

  if (rawRows.length === 0) {
    return { requirements: [], rowErrors: [{ row: 0, message: "The file is empty." }] };
  }

  const header = rawRows[0].map(normalizeHeader);
  const mpnCol = header.findIndex((h) => MPN_ALIASES.includes(h));
  const packageCol = header.findIndex((h) => PACKAGE_ALIASES.includes(h));
  const qtyCol = header.findIndex((h) => QTY_ALIASES.includes(h));

  if (mpnCol === -1) {
    return {
      requirements: [],
      rowErrors: [
        {
          row: 1,
          message: `No part-number column found. Expected a header like "MPN" or "Part Number" — got: ${rawRows[0].join(", ")}`,
        },
      ],
    };
  }

  const requirements: ComponentRequirement[] = [];

  for (let r = 1; r < rawRows.length; r++) {
    const cols = rawRows[r];
    const mpn = (cols[mpnCol] ?? "").trim();

    if (!mpn) {
      rowErrors.push({ row: r + 1, message: "Missing part number — row skipped." });
      continue;
    }

    const pkg = packageCol !== -1 ? (cols[packageCol] ?? "").trim() || undefined : undefined;

    let qty = 1;
    if (qtyCol !== -1) {
      const raw = (cols[qtyCol] ?? "").trim();
      if (raw) {
        const n = parseInt(raw, 10);
        qty = Number.isNaN(n) || n <= 0 ? 1 : n;
      }
    }

    requirements.push({ mpn, package: pkg, qty });
  }

  return { requirements, rowErrors };
}
