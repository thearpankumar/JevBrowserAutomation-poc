import type { BatchJob, BatchRowState } from "@jev/shared";
import { confidenceBadge, isNotFoundResult, rowKey } from "../../lib/selection";
import { formatPrice, formatStock } from "../../lib/format";

interface BatchTableProps {
  job: BatchJob;
  selectedKeys: ReadonlySet<string>;
  onToggle: (key: string, checked: boolean) => void;
}

function BatchRows({ row, rowIndex, selectedKeys, onToggle }: { row: BatchRowState; rowIndex: number } & Omit<BatchTableProps, "job">) {
  const hasRealResult = row.results.some((r) => !isNotFoundResult(r));

  if (!hasRealResult) {
    const stillWaiting = !(row.digikeyDone && row.distrelecDone);
    return (
      <tr>
        <td />
        <td>{row.requirement.mpn}</td>
        <td colSpan={6} className="not-found">
          {stillWaiting ? "Checking…" : "No match found on either supplier."}
        </td>
      </tr>
    );
  }

  return (
    <>
      {row.results.map((result, resultIndex) => {
        if (isNotFoundResult(result)) return null;
        const key = rowKey(rowIndex, resultIndex);
        const badge = confidenceBadge(result.confidence);
        return (
          <tr key={key}>
            <td>
              <input
                type="checkbox"
                className="row-check"
                aria-label={`Select ${row.requirement.mpn} from ${result.supplier}`}
                checked={selectedKeys.has(key)}
                onChange={(e) => onToggle(key, e.target.checked)}
              />
            </td>
            <td>{row.requirement.mpn}</td>
            <td>{result.supplier}</td>
            <td>{result.manufacturer ?? "Unknown"}</td>
            <td>{formatPrice(result)}</td>
            <td>{formatStock(result.stock)}</td>
            <td>
              <span className={`badge ${badge.cls}`}>{badge.label}</span>
            </td>
            <td>
              {result.sourceUrl ? (
                <a href={result.sourceUrl} target="_blank" rel="noopener noreferrer">
                  View →
                </a>
              ) : (
                "—"
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}

export function BatchTable({ job, selectedKeys, onToggle }: BatchTableProps) {
  return (
    <div className="batch-table-wrap">
      <table className="batch-table">
        <thead>
          <tr>
            <th aria-label="Select" />
            <th>Part #</th>
            <th>Supplier</th>
            <th>Manufacturer</th>
            <th>Price</th>
            <th>Stock</th>
            <th>Confidence</th>
            <th>Link</th>
          </tr>
        </thead>
        <tbody>
          {job.rows.map((row, rowIndex) => (
            <BatchRows key={rowIndex} row={row} rowIndex={rowIndex} selectedKeys={selectedKeys} onToggle={onToggle} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
