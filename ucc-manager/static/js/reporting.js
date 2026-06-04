import { apiFetch, showToast, escHtml } from "/js/api.js";

let allEvents = [];
let openEventId = null;

export async function init() {
    const yearSel = document.getElementById("rp-year");
    const thisYear = new Date().getFullYear();
    for (let y = thisYear - 2; y <= thisYear + 2; y++) {
        yearSel.innerHTML += `<option value="${y}" ${y === thisYear ? "selected" : ""}>${y}</option>`;
    }
    yearSel.addEventListener("change", load);
    await load();
}

async function load() {
    const year = document.getElementById("rp-year").value;
    try {
        allEvents = await apiFetch(`/reporting?year=${year}`);
    } catch (e) {
        document.getElementById("rp-cards").innerHTML =
            `<div class="alert alert-danger">${e.message}</div>`;
        return;
    }
    renderSummary();
    renderCards();
    if (openEventId !== null) {
        const panel = document.getElementById(`rp-panel-${openEventId}`);
        if (panel) openPanel(openEventId);
    }
}

function renderSummary() {
    const withAvail    = allEvents.filter(e => e.total_members > 0);
    const totalRep     = withAvail.reduce((s, e) => s + e.reported_count, 0);
    const totalAbsent  = withAvail.reduce((s, e) => s + e.absent_count,   0);
    const totalExpected = withAvail.reduce((s, e) => s + e.total_members,  0);

    document.getElementById("rp-summary").innerHTML = `
        <div class="col-auto">
          <div class="card border-primary text-center" style="min-width:120px">
            <div class="card-body py-2 px-3">
              <div class="fs-3 fw-bold text-primary">${allEvents.length}</div>
              <div class="small text-muted">Matches</div>
            </div>
          </div>
        </div>
        <div class="col-auto">
          <div class="card border-success text-center" style="min-width:130px">
            <div class="card-body py-2 px-3">
              <div class="fs-3 fw-bold text-success">${totalRep}<span class="fs-6 text-muted">/${totalExpected}</span></div>
              <div class="small text-muted">Reported</div>
            </div>
          </div>
        </div>
        <div class="col-auto">
          <div class="card border-danger text-center" style="min-width:130px">
            <div class="card-body py-2 px-3">
              <div class="fs-3 fw-bold text-danger">${totalAbsent}</div>
              <div class="small text-muted">No Show</div>
            </div>
          </div>
        </div>`;
}

function renderCards() {
    const container = document.getElementById("rp-cards");
    if (!allEvents.length) {
        container.innerHTML = `<div class="card"><div class="card-body text-center text-muted py-5">No match events found for this season.</div></div>`;
        return;
    }
    container.innerHTML = allEvents.map(ev => {
        const [y, m, d] = ev.date.split("-").map(Number);
        const dateStr = new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
        const unknown = ev.total_members - ev.reported_count - ev.absent_count;
        const pct = ev.total_members ? Math.round(ev.reported_count / ev.total_members * 100) : 0;
        const barColor = pct === 100 ? "bg-success" : pct >= 60 ? "bg-warning" : "bg-danger";

        return `
        <div class="card mb-3" id="rp-card-${ev.id}">
          <div class="card-body">
            <div class="d-flex align-items-start justify-content-between gap-3">
              <div class="flex-grow-1">
                <div class="d-flex align-items-center flex-wrap gap-2 mb-1">
                  <span class="badge bg-secondary">${dateStr}</span>
                  <span class="fw-semibold">${escHtml(ev.title)}</span>
                  ${ev.match_type ? `<span class="badge bg-info text-dark">${ev.match_type}</span>` : ""}
                  ${ev.home_away ? `<span class="badge ${ev.home_away === "home" ? "bg-success" : "bg-warning text-dark"}">${ev.home_away === "home" ? "Home" : "Away"}</span>` : ""}
                  ${ev.location ? `<span class="text-muted small">${escHtml(ev.location)}</span>` : ""}
                  ${ev.reporting_time
                    ? `<span class="badge text-bg-warning"><i class="bi bi-clock me-1"></i>Report by ${ev.reporting_time}</span>`
                    : ""}
                  ${ev.total_members > 0
                    ? `<span class="badge bg-success"><i class="bi bi-people-fill me-1"></i>${ev.total_members} in squad</span>`
                    : `<a href="#calendar" class="badge bg-warning text-dark text-decoration-none"><i class="bi bi-exclamation-triangle me-1"></i>No squad — set in Calendar</a>`}
                </div>
                ${ev.total_members > 0 ? `
                <div class="d-flex align-items-center flex-wrap gap-3 mt-1" id="rp-stats-${ev.id}">
                  <span class="text-success small fw-semibold"><i class="bi bi-check-circle-fill me-1"></i>${ev.reported_count} reported</span>
                  ${ev.absent_count > 0 ? `<span class="text-danger small fw-semibold"><i class="bi bi-x-circle-fill me-1"></i>${ev.absent_count} no show</span>` : ""}
                  ${unknown > 0 ? `<span class="text-muted small">${unknown} pending</span>` : ""}
                </div>
                <div class="progress mt-2" style="height:5px;max-width:280px">
                  <div class="progress-bar ${barColor}" id="rp-bar-${ev.id}" style="width:${pct}%"></div>
                </div>` : `<a href="#calendar" class="small fst-italic text-warning text-decoration-none"><i class="bi bi-exclamation-triangle me-1"></i>No squad — set in Calendar</a>`}
              </div>
              ${ev.total_members > 0 ? `
              <div class="flex-shrink-0 no-print">
                <button class="btn btn-sm btn-outline-primary" onclick="window._rpTogglePanel(${ev.id})">
                  <i class="bi bi-people me-1"></i>Reporting
                </button>
              </div>` : ""}
            </div>
          </div>
          <div id="rp-panel-${ev.id}" style="display:none;border-top:1px solid #dee2e6">
            <div class="card-body py-3" id="rp-panel-body-${ev.id}"></div>
          </div>
        </div>`;
    }).join("");
}

