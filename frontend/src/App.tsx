import { useState, type ReactNode } from "react";
import { ChevronIcon, FileIcon, SearchIcon } from "./components/Icons";
import { BatchPanel } from "./features/batch/BatchPanel";
import { SingleSearch } from "./features/single/SingleSearch";
import { useDigikeyConnection } from "./hooks/useDigikeyConnection";
import { useDistrelecConnection } from "./hooks/useDistrelecConnection";

type TabId = "single" | "batch";

const TABS: { id: TabId; label: string; icon: ReactNode }[] = [
  { id: "single", label: "Single Part", icon: <SearchIcon /> },
  { id: "batch", label: "Parts List", icon: <FileIcon /> },
];

export function App() {
  const digikey = useDigikeyConnection();
  const distrelecConnected = useDistrelecConnection();
  // Coming back from DigiKey's login is a full page reload — land on Parts List,
  // the only place the connection matters.
  const [activeTab, setActiveTab] = useState<TabId>(digikey.returnOutcome ? "batch" : "single");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const activeLabel = TABS.find((t) => t.id === activeTab)?.label ?? "";

  return (
    <div className="app-shell">
      <aside className={`sidebar${sidebarCollapsed ? " collapsed" : ""}`}>
        <div className="sidebar-brand">
          <div className="brand-mark">J</div>
          {!sidebarCollapsed && (
            <div>
              <div className="brand-title">Component Sourcing</div>
              <div className="brand-sub">DigiKey + Distrelec</div>
            </div>
          )}
        </div>

        <nav className="sidebar-nav" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-controls={`panel-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-label={tab.label}
              className={`sidebar-nav-btn${activeTab === tab.id ? " active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="sidebar-nav-icon">{tab.icon}</span>
              {!sidebarCollapsed && <span>{tab.label}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-spacer" />

        <button
          type="button"
          className="sidebar-collapse-btn"
          onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <span className={`sidebar-nav-icon${sidebarCollapsed ? " flipped" : ""}`}>
            <ChevronIcon />
          </span>
          {!sidebarCollapsed && <span>Collapse</span>}
        </button>
      </aside>

      <div className="main-area">
        <div className="topbar">
          <div className="topbar-title">{activeLabel}</div>
          <div className="topbar-status">
            <span className={`status-pill${digikey.connected ? " connected" : ""}`}>
              <span className="status-dot" aria-hidden="true" />
              DigiKey
            </span>
            <span className={`status-pill${distrelecConnected ? " connected" : ""}`}>
              <span className="status-dot" aria-hidden="true" />
              Distrelec
            </span>
          </div>
        </div>

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
            <BatchPanel
              digikeyConnected={digikey.connected}
              digikeyReturnOutcome={digikey.returnOutcome}
              distrelecConnected={distrelecConnected}
            />
          </section>
        </main>
      </div>
    </div>
  );
}
