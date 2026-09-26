import { useMemo, useState } from "react";
import { api, ApiError, DIGIKEY_CONNECT_URL, exportCsvUrl } from "../../api";
import { StatusBanner, type Status } from "../../components/StatusBanner";
import { useBatchJob } from "../../hooks/useBatchJob";
import type { DigikeyReturnOutcome } from "../../hooks/useDigikeyConnection";
import { useSelection } from "../../hooks/useSelection";
import { computeBatchStats } from "../../lib/batchStats";
import { formatRowError } from "../../lib/format";
import { navigateTo } from "../../lib/navigate";
import { computeSelectionSummary, selectedItemsForSupplier } from "../../lib/selection";
import { BatchTable } from "./BatchTable";
import { BomUpload } from "./BomUpload";
import { SelectionBar, type CartResult } from "./SelectionBar";
import { StatChips } from "./StatChips";

const DIGIKEY_RETURN_STATUS: Record<DigikeyReturnOutcome, Status> = {
  connected: {
    kind: "info",
    message: "✓ DigiKey account connected. Your selections from before were reset by the redirect — re-run your batch if needed.",
  },
  denied: {
    kind: "error",
    message: 'DigiKey connection wasn\'t approved — click "Connect DigiKey account" again if you want to try once more.',
  },
  error: { kind: "error", message: "Something went wrong connecting your DigiKey account. Please try again." },
};

interface BatchPanelProps {
  digikeyConnected: boolean;
  digikeyReturnOutcome: DigikeyReturnOutcome | null;
}

export function BatchPanel({ digikeyConnected, digikeyReturnOutcome }: BatchPanelProps) {
  const { job, phase, partCount, error, start } = useBatchJob();
  const selection = useSelection(job);
  const [cartResult, setCartResult] = useState<CartResult | null>(null);

  const stats = useMemo(() => (job ? computeBatchStats(job) : null), [job]);
  const summary = useMemo(() => (job ? computeSelectionSummary(job, selection.selectedKeys) : null), [job, selection.selectedKeys]);

  const status: Status | null = (() => {
    switch (phase) {
      case "idle":
        return digikeyReturnOutcome ? DIGIKEY_RETURN_STATUS[digikeyReturnOutcome] : null;
      case "uploading":
        return { kind: "loading", message: "Uploading and starting batch…" };
      case "running":
        return { kind: "loading", message: `Running batch of ${partCount} part(s)…` };
      case "failed":
        return error ? { kind: "error", message: error.message, details: error.details } : null;
      case "done":
        return null;
    }
  })();

  function handleStart(file: File) {
    setCartResult(null);
    void start(file);
  }

  async function handleAddToDigikeyCart() {
    if (!job) return;
    const items = selectedItemsForSupplier(job, selection.selectedKeys, "DigiKey");
    if (items.length === 0) return;

    setCartResult({ kind: "loading" });
    try {
      const result = await api.addToDigikeyCart(items);
      setCartResult({ kind: "ok", added: result.addedIdentifiers.length });
    } catch (err) {
      setCartResult({ kind: "error", message: err instanceof ApiError ? err.message : "unknown error" });
    }
  }

  return (
    <>
      <p className="panel-sub">
        Upload a CSV with a part-number column (e.g. &quot;MPN&quot; or &quot;Part Number&quot;) — &quot;Package&quot; and &quot;Qty&quot;
        columns are optional.
      </p>

      <BomUpload busy={phase === "uploading" || phase === "running"} onSubmit={handleStart} />
      <StatusBanner status={status} />

      {job && stats && summary && (
        <div>
          {job.parseErrors.length > 0 && (
            <div className="batch-parse-errors">
              {job.parseErrors.map((e, i) => (
                <div key={i}>{formatRowError(e)}</div>
              ))}
            </div>
          )}

          <StatChips stats={stats} />

          <SelectionBar
            summary={summary}
            digikeyConnected={digikeyConnected}
            cartResult={cartResult}
            onSelectConfirmed={selection.selectConfirmed}
            onSelectAll={selection.selectAll}
            onClear={selection.clear}
            onConnectDigikey={() => navigateTo(DIGIKEY_CONNECT_URL)}
            onAddToDigikeyCart={() => void handleAddToDigikeyCart()}
          />

          {job.status === "running" ? (
            <ProgressBar completed={job.completed} total={job.total} />
          ) : (
            <div className="batch-progress-label">
              Done — <a href={exportCsvUrl(job.id)}>Download report (CSV)</a>
            </div>
          )}

          <BatchTable job={job} selectedKeys={selection.selectedKeys} onToggle={selection.toggle} />
        </div>
      )}
    </>
  );
}

function ProgressBar({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 100;
  return (
    <>
      <div className="batch-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className="batch-progress-bar" style={{ width: `${pct}%` }} />
      </div>
      <div className="batch-progress-label">
        {pct}% ({completed}/{total})
      </div>
    </>
  );
}
