import { apiFetch } from "/js/api.js";
import { isAdmin } from "/js/auth.js";

let _results = [];
let _deleteId = null;
const _modal    = () => bootstrap.Modal.getOrCreateInstance(document.getElementById("sbModal"));
const _delModal = () => bootstrap.Modal.getOrCreateInstance(document.getElementById("sbDeleteModal"));
const _scModal  = () => bootstrap.Modal.getOrCreateInstance(document.getElementById("sbScorecardModal"));

export async function init() {
    if (isAdmin()) document.getElementById("btn-sb-add").classList.remove("d-none");

    _populateYears();

    document.getElementById("sb-year").addEventListener("change", _loadManual);
    document.getElementById("btn-sb-add").addEventListener("click", _openAdd);
    document.getElementById("btn-sb-save").addEventListener("click", _save);
    document.getElementById("btn-sb-delete-confirm").addEventListener("click", _deleteConfirm);
    document.getElementById("btn-cc-refresh").addEventListener("click", _loadLive);

    // Load both in parallel
    _loadLive();
    _loadManual();
}

// ── Tab switching ──────────────────────────────────────────────────────────────

window._sbTab = function(tab) {
    const isLive = tab === "live";
    document.getElementById("tab-live").classList.toggle("d-none", !isLive);
    document.getElementById("tab-manual").classList.toggle("d-none", isLive);
    document.getElementById("tab-live-btn").classList.toggle("active", isLive);
    document.getElementById("tab-manual-btn").classList.toggle("active", !isLive);
};

// ── CricClubs live ─────────────────────────────────────────────────────────────

