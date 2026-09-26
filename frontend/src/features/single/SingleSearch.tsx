import { useState, type FormEvent } from "react";
import type { SourceResponse } from "@jev/shared";
import { api, ApiError } from "../../api";
import { SearchIcon } from "../../components/Icons";
import { StatusBanner, type Status } from "../../components/StatusBanner";
import { SupplierResults } from "./SupplierResults";

export function SingleSearch() {
  const [mpn, setMpn] = useState("");
  const [searching, setSearching] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [response, setResponse] = useState<SourceResponse | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const query = mpn.trim();
    if (!query) return;

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
      {response && <SupplierResults results={response.results} errors={response.errors} />}
    </>
  );
}
