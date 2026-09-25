const form = document.getElementById("searchForm");
const searchBtn = document.getElementById("searchBtn");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");

const SUPPLIER_ORDER = ["DigiKey", "Distrelec"];

function setStatus(kind, html) {
  if (!kind) {
    statusEl.hidden = true;
    statusEl.className = "status";
    statusEl.innerHTML = "";
    return;
  }
  statusEl.hidden = false;
  statusEl.className = `status ${kind}`;
  statusEl.innerHTML = html;
}

// Same thresholds as the Confidence Gate in the architecture: >=0.85 auto-accept,
// 0.40-0.85 needs a human look, <0.40 rejected.
function confidenceBadge(confidence) {
  if (confidence >= 0.85) return { cls: "accept", label: "High confidence" };
  if (confidence >= 0.4) return { cls: "review", label: "Needs review" };
  return { cls: "reject", label: "Low confidence" };
}

// No manufacturer is given as input anymore — it's discovered per result,
// so a single part-name search can come back with several manufacturer
// cards under the same supplier. Each card is titled by manufacturer
// instead of repeating the supplier name (that's now the section header).
function renderResultCard(r) {
  const notFound = r.manufacturer == null && r.price == null && r.sourceUrl == null;

  if (notFound) {
    return `
      <div class="result-card">
        <div class="not-found">No match found — this supplier doesn't appear to stock this part.</div>
      </div>`;
  }

  const badge = confidenceBadge(r.confidence);
  const priceStr = r.price != null ? `${r.currency ? r.currency + " " : ""}${r.price}` : "—";
  const stockStr = r.stock != null ? String(r.stock) : "—";

  return `
    <div class="result-card">
      <div class="result-head">
        <div>
          <div class="label">Manufacturer</div>
          <div class="supplier-name">${r.manufacturer ?? "Unknown manufacturer"}</div>
        </div>
        <div class="badge ${badge.cls}">${badge.label} (${Math.round(r.confidence * 100)}%)</div>
      </div>
      <div class="result-grid">
        <div><div class="label">Price</div><div class="value">${priceStr}</div></div>
        <div><div class="label">Stock</div><div class="value">${stockStr}</div></div>
      </div>
      ${r.sourceUrl ? `<a class="result-link" href="${r.sourceUrl}" target="_blank" rel="noopener">View on ${r.supplier} →</a>` : ""}
    </div>`;
}

function renderSupplierSection(supplier, results) {
  const matchCount = results.filter((r) => r.manufacturer != null).length;
  const subtitle = matchCount > 1 ? `<span class="section-sub">${matchCount} manufacturers found</span>` : "";

  return `
    <section class="supplier-section">
      <h2 class="section-title">${supplier}${subtitle}</h2>
      <div class="supplier-cards">${results.map(renderResultCard).join("")}</div>
    </section>`;
}

// A supplier whose pipeline genuinely crashed (not a graceful "not found")
// is reported in data.errors and simply absent from data.results — without
// this, that supplier's section just silently never appears, with nothing
// to explain why.
function renderErrorSection(supplier, message) {
  return `
    <section class="supplier-section">
      <h2 class="section-title">${supplier}</h2>
      <div class="supplier-cards">
        <div class="result-card">
          <div class="result-head"><div class="badge reject">Error</div></div>
          <div class="not-found">Something went wrong checking this supplier: ${message}</div>
        </div>
      </div>
    </section>`;
}

function groupBySupplier(results) {
  const groups = new Map(SUPPLIER_ORDER.map((s) => [s, []]));
  for (const r of results) {
    if (!groups.has(r.supplier)) groups.set(r.supplier, []);
    groups.get(r.supplier).push(r);
  }
  return groups;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const mpn = document.getElementById("mpn").value.trim();
  if (!mpn) return;

  searchBtn.disabled = true;
  resultsEl.innerHTML = "";
  setStatus("loading", `<span class="spinner"></span> Searching DigiKey and Distrelec for "${mpn}"… this can take up to a minute.`);

  try {
    const res = await fetch("/api/source", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mpn }),
    });

    const data = await res.json();

    if (!res.ok) {
      setStatus("error", data.error || "Something went wrong.");
      return;
    }

    setStatus(null);

    const results = data.results || [];
    const errors = data.errors || [];

    if (results.length === 0 && errors.length === 0) {
      setStatus("error", "No results from either supplier.");
      return;
    }

    const bySupplier = groupBySupplier(results);
    let html = "";
    for (const [supplier, supplierResults] of bySupplier) {
      if (supplierResults.length > 0) html += renderSupplierSection(supplier, supplierResults);
    }
    html += errors.map((e) => renderErrorSection(e.supplier, e.message)).join("");

    resultsEl.innerHTML = html;
  } catch (err) {
    setStatus("error", "Couldn't reach the server. Is it running?");
  } finally {
    searchBtn.disabled = false;
  }
});
