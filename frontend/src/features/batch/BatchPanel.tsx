import { useEffect, useMemo, useState } from "react";
import { api, ApiError, DIGIKEY_CONNECT_URL, exportCsvUrl } from "../../api";
import { DownloadIcon } from "../../components/Icons";
import { StatusBanner, type Status } from "../../components/StatusBanner";
import { useBatchJob } from "../../hooks/useBatchJob";
import type { DigikeyReturnOutcome } from "../../hooks/useDigikeyConnection";
import { useSelection } from "../../hooks/useSelection";
import { computeBatchStats } from "../../lib/batchStats";
import { saveDigikeyReturnState, takeDigikeyReturnState } from "../../lib/digikeyReturn";
import { formatRowError } from "../../lib/format";
import { navigateTo } from "../../lib/navigate";
import { computeSelectionSummary, selectedItemsForSupplier } from "../../lib/selection";
import { downloadSampleBomCsv } from "../../lib/sampleBom";
import { BatchTable } from "./BatchTable";
import { BomUpload } from "./BomUpload";
import { SelectionBar, type CartResult, type DistrelecCartResult } from "./SelectionBar";
import { StatChips } from "./StatChips";

const DIGIKEY_RETURN_STATUS: Record<DigikeyReturnOutcome, Status> = {
  connected: { kind: "info", message: "✓ DigiKey account connected." },
  denied: {
    kind: "error",
    message: 'DigiKey connection wasn\'t approved — click "Connect DigiKey account" again if you want to try once more.',
  },
  error: { kind: "error", message: "Something went wrong connecting your DigiKey account. Please try again." },
};

const DIGIKEY_RESTORE_FAILED_STATUS: Status = {
  kind: "info",
  message: "✓ DigiKey account connected. We couldn't restore your previous batch — re-run it if needed.",
};

interface BatchPanelProps {
  digikeyConnected: boolean;
  digikeyReturnOutcome: DigikeyReturnOutcome | null;
  distrelecConnected: boolean;
}

export function BatchPanel({ digikeyConnected, digikeyReturnOutcome, distrelecConnected }: BatchPanelProps) {
  const { job, phase, partCount, error, start, restore } = useBatchJob();
  const selection = useSelection(job);
  const [cartResult, setCartResult] = useState<CartResult | null>(null);
  const [distrelecCartResult, setDistrelecCartResult] = useState<DistrelecCartResult | null>(null);
  const [restoreFailed, setRestoreFailed] = useState(false);

  // Runs once on mount: if a batch and its selections were saved just before
  // a DigiKey OAuth redirect (which wipes all in-memory state via a full-page
  // navigation), bring them back.
  useEffect(() => {
    const saved = takeDigikeyReturnState();
    if (!saved) return;
    void restore(saved.jobId).then((restored) => {
      if (restored) selection.restore(saved.jobId, saved.choices);
      else setRestoreFailed(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot restore of state saved before the redirect, not a reaction to prop/state changes
  }, []);

  const stats = useMemo(() => (job ? computeBatchStats(job) : null), [job]);
  const summary = useMemo(() => (job ? computeSelectionSummary(job, selection.selectedKeys) : null), [job, selection.selectedKeys]);

  const status: Status | null = (() => {
    switch (phase) {
      case "idle":
        if (!digikeyReturnOutcome) return null;
        return digikeyReturnOutcome === "connected" && restoreFailed
          ? DIGIKEY_RESTORE_FAILED_STATUS
          : DIGIKEY_RETURN_STATUS[digikeyReturnOutcome];
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
    setDistrelecCartResult(null);
    void start(file);
  }

  function handleConnectDigikey() {
    if (job) saveDigikeyReturnState(job.id, selection.choices);
    navigateTo(DIGIKEY_CONNECT_URL);
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

  async function handleAddToDistrelecCart() {
    if (!job) return;
    const items = selectedItemsForSupplier(job, selection.selectedKeys, "Distrelec");
    if (items.length === 0) return;

    setDistrelecCartResult({ kind: "loading" });
    try {
      const result = await api.addToDistrelecCart(items);
      setDistrelecCartResult({ kind: "ok", added: result.addedCount, skipped: result.skipped });
    } catch (err) {
      setDistrelecCartResult({ kind: "error", message: err instanceof ApiError ? err.message : "unknown error" });
    }
  }

  return (
    <>
      <p className="panel-sub">
        Upload a CSV with a part-number column (e.g. &quot;MPN&quot; or &quot;Part Number&quot;) — &quot;Package&quot; and &quot;Qty&quot;
        columns are optional.{" "}
        <button type="button" className="link-btn sample-csv-link" onClick={downloadSampleBomCsv}>
          <DownloadIcon />
          Download a sample CSV
        </button>
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
            distrelecConnected={distrelecConnected}
            cartResult={cartResult}
            distrelecCartResult={distrelecCartResult}
            onSelectConfirmed={selection.selectConfirmed}
            onSelectAll={selection.selectAll}
            onClear={selection.clear}
            onConnectDigikey={handleConnectDigikey}
            onAddToDigikeyCart={() => void handleAddToDigikeyCart()}
            onAddToDistrelecCart={() => void handleAddToDistrelecCart()}
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
