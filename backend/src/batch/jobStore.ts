import type { BatchJob, BomRowError, ComponentRequirement } from "@jev/shared";

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
