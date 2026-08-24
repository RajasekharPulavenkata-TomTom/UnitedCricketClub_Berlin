import { apiFetch } from "/js/api.js";
import { isAdmin } from "/js/auth.js";

let _results = [];
let _deleteId = null;
const _modal    = () => bootstrap.Modal.getOrCreateInstance(document.getElementById("sbModal"));
const _delModal = () => bootstrap.Modal.getOrCreateInstance(document.getElementById("sbDeleteModal"));

export async function init() {
    if (isAdmin()) {
        document.getElementById("btn-sb-add").classList.remove("d-none");
        document.getElementById("btn-sb-import").classList.remove("d-none");
    }

    _populateYears();
    await _load();

    document.getElementById("sb-year").addEventListener("change", () => _load());
    document.getElementById("btn-sb-add").addEventListener("click", _openAdd);
    document.getElementById("btn-sb-save").addEventListener("click", _save);
    document.getElementById("btn-sb-delete-confirm").addEventListener("click", _deleteConfirm);
    document.getElementById("btn-sb-import").addEventListener("click", _openImport);
    document.getElementById("btn-sb-import-run").addEventListener("click", _runImport);
}

const _importModal = () => bootstrap.Modal.getOrCreateInstance(document.getElementById("sbImportModal"));

function _openImport() {
    document.getElementById("sb-import-file").value = "";
    document.getElementById("sb-import-error").classList.add("d-none");
    document.getElementById("sb-import-result").classList.add("d-none");
    _importModal().show();
}

async function _runImport() {
    const errEl = document.getElementById("sb-import-error");
    const okEl  = document.getElementById("sb-import-result");
    const btn   = document.getElementById("btn-sb-import-run");
    errEl.classList.add("d-none");
    okEl.classList.add("d-none");
    const fileInput = document.getElementById("sb-import-file");
    const file = fileInput.files[0];
    if (!file) {
        errEl.textContent = "Choose a CSV file first.";
        errEl.classList.remove("d-none");
        return;
    }
    const fd = new FormData();
    fd.append("file", file);
    fd.append("match_type", document.getElementById("sb-import-format").value);

    btn.disabled = true;
    try {
        // Direct fetch (not apiFetch) so the browser sets the multipart boundary.
        const token = localStorage.getItem("ucc_token");
        const res = await fetch("/api/scoreboard/import", {
            method: "POST",
            headers: token ? { "Authorization": `Bearer ${token}` } : {},
            body: fd,
        });
        if (res.status === 401) {  // mirror apiFetch: expired session → clear + logout
            localStorage.removeItem("ucc_token");
            localStorage.removeItem("ucc_user");
            window.dispatchEvent(new CustomEvent("ucc:logout"));
            throw new Error("Session expired. Please log in again.");
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.detail || `Import failed (${res.status})`);
        okEl.textContent = `Imported ${Number(data.imported)}, updated ${Number(data.updated)} (of ${Number(data.total)} ACB 2nd XI matches found).`;
        okEl.classList.remove("d-none");
        await _load(true);   // refresh, bypassing the client GET cache
    } catch (e) {
        errEl.textContent = e.message;
        errEl.classList.remove("d-none");
    } finally {
        btn.disabled = false;
    }
}

function _populateYears() {
    const sel = document.getElementById("sb-year");
    const thisYear = new Date().getFullYear();
    sel.innerHTML = `<option value="">All Years</option>`;
    for (let y = thisYear; y >= thisYear - 5; y--) {
        sel.innerHTML += `<option value="${y}"${y === thisYear ? " selected" : ""}>${y}</option>`;
    }
}

async function _load(fresh = false) {
    const year = document.getElementById("sb-year").value;
    const params = new URLSearchParams();
    if (year) params.set("year", year);
    if (fresh) params.set("_", Date.now());  // unique key → bypass the 60s GET cache after an import
    const qs = params.toString() ? `?${params}` : "";
    try {
        _results = await apiFetch(`/scoreboard${qs}`);
        _renderSections();
    } catch (e) {
        document.getElementById("sb-sections").innerHTML =
            `<div class="alert alert-danger">Failed to load results: ${e.message}</div>`;
    }
}

// Which format bucket a result belongs to. T20 and 50-Overs are the two named
// sections; everything else (8-Overs, T10, blank) collects under "Other".
function _bucket(matchType) {
    const t = (matchType || "").toLowerCase();
    if (t.includes("50")) return "50 Overs";
    if (t.includes("t20") || t === "20-overs") return "T20";
    return "Other";
}