async function _loadLive() {
    const btn = document.getElementById("btn-cc-refresh");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Loading…`;
    document.getElementById("cc-results-list").innerHTML =
        `<div class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm mb-2"></div><br>Fetching CricClubs data…</div>`;
    document.getElementById("cc-fixtures-list").innerHTML = "";

    try {
        const data = await apiFetch("/scoreboard/cricclubs");
        _renderLiveStats(data.stats);
        _renderLiveResults(data.results || []);
        _renderLiveFixtures(data.fixtures || []);
    } catch (e) {
        document.getElementById("cc-results-list").innerHTML =
            `<div class="alert alert-warning"><i class="bi bi-exclamation-triangle me-2"></i>Could not load CricClubs data: ${e.message}</div>`;
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="bi bi-arrow-clockwise me-1"></i>Refresh Live`;
    }
}

function _renderLiveStats(s) {
    if (!s) return;
    document.getElementById("cc-stat-played").textContent = s.played ?? "—";
    document.getElementById("cc-stat-won").textContent    = s.won    ?? "—";
    document.getElementById("cc-stat-lost").textContent   = s.lost   ?? "—";
    document.getElementById("cc-stat-winpct").textContent = s.win_pct != null ? `${s.win_pct}%` : "—";
}

function _resultBadge(result) {
    const map = {
        won:          ["bg-success",  "Won"],
        lost:         ["bg-danger",   "Lost"],
        tied:         ["bg-warning text-dark", "Tied"],
        "no-result":  ["bg-secondary","No Result"],
    };
    const [cls, label] = map[result] || ["bg-secondary", "—"];
    return `<span class="badge ${cls}">${label}</span>`;
}

function _resultClass(result) {
    const map = { won: "result-won", lost: "result-lost", tied: "result-tied", "no-result": "result-no-result" };
    return map[result] || "";
}

function _fmtDate(raw) {
    if (!raw) return "";
    try {
        // CricClubs format: MM/DD/YYYY
        const [m, d, y] = raw.split("/");
        return new Date(`${y}-${m}-${d}`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    } catch {
        return raw;
    }
}

function _renderLiveResults(results) {
    const heading = document.getElementById("cc-results-heading");
    const list    = document.getElementById("cc-results-list");
    if (!results.length) {
        heading.classList.add("d-none");
        list.innerHTML = `<div class="text-center text-muted py-4">
            <i class="bi bi-trophy" style="font-size:2rem;opacity:.25"></i>
            <p class="mt-2 mb-0">No completed matches found on CricClubs.</p>
        </div>`;
        return;
    }
    heading.classList.remove("d-none");
    list.innerHTML = results.map(r => {
        const scoreHtml = (r.our_score || r.opponent_score)
            ? `<div class="d-flex align-items-center gap-2 flex-wrap mt-1">
                 <span class="score-block">ACB ${r.our_score || "—"}</span>
                 <span class="vs-separator">vs</span>
                 <span class="score-block">${r.our_score ? r.opponent : "ACB"} ${r.opponent_score || "—"}</span>
               </div>`
            : "";
        const scorecardBtn = r.match_id
            ? `<button class="btn btn-xs btn-outline-primary btn-sm py-0 px-2" style="font-size:.72rem"
                 onclick="window._sbScorecard(${r.match_id}, '${_escAttr(r.opponent)}', '${_escAttr(r.scorecard_url || '')}')">
                 <i class="bi bi-clipboard-data me-1"></i>Scorecard
               </button>`
            : "";
        return `
        <div class="result-card ${_resultClass(r.result)} mb-2">
          <div class="d-flex align-items-start justify-content-between gap-2 flex-wrap">
            <div>
              <div class="d-flex align-items-center gap-2 flex-wrap">
                <span class="fw-semibold">vs ${_esc(r.opponent)}</span>
                ${_resultBadge(r.result)}
                ${r.league ? `<span class="league-tag">${_esc(r.league)}</span>` : ""}
              </div>
              <div class="text-muted small mt-1">
                <i class="bi bi-calendar3 me-1"></i>${_fmtDate(r.date)}
                ${r.venue ? `<span class="ms-2"><i class="bi bi-geo-alt me-1"></i>${_esc(r.venue)}</span>` : ""}
              </div>
              ${scoreHtml}
            </div>
            <div class="d-flex gap-1 flex-wrap align-items-start">
              ${scorecardBtn}
            </div>
          </div>
        </div>`;
    }).join("");
}

function _renderLiveFixtures(fixtures) {
    const heading = document.getElementById("cc-fixtures-heading");
    const list    = document.getElementById("cc-fixtures-list");
    if (!fixtures.length) {
        heading.classList.add("d-none");
        list.innerHTML = "";
        return;
    }
    heading.classList.remove("d-none");
    list.innerHTML = fixtures.map(f => `
        <div class="fixture-card mb-2">
          <div class="d-flex align-items-start justify-content-between gap-2 flex-wrap">
            <div>
              <div class="fw-semibold">vs ${_esc(f.opponent)}</div>
              <div class="text-muted small mt-1">
                <i class="bi bi-calendar3 me-1"></i>${_fmtDate(f.date)}${f.time ? ` · ${f.time}` : ""}
                ${f.venue ? `<span class="ms-2"><i class="bi bi-geo-alt me-1"></i>${_esc(f.venue)}</span>` : ""}
              </div>
              ${f.league ? `<span class="league-tag mt-1 d-inline-block">${_esc(f.league)}</span>` : ""}
            </div>
            <span class="badge bg-primary">Upcoming</span>
          </div>
        </div>`).join("");
}

// ── Scorecard modal ────────────────────────────────────────────────────────────

window._sbScorecard = async function(matchId, opponent, ccUrl) {
    document.getElementById("sc-modal-title").innerHTML =
        `<i class="bi bi-clipboard-data me-2"></i>Scorecard vs ${_esc(opponent)}`;
    document.getElementById("sc-modal-body").innerHTML =
        `<div class="text-center py-4"><div class="spinner-border"></div></div>`;
    if (ccUrl) {
        document.getElementById("sc-cc-link").href = ccUrl;
        document.getElementById("sc-cc-link").classList.remove("d-none");
    } else {
        document.getElementById("sc-cc-link").classList.add("d-none");
    }
    _scModal().show();

    try {
        const sc = await apiFetch(`/scoreboard/cricclubs/${matchId}`);
        document.getElementById("sc-modal-body").innerHTML = _renderScorecard(sc);
    } catch (e) {
        document.getElementById("sc-modal-body").innerHTML =
            `<div class="alert alert-warning"><i class="bi bi-exclamation-triangle me-2"></i>Could not load scorecard: ${e.message}</div>`;
    }
};

function _renderScorecard(sc) {
    const resultBadge = _resultBadge(sc.result);
    const header = `
        <div class="d-flex align-items-center gap-2 flex-wrap mb-3">
            ${resultBadge}
            <span class="text-muted small"><i class="bi bi-calendar3 me-1"></i>${_fmtDate(sc.date)}</span>
            ${sc.venue ? `<span class="text-muted small"><i class="bi bi-geo-alt me-1"></i>${_esc(sc.venue)}</span>` : ""}
            ${sc.league ? `<span class="league-tag">${_esc(sc.league)}</span>` : ""}
        </div>
        <div class="d-flex align-items-center gap-3 mb-4 flex-wrap">
            <div class="text-center px-3 py-2 rounded border ${sc.result === 'won' ? 'bg-success bg-opacity-10 border-success' : 'bg-light'}">
                <div class="fw-bold fs-5">ACB 2nd XI</div>
                <div class="fs-4 fw-bold">${sc.our_score || "—"}</div>
            </div>
            <div class="text-muted fw-semibold">vs</div>
            <div class="text-center px-3 py-2 rounded border ${sc.result === 'lost' ? 'bg-danger bg-opacity-10 border-danger' : 'bg-light'}">
                <div class="fw-bold fs-5">${_esc(sc.opponent || "Opponent")}</div>
                <div class="fs-4 fw-bold">${sc.opponent_score || "—"}</div>
            </div>
        </div>`;

    const battingTable = (title, rows) => {
        if (!rows || !rows.length) return "";
        const topScorer = rows.reduce((a, b) => (a.runs > b.runs ? a : b), rows[0]);
        return `
        <h6 class="fw-semibold mb-2 mt-3"><i class="bi bi-person-fill me-1"></i>${_esc(title)}</h6>
        <div class="table-responsive">
        <table class="table table-sm scorecard-table mb-0">
          <thead class="table-light">
            <tr><th>Batter</th><th class="text-end">R</th><th class="text-end">B</th><th class="text-end">4s</th><th class="text-end">6s</th><th class="text-end">SR</th><th>Dismissal</th></tr>
          </thead>
          <tbody>
            ${rows.map(p => `
            <tr ${p.name === topScorer.name && topScorer.runs > 0 ? 'class="table-warning"' : ''}>
              <td>${_esc(p.name)}</td>
              <td class="text-end fw-semibold">${p.runs}</td>
              <td class="text-end text-muted">${p.balls || "—"}</td>
              <td class="text-end">${p.fours || 0}</td>
              <td class="text-end">${p.sixes || 0}</td>
              <td class="text-end text-muted">${p.sr != null ? p.sr : "—"}</td>
              <td class="text-muted small">${_esc(p.dismissal || "")}</td>
            </tr>`).join("")}
          </tbody>
        </table>
        </div>`;
    };

    const bowlingTable = (title, rows) => {
        if (!rows || !rows.length) return "";
        const topBowler = rows.reduce((a, b) => (a.wickets > b.wickets || (a.wickets === b.wickets && a.runs < b.runs) ? a : b), rows[0]);
        return `
        <h6 class="fw-semibold mb-2 mt-3"><i class="bi bi-arrow-right-circle me-1"></i>${_esc(title)}</h6>
        <div class="table-responsive">
        <table class="table table-sm scorecard-table mb-0">
          <thead class="table-light">
            <tr><th>Bowler</th><th class="text-end">O</th><th class="text-end">M</th><th class="text-end">R</th><th class="text-end">W</th><th class="text-end">Eco</th><th class="text-end">Wd</th><th class="text-end">NB</th></tr>
          </thead>
          <tbody>
            ${rows.map(p => `
            <tr ${p.name === topBowler.name && topBowler.wickets > 0 ? 'class="table-success"' : ''}>
              <td>${_esc(p.name)}</td>
              <td class="text-end">${p.overs}</td>
              <td class="text-end text-muted">${p.maidens || 0}</td>
              <td class="text-end">${p.runs}</td>
              <td class="text-end fw-semibold">${p.wickets}</td>
              <td class="text-end text-muted">${p.economy != null ? p.economy : "—"}</td>
              <td class="text-end text-muted">${p.wides || 0}</td>
              <td class="text-end text-muted">${p.noballs || 0}</td>
            </tr>`).join("")}
          </tbody>
        </table>
        </div>`;
    };

    return header
        + battingTable("ACB 2nd XI — Batting", sc.our_batting)
        + bowlingTable("ACB 2nd XI — Bowling", sc.our_bowling)
        + `<hr class="my-3">`
        + battingTable(`${_esc(sc.opponent || "Opponent")} — Batting`, sc.opp_batting)
        + bowlingTable(`${_esc(sc.opponent || "Opponent")} — Bowling`, sc.opp_bowling);
}

// ── Manual records ─────────────────────────────────────────────────────────────

function _populateYears() {
    const sel = document.getElementById("sb-year");
    const thisYear = new Date().getFullYear();
    sel.innerHTML = `<option value="">All Years</option>`;
    for (let y = thisYear; y >= thisYear - 5; y--) {
        sel.innerHTML += `<option value="${y}"${y === thisYear ? " selected" : ""}>${y}</option>`;
    }
}

async function _loadManual() {
    const year = document.getElementById("sb-year").value;
    const qs   = year ? `?year=${year}` : "";
    try {
        _results = await apiFetch(`/scoreboard${qs}`);
        _renderStats();
        _renderList();
    } catch (e) {
        document.getElementById("sb-list").innerHTML =
            `<div class="alert alert-danger">Failed to load records: ${e.message}</div>`;
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
            <p class="mt-3 mb-0">No records yet.${admin ? " Click <strong>Add Manual</strong> to get started." : ""}</p>
        </div>`;
        return;
    }

    list.innerHTML = _results.map(r => {
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
        const adminBtns  = admin
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
    }).join("");
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
            await apiFetch(`/scoreboard/${id}`, { method: "PUT", body: JSON.stringify(body) });
        } else {
            await apiFetch("/scoreboard", { method: "POST", body: JSON.stringify(body) });
        }
        _modal().hide();
        await _loadManual();
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
        await _loadManual();
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function _esc(s) {
    return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function _escAttr(s) {
    return String(s ?? "").replace(/'/g, "\\'").replace(/"/g, "&quot;");
}
