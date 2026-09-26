import type { ReactNode } from "react";

type StatusKind = "loading" | "info" | "error";

export interface Status {
  kind: StatusKind;
  message: ReactNode;
  details?: string[];
}

export function StatusBanner({ status }: { status: Status | null }) {
  if (!status) return null;
  return (
    <div className={`status ${status.kind}`} role={status.kind === "error" ? "alert" : "status"}>
      {status.kind === "loading" && <span className="spinner" aria-hidden="true" />}
      <div>
        <div>{status.message}</div>
        {status.details && status.details.length > 0 && (
          <ul className="status-details">
            {status.details.map((detail, i) => (
              <li key={i}>{detail}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
