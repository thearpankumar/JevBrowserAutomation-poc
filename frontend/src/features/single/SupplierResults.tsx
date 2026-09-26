import type { SourcingResult, Supplier, SupplierError } from "@jev/shared";
import { confidenceBadge, isNotFoundResult } from "../../lib/selection";
import { formatPrice, formatStock } from "../../lib/format";

const SUPPLIER_ORDER: Supplier[] = ["DigiKey", "Distrelec"];

// No manufacturer is given as input — it's discovered per result, so one part
// number can come back with several manufacturer cards under the same
// supplier. Each card is titled by manufacturer; the supplier is the section header.
function ResultCard({ result }: { result: SourcingResult }) {
  if (isNotFoundResult(result)) {
    return (
      <div className="result-card">
        <div className="not-found">No match found — this supplier doesn&apos;t appear to stock this part.</div>
      </div>
    );
  }

  const badge = confidenceBadge(result.confidence);
  return (
    <div className="result-card">
      <div className="result-head">
        <div>
          <div className="label">Manufacturer</div>
          <div className="supplier-name">{result.manufacturer ?? "Unknown manufacturer"}</div>
        </div>
        <div className={`badge ${badge.cls}`}>
          {badge.label} ({Math.round(result.confidence * 100)}%)
        </div>
      </div>
      <div className="result-grid">
        <div>
          <div className="label">Price</div>
          <div className="value">{formatPrice(result)}</div>
        </div>
        <div>
          <div className="label">Stock</div>
          <div className="value">{formatStock(result.stock)}</div>
        </div>
      </div>
      {result.sourceUrl && (
        <a className="result-link" href={result.sourceUrl} target="_blank" rel="noopener noreferrer">
          View on {result.supplier} →
        </a>
      )}
    </div>
  );
}

function SupplierSection({ supplier, results }: { supplier: Supplier; results: SourcingResult[] }) {
  const matchCount = results.filter((r) => r.manufacturer != null).length;
  return (
    <section className="supplier-section">
      <h2 className="section-title">
        {supplier}
        {matchCount > 1 && <span className="section-sub">{matchCount} manufacturers found</span>}
      </h2>
      <div className="supplier-cards">
        {results.map((result, i) => (
          <ResultCard key={i} result={result} />
        ))}
      </div>
    </section>
  );
}

// A supplier whose pipeline genuinely crashed (not a graceful "not found") is
// reported in `errors` and absent from `results` — without this its section
// would silently never appear, with nothing to explain why.
function SupplierErrorSection({ error }: { error: SupplierError }) {
  return (
    <section className="supplier-section">
      <h2 className="section-title">{error.supplier}</h2>
      <div className="supplier-cards">
        <div className="result-card">
          <div className="result-head">
            <div className="badge reject">Error</div>
          </div>
          <div className="not-found">Something went wrong checking this supplier: {error.message}</div>
        </div>
      </div>
    </section>
  );
}

function groupBySupplier(results: SourcingResult[]): [Supplier, SourcingResult[]][] {
  const groups = new Map<Supplier, SourcingResult[]>(SUPPLIER_ORDER.map((s) => [s, []]));
  for (const r of results) {
    const group = groups.get(r.supplier);
    if (group) group.push(r);
    else groups.set(r.supplier, [r]);
  }
  return [...groups].filter(([, group]) => group.length > 0);
}

export function SupplierResults({ results, errors }: { results: SourcingResult[]; errors: SupplierError[] }) {
  return (
    <div className="results">
      {groupBySupplier(results).map(([supplier, group]) => (
        <SupplierSection key={supplier} supplier={supplier} results={group} />
      ))}
      {errors.map((error) => (
        <SupplierErrorSection key={error.supplier} error={error} />
      ))}
    </div>
  );
}