function _miniStats(rows) {
    const played = rows.length;
    const won    = rows.filter(r => r.result === "won").length;
    const lost   = rows.filter(r => r.result === "lost").length;
    const winPct = played > 0 ? Math.round((won / played) * 100) : null;
    return `<span class="sb-mini-stats">
        Played <span class="sb-pill">${played}</span> ·
        Won <span class="sb-pill text-success">${won}</span> ·
        Lost <span class="sb-pill text-danger">${lost}</span> ·
        Win <span class="sb-pill">${winPct !== null ? winPct + "%" : "—"}</span>
      </span>`;
}

function _resultBadge(result) {
    const map = {
        won:         ["bg-success",           "Won"],
        lost:        ["bg-danger",            "Lost"],
        tied:        ["bg-warning text-dark", "Tied"],
        "no-result": ["bg-secondary",         "No Result"],
    };
    const [cls, label] = map[result] || ["bg-secondary", "—"];
    return `<span class="badge ${cls}">${label}</span>`;
}

function _resultClass(result) {
    const map = { won: "result-won", lost: "result-lost", tied: "result-tied", "no-result": "result-no-result" };
    return map[result] || "";
}

function _homeAwayBadge(ha) {
    if (ha === "home")    return `<span class="badge bg-primary me-1">Home</span>`;
    if (ha === "away")    return `<span class="badge bg-secondary me-1">Away</span>`;
    if (ha === "neutral") return `<span class="badge bg-light text-dark border me-1">Neutral</span>`;
    return "";
}

function _renderSections() {
    const admin = isAdmin();
    const container = document.getElementById("sb-sections");

    // Group by format bucket, preserving the API's date-desc order within each.
    const groups = {};
    for (const r of _results) (groups[_bucket(r.match_type)] ||= []).push(r);

    // T20 and 50 Overs are always shown (with empty states); Other only if present.
    const order = ["T20", "50 Overs"];
    if (groups["Other"]?.length) order.push("Other");

    const yearFiltered = !!document.getElementById("sb-year").value;
    container.innerHTML = order.map(name => {
        const rows = groups[name] || [];
        const empty = admin
            ? `No ${name} results${yearFiltered ? " this year" : " yet"} — click <strong>Add Result</strong> to add one.`
            : `No ${name} results${yearFiltered ? " this year" : " yet"}.`;
        const body = rows.length
            ? rows.map(r => _cardHtml(r, admin)).join("")
            : `<div class="text-muted small fst-italic py-2">${empty}</div>`;
        return `
          <div class="mb-4">
            <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2 pb-1 border-bottom">
              <h5 class="sb-section-head mb-0">${name}</h5>
              ${rows.length ? _miniStats(rows) : ""}
            </div>
            ${body}
          </div>`;
    }).join("");
}

