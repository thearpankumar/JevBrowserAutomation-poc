import { useMemo, useState } from "react";
import type { BatchJob } from "@jev/shared";
import { allSelectableKeys, resolveSelectedKeys, type SelectionChoices } from "../lib/selection";

const NO_CHOICES: SelectionChoices = new Map();

/**
 * Checkbox state for the batch table. Stores only the user's explicit
 * choices; everything else follows the default (confirmed matches checked),
 * so results that keep arriving while a batch runs get their default without
 * ever overriding something the user already toggled. Choices are tied to a
 * job id — a new batch starts from a clean slate.
 */
export function useSelection(job: BatchJob | null) {
  const [state, setState] = useState<{ jobId: string | null; choices: SelectionChoices }>({ jobId: null, choices: NO_CHOICES });

  const jobId = job?.id ?? null;
  const choices = state.jobId === jobId ? state.choices : NO_CHOICES;

  const selectedKeys = useMemo<ReadonlySet<string>>(() => new Set(job ? resolveSelectedKeys(job, choices) : []), [job, choices]);

  function update(next: (current: SelectionChoices) => SelectionChoices): void {
    setState((prev) => ({ jobId, choices: next(prev.jobId === jobId ? prev.choices : NO_CHOICES) }));
  }

  function setAll(checked: boolean): void {
    if (!job) return;
    const keys = allSelectableKeys(job);
    update(() => new Map(keys.map((key) => [key, checked])));
  }

  return {
    selectedKeys,
    /** The raw explicit choices (not the resolved selected set) — persisted across the DigiKey OAuth redirect. */
    choices,
    toggle: (key: string, checked: boolean) => update((current) => new Map(current).set(key, checked)),
    /** Back to the defaults: exactly the confirmed matches. */
    selectConfirmed: () => update(() => NO_CHOICES),
    selectAll: () => setAll(true),
    clear: () => setAll(false),
    /** Replaces the choices wholesale for a given job id — used to restore state saved before a DigiKey OAuth redirect. */
    restore: (restoredJobId: string, restoredChoices: SelectionChoices) => setState({ jobId: restoredJobId, choices: restoredChoices }),
  };
}
