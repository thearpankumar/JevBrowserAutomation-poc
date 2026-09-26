import type { BatchStats } from "../../lib/batchStats";

export function StatChips({ stats }: { stats: BatchStats }) {
  const chips = [
    { cls: "", value: stats.total, label: "Parts" },
    { cls: "accept", value: stats.accept, label: "Confirmed match" },
    { cls: "review", value: stats.review, label: "Needs review" },
    { cls: "reject", value: stats.reject, label: "Weak match" },
    { cls: "", value: stats.notFound, label: "Not found" },
  ];

  return (
    <div className="stat-chips">
      {chips.map((chip) => (
        <div key={chip.label} className={`chip${chip.cls ? ` ${chip.cls}` : ""}`}>
          <span className="chip-num">{chip.value}</span>
          <span className="chip-label">{chip.label}</span>
        </div>
      ))}
    </div>
  );
}
