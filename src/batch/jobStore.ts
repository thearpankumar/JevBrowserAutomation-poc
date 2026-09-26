import { ComponentRequirement, SourcingResult } from "../types.js";
import { BomRowError } from "../bom/parseCsv.js";

export interface BatchRowState {
  requirement: ComponentRequirement;
  results: SourcingResult[];
  errors: { supplier: "DigiKey" | "Distrelec"; message: string }[];
  digikeyDone: boolean;
  distrelecDone: boolean;
}

export type BatchStatus = "running" | "done";

export interface BatchJob {
  id: string;
  status: BatchStatus;
  /** requirements.length * 2 (one DigiKey + one Distrelec check per part) — what "completed" counts up to. */
  total: number;
  completed: number;
  rows: BatchRowState[];
  parseErrors: BomRowError[];
  createdAt: string;
  completedAt?: string;
}

function generateJobId(): string {
  return `batch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** In-memory only — fine for a POC (one process, one run at a time); a real deployment would need this to survive a restart, but that's the same "job queue" item already flagged for later. */
export class JobStore {
  private jobs = new Map<string, BatchJob>();

  create(requirements: ComponentRequirement[], parseErrors: BomRowError[]): BatchJob {
    const job: BatchJob = {
      id: generateJobId(),
      status: "running",
      total: requirements.length * 2,
      completed: 0,
      rows: requirements.map((requirement) => ({
        requirement,
        results: [],
        errors: [],
        digikeyDone: false,
        distrelecDone: false,
      })),
      parseErrors,
      createdAt: new Date().toISOString(),
    };
    this.jobs.set(job.id, job);
    return job;
  }

  get(id: string): BatchJob | undefined {
    return this.jobs.get(id);
  }
}
