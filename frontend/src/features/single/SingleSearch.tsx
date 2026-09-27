import { useState, type FormEvent } from "react";
import type { SourceResponse } from "@jev/shared";
import { api, ApiError } from "../../api";
import { EmptySearchIcon, SearchIcon } from "../../components/Icons";
import { StatusBanner, type Status } from "../../components/StatusBanner";
import { SupplierResults } from "./SupplierResults";

const EXAMPLE_PARTS = ["STM32F407VGT6", "LM358", "ATmega328P"];

export function SingleSearch() {
  const [mpn, setMpn] = useState("");
  const [searching, setSearching] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [response, setResponse] = useState<SourceResponse | null>(null);

  async function runSearch(query: string) {
    setSearching(true);
    setResponse(null);
    setStatus({ kind: "loading", message: `Searching DigiKey and Distrelec for "${query}"… this can take up to a minute.` });

    try {
      const data = await api.source(query);
      if (data.results.length === 0 && data.errors.length === 0) {
        setStatus({ kind: "error", message: "No results from either supplier." });
        return;
      }
      setStatus(null);
      setResponse(data);
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof ApiError ? err.message : "Something went wrong." });
    } finally {
      setSearching(false);
    }
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const query = mpn.trim();
    if (!query) return;
    void runSearch(query);
  }

  function handleExampleClick(part: string) {
    if (searching) return;
    setMpn(part);
    void runSearch(part);
  }

  return (
    <>
      <p className="panel-sub">
        Enter a part number to check DigiKey and Distrelec at once — no manufacturer needed, we&apos;ll find and show every manufacturer
        that matches.
      </p>

      <form className="search-form" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="mpn">Part number</label>
          <input
            id="mpn"
            name="mpn"
            type="text"
            placeholder="e.g. STM32F407VGT6"
            required
            autoComplete="off"
            value={mpn}
            onChange={(e) => setMpn(e.target.value)}
          />
        </div>
        <button type="submit" disabled={searching}>
          <SearchIcon />
          Search
        </button>
      </form>

      <StatusBanner status={status} />

      {!status && !response && (
        <div className="empty-state">
          <div className="empty-state-icon-wrap">
            <EmptySearchIcon />
          </div>
          <p className="empty-state-title">Search a part to get started</p>
          <p className="empty-state-sub">Try one of these:</p>
          <div className="example-chips">
            {EXAMPLE_PARTS.map((part) => (
              <button key={part} type="button" className="example-chip" onClick={() => handleExampleClick(part)} disabled={searching}>
                {part}
              </button>
            ))}
          </div>
        </div>
      )}

      {response && <SupplierResults results={response.results} errors={response.errors} />}
    </>
  );
}
