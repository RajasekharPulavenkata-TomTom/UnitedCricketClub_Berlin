import { apiFetch } from "/js/api.js";
import { isAdmin } from "/js/auth.js";

const _SV = Date.now();

let _results = [];
let _deleteId = null;
const _modal    = () => bootstrap.Modal.getOrCreateInstance(document.getElementById("sbModal"));
const _delModal = () => bootstrap.Modal.getOrCreateInstance(document.getElementById("sbDeleteModal"));

export async function init() {
    if (isAdmin()) document.getElementById("btn-sb-add").classList.remove("d-none");

    _populateYears();
    await _load();

    document.getElementById("sb-year").addEventListener("change", _load);
    document.getElementById("btn-sb-add").addEventListener("click", _openAdd);
    document.getElementById("btn-sb-save").addEventListener("click", _save);
    document.getElementById("btn-sb-delete-confirm").addEventListener("click", _deleteConfirm);
}

function _populateYears() {
    const sel = document.getElementById("sb-year");
    const thisYear = new Date().getFullYear();
    sel.innerHTML = `<option value="">All Years</option>`;
    for (let y = thisYear; y >= thisYear - 5; y--) {
        sel.innerHTML += `<option value="${y}"${y === thisYear ? " selected" : ""}>${y}</option>`;
    }
}

async function _load() {
    const year = document.getElementById("sb-year").value;
    const qs   = year ? `?year=${year}&_=${_SV}` : `?_=${_SV}`;
    try {
        _results = await apiFetch(`/api/scoreboard${qs}`);
        _renderStats();
        _renderList();
    } catch (e) {
        document.getElementById("sb-list").innerHTML =
            `<div class="alert alert-danger">Failed to load scoreboard: ${e.message}</div>`;
    }
}

function _renderStats() {
    const played = _results.length;
    const won    = _results.filter(r => r.result === "won").length;
    const lost   = _results.filter(r => r.result === "lost").length;
    const winPct = played > 0 ? Math.round((won / played) * 100) : null;

    document.getElementById("sb-stat-played").textContent = played;
    document.getElementById("sb-stat-won").textContent    = won;
    document.getElementById("sb-stat-lost").textContent   = lost;
    document.getElementById("sb-stat-winpct").textContent = winPct !== null ? `${winPct}%` : "—";
}

function _resultBadge(result) {
    const map = {
        won:        ["bg-success",  "Won"],
        lost:       ["bg-danger",   "Lost"],
        tied:       ["bg-warning text-dark", "Tied"],
        "no-result":["bg-secondary","No Result"],
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

function _renderList() {
    const admin = isAdmin();
    const list  = document.getElementById("sb-list");

    if (!_results.length) {
        list.innerHTML = `<div class="text-center text-muted py-5">
            <i class="bi bi-trophy" style="font-size:2.5rem;opacity:.25"></i>
            <p class="mt-3 mb-0">No results yet.${admin ? " Click <strong>Add Result</strong> to get started." : ""}</p>
        </div>`;
        return;
    }

    const rows = _results.map(r => {
        const dateStr = new Date(r.date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
        const scoreHtml = (r.our_score || r.opponent_score)
            ? `<div class="d-flex align-items-center gap-2 flex-wrap mt-1">
                 <span class="score-block">${r.our_score || "—"}</span>
                 <span class="vs-separator">vs</span>
                 <span class="score-block">${r.opponent_score || "—"}</span>
               </div>`
            : "";
        const marginHtml = r.margin ? `<span class="text-muted small">by ${r.margin}</span>` : "";
        const scorecard  = r.cricclubs_url
            ? `<a href="${r.cricclubs_url}" target="_blank" rel="noopener noreferrer" class="btn btn-xs btn-outline-secondary btn-sm py-0 px-2" style="font-size:.72rem"><i class="bi bi-box-arrow-up-right me-1"></i>Scorecard</a>`
            : "";
        const adminBtns  = isAdmin
            ? `<button class="btn btn-sm btn-outline-secondary py-0 px-2" style="font-size:.72rem" onclick="window._sbEdit(${r.id})"><i class="bi bi-pencil"></i></button>
               <button class="btn btn-sm btn-outline-danger py-0 px-2" style="font-size:.72rem" onclick="window._sbDelete(${r.id},'${r.opponent.replace(/'/g, "\\'")}')"><i class="bi bi-trash"></i></button>`
            : "";
        return `
        <div class="result-card ${_resultClass(r.result)} mb-2">
          <div class="d-flex align-items-start justify-content-between gap-2 flex-wrap">
            <div>
              <div class="d-flex align-items-center gap-2 flex-wrap">
                <span class="fw-semibold">vs ${r.opponent}</span>
                ${_resultBadge(r.result)}
                ${_homeAwayBadge(r.home_away)}
                ${r.match_type ? `<span class="badge bg-light text-dark border">${r.match_type}</span>` : ""}
              </div>
              <div class="text-muted small mt-1">
                <i class="bi bi-calendar3 me-1"></i>${dateStr}
                ${r.venue ? `<span class="ms-2"><i class="bi bi-geo-alt me-1"></i>${r.venue}</span>` : ""}
              </div>
              ${scoreHtml}
              ${marginHtml}
              ${r.notes ? `<div class="text-muted small mt-1 fst-italic">${r.notes}</div>` : ""}
            </div>
            <div class="d-flex gap-1 flex-wrap align-items-start">
              ${scorecard}
              ${adminBtns}
            </div>
          </div>
        </div>`;
    }).join("");

    list.innerHTML = rows;
}

// ── Admin actions ─────────────────────────────────────────────────────────────

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
            await apiFetch(`/api/scoreboard/${id}`, { method: "PUT", body: JSON.stringify(body) });
        } else {
            await apiFetch("/api/scoreboard", { method: "POST", body: JSON.stringify(body) });
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
        await apiFetch(`/api/scoreboard/${_deleteId}`, { method: "DELETE" });
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