function _cardHtml(r, admin) {
        const dateStr = new Date(r.date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
        const scoreHtml = (r.our_score || r.opponent_score)
            ? `<div class="d-flex align-items-center gap-2 flex-wrap mt-1">
                 <span class="score-block">${r.our_score ? _esc(r.our_score) : "—"}</span>
                 <span class="vs-separator">vs</span>
                 <span class="score-block">${r.opponent_score ? _esc(r.opponent_score) : "—"}</span>
               </div>`
            : "";
        const marginHtml = r.margin ? `<span class="text-muted small">by ${_esc(r.margin)}</span>` : "";
        const scorecard  = r.cricclubs_url
            ? `<a href="${r.cricclubs_url}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-outline-secondary py-0 px-2" style="font-size:.72rem"><i class="bi bi-box-arrow-up-right me-1"></i>Scorecard</a>`
            : "";
        const adminBtns = admin
            ? `<button class="btn btn-sm btn-outline-secondary py-0 px-2" style="font-size:.72rem" onclick="window._sbEdit(${r.id})"><i class="bi bi-pencil"></i></button>
               <button class="btn btn-sm btn-outline-danger py-0 px-2" style="font-size:.72rem" onclick="window._sbDelete(${r.id},'${r.opponent.replace(/'/g, "\\'")}')"><i class="bi bi-trash"></i></button>`
            : "";
        return `
        <div class="result-card ${_resultClass(r.result)} mb-2">
          <div class="d-flex align-items-start justify-content-between gap-2 flex-wrap">
            <div>
              <div class="d-flex align-items-center gap-2 flex-wrap">
                <span class="fw-semibold">vs ${_esc(r.opponent)}</span>
                ${_resultBadge(r.result)}
                ${_homeAwayBadge(r.home_away)}
                ${r.match_type ? `<span class="badge bg-light text-dark border">${r.match_type}</span>` : ""}
              </div>
              <div class="text-muted small mt-1">
                <i class="bi bi-calendar3 me-1"></i>${dateStr}
                ${r.venue ? `<span class="ms-2"><i class="bi bi-geo-alt me-1"></i>${_esc(r.venue)}</span>` : ""}
              </div>
              ${scoreHtml}
              ${marginHtml}
              ${r.notes ? `<div class="text-muted small mt-1 fst-italic">${_esc(r.notes)}</div>` : ""}
            </div>
            <div class="d-flex gap-1 flex-wrap align-items-start">
              ${scorecard}
              ${adminBtns}
            </div>
          </div>
        </div>`;
}

// ── Admin actions ──────────────────────────────────────────────────────────────

function _openAdd() {
    document.getElementById("sb-modal-title").innerHTML = '<i class="bi bi-trophy me-2"></i>Add Result';
    document.getElementById("sb-form").reset();
    document.getElementById("sb-id").value = "";
    document.getElementById("sb-modal-error").classList.add("d-none");
    _modal().show();
}

window._sbEdit = function(id) {
    const r = _results.find(x => x.id === id);
    if (!r) return;
    document.getElementById("sb-modal-title").innerHTML = '<i class="bi bi-pencil me-2"></i>Edit Result';
    document.getElementById("sb-id").value         = r.id;
    document.getElementById("sb-date").value       = r.date;
    document.getElementById("sb-opponent").value   = r.opponent;
    document.getElementById("sb-venue").value      = r.venue || "";
    document.getElementById("sb-match-type").value = r.match_type || "";
    document.getElementById("sb-home-away").value  = r.home_away || "";
    document.getElementById("sb-our-score").value  = r.our_score || "";
    document.getElementById("sb-opp-score").value  = r.opponent_score || "";
    document.getElementById("sb-result").value     = r.result || "";
    document.getElementById("sb-margin").value     = r.margin || "";
    document.getElementById("sb-url").value        = r.cricclubs_url || "";
    document.getElementById("sb-notes").value      = r.notes || "";
    document.getElementById("sb-modal-error").classList.add("d-none");
    _modal().show();
};

window._sbDelete = function(id, name) {
    _deleteId = id;
    document.getElementById("sb-delete-name").textContent = name;
    _delModal().show();
};

async function _save() {
    const id = document.getElementById("sb-id").value;
    const body = {
        date:           document.getElementById("sb-date").value,
        opponent:       document.getElementById("sb-opponent").value.trim(),
        venue:          document.getElementById("sb-venue").value.trim() || null,
        match_type:     document.getElementById("sb-match-type").value || null,
        home_away:      document.getElementById("sb-home-away").value || null,
        our_score:      document.getElementById("sb-our-score").value.trim() || null,
        opponent_score: document.getElementById("sb-opp-score").value.trim() || null,
        result:         document.getElementById("sb-result").value || null,
        margin:         document.getElementById("sb-margin").value.trim() || null,
        cricclubs_url:  document.getElementById("sb-url").value.trim() || null,
        notes:          document.getElementById("sb-notes").value.trim() || null,
    };
    if (!body.date || !body.opponent) {
        _showErr("Date and Opponent are required.");
        return;
    }
    const btn = document.getElementById("btn-sb-save");
    btn.disabled = true;
    try {
        if (id) {
            await apiFetch(`/scoreboard/${id}`, { method: "PUT", body: JSON.stringify(body) });
        } else {
            await apiFetch("/scoreboard", { method: "POST", body: JSON.stringify(body) });
        }
        _modal().hide();
        await _load();
    } catch (e) {
        _showErr(e.message);
    } finally {
        btn.disabled = false;
    }
}

async function _deleteConfirm() {
    if (!_deleteId) return;
    const btn = document.getElementById("btn-sb-delete-confirm");
    btn.disabled = true;
    try {
        await apiFetch(`/scoreboard/${_deleteId}`, { method: "DELETE" });
        _delModal().hide();
        _deleteId = null;
        await _load();
    } catch (e) {
        alert("Delete failed: " + e.message);
    } finally {
        btn.disabled = false;
    }
}

function _showErr(msg) {
    const el = document.getElementById("sb-modal-error");
    el.textContent = msg;
    el.classList.remove("d-none");
}

function _esc(s) {
    return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
