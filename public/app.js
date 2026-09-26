const form = document.getElementById("searchForm");
const searchBtn = document.getElementById("searchBtn");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");

const SUPPLIER_ORDER = ["DigiKey", "Distrelec"];

// --- Tabs ---
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => {
      t.classList.remove("active");
      t.setAttribute("aria-selected", "false");
    });
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));

    tab.classList.add("active");
    tab.setAttribute("aria-selected", "true");
    document.getElementById(tab.dataset.panel).classList.add("active");
  });
});

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
  if (confidence >= 0.85) return { cls: "accept", label: "Confirmed match" };
  if (confidence >= 0.4) return { cls: "review", label: "Needs review" };
  return { cls: "reject", label: "Weak match" };
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

const batchForm = document.getElementById("batchForm");
const batchBtn = document.getElementById("batchBtn");
const batchStatusEl = document.getElementById("batchStatus");
const batchResultsEl = document.getElementById("batchResults");

function setBatchStatus(kind, html) {
  if (!kind) {
    batchStatusEl.hidden = true;
    batchStatusEl.className = "status";
    batchStatusEl.innerHTML = "";
    return;
  }
  batchStatusEl.hidden = false;
  batchStatusEl.className = `status ${kind}`;
  batchStatusEl.innerHTML = html;
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

// --- Drag-and-drop file picker ---
const dropzone = document.getElementById("dropzone");
const bomFileInput = document.getElementById("bomFile");
const dropzoneFilename = document.getElementById("dropzoneFilename");

function showChosenFilename() {
  const file = bomFileInput.files[0];
  dropzoneFilename.textContent = file ? file.name : "";
}

bomFileInput.addEventListener("change", showChosenFilename);

["dragenter", "dragover"].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });
});

["dragleave", "drop"].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
  });
});

dropzone.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files[0];
  if (!file) return;
  bomFileInput.files = e.dataTransfer.files;
  showChosenFilename();
});

function computeBatchStats(job) {
  let accept = 0;
  let review = 0;
  let reject = 0;
  let notFound = 0;

  for (const row of job.rows) {
    const realResults = row.results.filter((r) => !isNotFound(r));

    if (realResults.length === 0) {
      if (row.digikeyDone && row.distrelecDone) notFound++;
      continue;
    }
    for (const r of realResults) {
      const badge = confidenceBadge(r.confidence);
      if (badge.cls === "accept") accept++;
      else if (badge.cls === "review") review++;
      else reject++;
    }
  }

  return { total: job.rows.length, accept, review, reject, notFound };
}

function renderStatChips(job) {
  const s = computeBatchStats(job);
  return `
    <div class="stat-chips">
      <div class="chip"><span class="chip-num">${s.total}</span><span class="chip-label">Parts</span></div>
      <div class="chip accept"><span class="chip-num">${s.accept}</span><span class="chip-label">Confirmed match</span></div>
      <div class="chip review"><span class="chip-num">${s.review}</span><span class="chip-label">Needs review</span></div>
      <div class="chip reject"><span class="chip-num">${s.reject}</span><span class="chip-label">Weak match</span></div>
      <div class="chip"><span class="chip-num">${s.notFound}</span><span class="chip-label">Not found</span></div>
    </div>`;
}

// A supplier pipeline that finds nothing still returns one result object
// with every field null (see notFoundResult in digikey/pipeline.ts and
// distrelec/pipeline.ts) — it's not an empty array. Same per-result check
// the single-part view already uses in renderResultCard.
function isNotFound(r) {
  return r.manufacturer == null && r.price == null && r.sourceUrl == null;
}

function renderBatchRowCells(row) {
  const realResults = row.results.filter((r) => !isNotFound(r));

  if (realResults.length === 0) {
    const stillWaiting = !(row.digikeyDone && row.distrelecDone);
    return `<tr>
      <td>${row.requirement.mpn}</td>
      <td colspan="6" class="not-found">${stillWaiting ? "Checking…" : "No match found on either supplier."}</td>
    </tr>`;
  }

  return realResults
    .map((r) => {
      const badge = confidenceBadge(r.confidence);
      const priceStr = r.price != null ? `${r.currency ? r.currency + " " : ""}${r.price}` : "—";
      const stockStr = r.stock != null ? String(r.stock) : "—";
      return `<tr>
        <td>${row.requirement.mpn}</td>
        <td>${r.supplier}</td>
        <td>${r.manufacturer ?? "Unknown"}</td>
        <td>${priceStr}</td>
        <td>${stockStr}</td>
        <td><span class="badge ${badge.cls}">${badge.label}</span></td>
        <td>${r.sourceUrl ? `<a href="${r.sourceUrl}" target="_blank" rel="noopener">View →</a>` : "—"}</td>
      </tr>`;
    })
    .join("");
}

function renderBatchTable(job) {
  const parseErrorsHtml =
    job.parseErrors && job.parseErrors.length
      ? `<div class="batch-parse-errors">${job.parseErrors.map((e) => `Row ${e.row}: ${e.message}`).join("<br>")}</div>`
      : "";

  const bodyRows = job.rows.map(renderBatchRowCells).join("");

  const progressPct = job.total > 0 ? Math.round((job.completed / job.total) * 100) : 100;
  const progressHtml =
    job.status === "running"
      ? `<div class="batch-progress"><div class="batch-progress-bar" style="width:${progressPct}%"></div></div><div class="batch-progress-label">${progressPct}% (${job.completed}/${job.total})</div>`
      : `<div class="batch-progress-label">Done — <a href="/api/batch/${job.id}/export.csv">Download report (CSV)</a></div>`;

  batchResultsEl.innerHTML = `
    ${parseErrorsHtml}
    ${renderStatChips(job)}
    ${progressHtml}
    <div class="batch-table-wrap">
      <table class="batch-table">
        <thead><tr><th>Part #</th><th>Supplier</th><th>Manufacturer</th><th>Price</th><th>Stock</th><th>Confidence</th><th>Link</th></tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>`;
}

async function pollBatch(jobId) {
  let res, job;
  try {
    res = await fetch(`/api/batch/${jobId}`);
    job = await res.json();
  } catch {
    setBatchStatus("error", "Couldn't reach the server. Is it running?");
    batchBtn.disabled = false;
    return;
  }

  if (!res.ok) {
    setBatchStatus("error", job.error || "Something went wrong.");
    batchBtn.disabled = false;
    return;
  }

  renderBatchTable(job);

  if (job.status === "running") {
    setTimeout(() => pollBatch(jobId), 1500);
  } else {
    setBatchStatus(null);
    batchBtn.disabled = false;
  }
}

batchForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const file = document.getElementById("bomFile").files[0];
  if (!file) return;

  batchBtn.disabled = true;
  batchResultsEl.innerHTML = "";
  setBatchStatus("loading", `<span class="spinner"></span> Uploading and starting batch…`);

  try {
    const csv = await readFileAsText(file);
    const res = await fetch("/api/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv }),
    });
    const data = await res.json();

    if (!res.ok) {
      setBatchStatus("error", data.error || "Something went wrong.");
      batchBtn.disabled = false;
      return;
    }

    setBatchStatus("loading", `<span class="spinner"></span> Running batch of ${data.total} part(s)…`);
    pollBatch(data.jobId);
  } catch {
    setBatchStatus("error", "Couldn't reach the server. Is it running?");
    batchBtn.disabled = false;
  }
});

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
  } catch {
    setStatus("error", "Couldn't reach the server. Is it running?");
  } finally {
    searchBtn.disabled = false;
  }
});