async function openPanel(eventId) {
    const panel = document.getElementById(`rp-panel-${eventId}`);
    const body  = document.getElementById(`rp-panel-body-${eventId}`);
    if (!panel) return;
    panel.style.display = "";
    body.innerHTML = `<div class="text-center py-2"><div class="spinner-border spinner-border-sm"></div></div>`;
    try {
        const players = await apiFetch(`/reporting/${eventId}/players`);
        const ev = allEvents.find(e => e.id === eventId);
        renderPanel(eventId, players, ev?.reporting_time || null);
    } catch (e) {
        body.innerHTML = `<div class="alert alert-danger small">${e.message}</div>`;
    }
}

function statusBtn(eventId, memberId, current) {
    const states = {
        unknown:  { label: "Not Yet",  icon: "bi-circle",           cls: "btn-outline-secondary" },
        reported: { label: "Reported", icon: "bi-check-circle-fill", cls: "btn-success"           },
        absent:   { label: "No Show",  icon: "bi-x-circle-fill",     cls: "btn-danger"            },
    };
    const s = states[current] || states.unknown;
    return `<button type="button"
        class="btn btn-sm ${s.cls} rp-status-btn flex-shrink-0"
        style="min-width:108px"
        data-event="${eventId}" data-member="${memberId}" data-status="${current}"
        onclick="window._rpCycleStatus(this)">
      <i class="bi ${s.icon} me-1"></i>${s.label}
    </button>`;
}

function renderPanel(eventId, players, scheduledTime) {
    const body = document.getElementById(`rp-panel-body-${eventId}`);
    if (!players.length) {
        body.innerHTML = `<p class="text-muted small mb-0">
            <i class="bi bi-info-circle me-1"></i>No squad selected for this match yet.
            <a href="#calendar" class="text-primary">Open Calendar</a> and use the Match Squad section to select players.</p>`;
        return;
    }
    const reportedCount = players.filter(p => p.status === "reported").length;
    const absentCount   = players.filter(p => p.status === "absent").length;
    body.innerHTML = `
        <div class="small text-muted mb-3" id="rp-footer-${eventId}">
          ${reportedCount} reported &bull; ${absentCount} no show &bull; ${players.length - reportedCount - absentCount} pending
          ${scheduledTime ? ` &bull; Report by <strong>${scheduledTime}</strong>` : ""}
        </div>
        ${players.map(p => {
            const isLate = scheduledTime && p.reported_time && p.reported_time > scheduledTime;
            return `
            <div class="rp-row" id="rp-row-${eventId}-${p.member_id}">
              <span class="flex-grow-1 fw-medium small">${escHtml(p.name)}</span>
              ${isLate ? `<span class="badge bg-danger rp-late">Late</span>` : `<span class="rp-late" style="width:36px"></span>`}
              <input type="time" class="form-control form-control-sm" style="width:108px"
                     value="${p.reported_time || ""}"
                     title="Actual arrival time"
                     onchange="window._rpSetTime(${eventId}, ${p.member_id}, this.value)" />
              ${statusBtn(eventId, p.member_id, p.status)}
            </div>`;
        }).join("")}`;
}

