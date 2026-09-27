import { useCallback, useEffect, useRef, useState } from "react";
import type { BatchJob } from "@jev/shared";
import { api, ApiError } from "../api";
import { formatRowError } from "../lib/format";

export const POLL_INTERVAL_MS = 1500;

export type BatchPhase = "idle" | "uploading" | "running" | "done" | "failed";

export interface BatchError {
  message: string;
  /** Extra lines, e.g. why every row of an upload was rejected. */
  details: string[];
}

function toBatchError(err: unknown): BatchError {
  if (err instanceof ApiError) return { message: err.message, details: err.rowErrors.map(formatRowError) };
  return { message: "Something went wrong.", details: [] };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Uploads a BOM, then polls the job until it's done. Each start() bumps a run
 * counter; a loop whose run is no longer current (a newer batch started, or
 * the component unmounted) stops without touching state.
 */
export function useBatchJob() {
  const [job, setJob] = useState<BatchJob | null>(null);
  const [phase, setPhase] = useState<BatchPhase>("idle");
  const [partCount, setPartCount] = useState(0);
  const [error, setError] = useState<BatchError | null>(null);
  const runRef = useRef(0);

  useEffect(
    () => () => {
      runRef.current++;
    },
    []
  );

  const pollUntilDone = useCallback(async (jobId: string, isStale: () => boolean): Promise<void> => {
    try {
      for (;;) {
        const next = await api.getBatch(jobId);
        if (isStale()) return;
        setJob(next);
        if (next.status !== "running") {
          setPhase("done");
          return;
        }
        await delay(POLL_INTERVAL_MS);
        if (isStale()) return;
      }
    } catch (err) {
      if (isStale()) return;
      // Any job already on screen stays there — only the live updates stopped.
      setError(toBatchError(err));
      setPhase("failed");
    }
  }, []);

  const start = useCallback(
    async (file: File): Promise<void> => {
      const run = ++runRef.current;
      const isStale = () => run !== runRef.current;

      setJob(null);
      setError(null);
      setPhase("uploading");

      try {
        const started = await api.startBatch(await file.text());
        if (isStale()) return;
        setPartCount(started.total);
        setPhase("running");
        await pollUntilDone(started.jobId, isStale);
      } catch (err) {
        if (isStale()) return;
        setError(toBatchError(err));
        setPhase("failed");
      }
    },
    [pollUntilDone]
  );

  /**
   * Re-fetches a job saved (by id) before a full-page redirect — e.g. the
   * DigiKey OAuth round trip, which wipes all in-memory React state. Resumes
   * polling if the job was still running when the user left. Returns false
   * (leaving state untouched) if the job can't be found, e.g. the server
   * restarted since — the job store is in-memory only.
   */
  const restore = useCallback(
    async (jobId: string): Promise<boolean> => {
      const run = ++runRef.current;
      const isStale = () => run !== runRef.current;

      let fetched: BatchJob;
      try {
        fetched = await api.getBatch(jobId);
      } catch {
        return false;
      }
      if (isStale()) return false;

      setJob(fetched);
      setPartCount(fetched.total);
      if (fetched.status === "running") {
        setPhase("running");
        void pollUntilDone(jobId, isStale);
      } else {
        setPhase("done");
      }
      return true;
    },
    [pollUntilDone]
  );

  return { job, phase, partCount, error, start, restore };
}
