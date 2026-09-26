import { useState, type ReactNode } from "react";
import { FileIcon, SearchIcon } from "./components/Icons";
import { BatchPanel } from "./features/batch/BatchPanel";
import { SingleSearch } from "./features/single/SingleSearch";
import { useDigikeyConnection } from "./hooks/useDigikeyConnection";

type TabId = "single" | "batch";

const TABS: { id: TabId; label: string; icon: ReactNode }[] = [
  { id: "single", label: "Single Part", icon: <SearchIcon /> },
  { id: "batch", label: "Batch (BOM)", icon: <FileIcon /> },
];

export function App() {
  const digikey = useDigikeyConnection();
  // Coming back from DigiKey's login is a full page reload — land on Batch,
  // the only place the connection matters.
  const [activeTab, setActiveTab] = useState<TabId>(digikey.returnOutcome ? "batch" : "single");

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark">J</div>
          <div>
            <div className="brand-title">Component Sourcing</div>
            <div className="brand-sub">DigiKey + Distrelec, matched and judged by Jev</div>
          </div>
        </div>
      </header>

      <nav className="tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-controls={`panel-${tab.id}`}
            aria-selected={activeTab === tab.id}
            className={`tab${activeTab === tab.id ? " active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tab-icon">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Both panels stay mounted (hidden via CSS) so a running batch keeps
          polling and a search result survives switching tabs. */}
      <main className="tab-panels">
        <section
          className={`tab-panel${activeTab === "single" ? " active" : ""}`}
          id="panel-single"
          role="tabpanel"
          aria-labelledby="tab-single"
        >
          <SingleSearch />
        </section>
        <section
          className={`tab-panel${activeTab === "batch" ? " active" : ""}`}
          id="panel-batch"
          role="tabpanel"
          aria-labelledby="tab-batch"
        >
          <BatchPanel digikeyConnected={digikey.connected} digikeyReturnOutcome={digikey.returnOutcome} />
        </section>
      </main>
    </div>
  );
}