window._rpTogglePanel = async (eventId) => {
    const panel = document.getElementById(`rp-panel-${eventId}`);
    if (panel.style.display !== "none") {
        panel.style.display = "none";
        openEventId = null;
        return;
    }
    openEventId = eventId;
    await openPanel(eventId);
};

const STATUS_CYCLE = { unknown: "reported", reported: "absent", absent: "unknown" };

window._rpCycleStatus = async (btn) => {
    btn.disabled = true;
    const eventId  = Number(btn.dataset.event);
    const memberId = Number(btn.dataset.member);
    const next     = STATUS_CYCLE[btn.dataset.status] || "reported";
    try {
        const res = await apiFetch(`/reporting/${eventId}/players/${memberId}`, {
            method: "PATCH",
            body: JSON.stringify({ status: next }),
        });
        const newBtn = document.createElement("div");
        newBtn.innerHTML = statusBtn(eventId, memberId, res.status);
        btn.replaceWith(newBtn.firstElementChild);
        updateLateBadge(eventId, memberId, res.reported_time);
        await refreshCardStats(eventId);
    } catch (e) {
        showToast(e.message, "error");
        btn.disabled = false;
    }
};

window._rpSetTime = async (eventId, memberId, value) => {
    try {
        const res = await apiFetch(`/reporting/${eventId}/players/${memberId}`, {
            method: "PATCH",
            body: JSON.stringify({ reported_time: value }),
        });
        updateLateBadge(eventId, memberId, res.reported_time);
    } catch (e) {
        showToast(e.message, "error");
    }
};

function updateLateBadge(eventId, memberId, reportedTime) {
    const ev = allEvents.find(e => e.id === eventId);
    const scheduledTime = ev?.reporting_time || null;
    const row = document.getElementById(`rp-row-${eventId}-${memberId}`);
    if (!row) return;
    const badge = row.querySelector(".rp-late");
    if (!badge) return;
    const isLate = scheduledTime && reportedTime && reportedTime > scheduledTime;
    badge.className = isLate ? "badge bg-danger rp-late" : "rp-late";
    badge.textContent = isLate ? "Late" : "";
    if (!isLate) badge.style.width = "36px";
}

async function refreshCardStats(eventId) {
    const year = document.getElementById("rp-year").value;
    try {
        allEvents = await apiFetch(`/reporting?year=${year}`);
    } catch {
        return;
    }
    renderSummary();
    const ev = allEvents.find(e => e.id === eventId);
    if (!ev) return;

    const unknown = ev.total_members - ev.reported_count - ev.absent_count;
    const pct = ev.total_members ? Math.round(ev.reported_count / ev.total_members * 100) : 0;
    const barColor = pct === 100 ? "bg-success" : pct >= 60 ? "bg-warning" : "bg-danger";

    const stats = document.getElementById(`rp-stats-${ev.id}`);
    if (stats) {
        stats.innerHTML = `
            <span class="text-success small fw-semibold"><i class="bi bi-check-circle-fill me-1"></i>${ev.reported_count} reported</span>
            ${ev.absent_count > 0 ? `<span class="text-danger small fw-semibold"><i class="bi bi-x-circle-fill me-1"></i>${ev.absent_count} no show</span>` : ""}
            ${unknown > 0 ? `<span class="text-muted small">${unknown} pending</span>` : ""}`;
    }
    const bar = document.getElementById(`rp-bar-${ev.id}`);
    if (bar) { bar.className = `progress-bar ${barColor}`; bar.style.width = `${pct}%`; }

    const footer = document.getElementById(`rp-footer-${eventId}`);
    if (footer) {
        footer.innerHTML = `${ev.reported_count} reported &bull; ${ev.absent_count} no show &bull; ${unknown} pending${ev.reporting_time ? ` &bull; Report by <strong>${ev.reporting_time}</strong>` : ""}`;
    }
}
