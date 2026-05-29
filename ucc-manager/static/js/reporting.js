import { apiFetch, showToast } from "/js/api.js";

let allEvents = [];
let openEventId = null;

export async function init() {
    const yearSel = document.getElementById("rp-year");
    for (let y = 2026; y <= 2030; y++) {
        yearSel.innerHTML += `<option value="${y}" ${y === 2026 ? "selected" : ""}>${y}</option>`;
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
    const withXI   = allEvents.filter(e => e.total_members > 0);
    const totalRep = withXI.reduce((s, e) => s + e.reported_count, 0);
    const totalExp = withXI.reduce((s, e) => s + e.total_members, 0);
    const fullMatch = withXI.filter(e => e.total_members > 0 && e.reported_count === e.total_members).length;

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
              <div class="fs-3 fw-bold text-success">${totalRep}<span class="fs-6 text-muted">/${totalExp}</span></div>
              <div class="small text-muted">Reported</div>
            </div>
          </div>
        </div>
        <div class="col-auto">
          <div class="card border-warning text-center" style="min-width:130px">
            <div class="card-body py-2 px-3">
              <div class="fs-3 fw-bold text-warning">${fullMatch}</div>
              <div class="small text-muted">Full XI In</div>
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
        const pct = ev.total_members ? Math.round(ev.reported_count / ev.total_members * 100) : 0;
        const barColor = pct === 100 ? "bg-success" : pct >= 60 ? "bg-warning" : "bg-danger";

        return `
        <div class="card mb-3" id="rp-card-${ev.id}">
          <div class="card-body">
            <div class="d-flex align-items-start justify-content-between gap-3">
              <div class="flex-grow-1">
                <div class="d-flex align-items-center flex-wrap gap-2 mb-1">
                  <span class="badge bg-secondary">${dateStr}</span>
                  <span class="fw-semibold">${ev.title}</span>
                  ${ev.location ? `<span class="text-muted small">${ev.location}</span>` : ""}
                  ${ev.reporting_time
                    ? `<span class="badge text-bg-warning"><i class="bi bi-clock me-1"></i>Report by ${ev.reporting_time}</span>`
                    : ""}
                  ${ev.total_members > 0
                    ? `<span class="badge bg-success"><i class="bi bi-people-fill me-1"></i>${ev.total_members} available</span>`
                    : `<span class="badge bg-warning text-dark"><i class="bi bi-exclamation-triangle me-1"></i>No availability marked</span>`}
                </div>
                ${ev.total_members > 0 ? `
                <div class="d-flex align-items-center gap-3 mt-1">
                  <span class="small text-muted">${ev.reported_count}/${ev.total_members} reported</span>
                  ${pct === 100 ? `<span class="text-success small"><i class="bi bi-check-circle-fill me-1"></i>All in</span>` : ""}
                </div>
                <div class="progress mt-2" style="height:5px;max-width:280px">
                  <div class="progress-bar ${barColor}" style="width:${pct}%"></div>
                </div>` : `<span class="text-muted small fst-italic">No players marked available for this match</span>`}
              </div>
              ${ev.total_members > 0 ? `
              <div class="flex-shrink-0 no-print">
                <button class="btn btn-sm btn-outline-primary"
                    onclick="window._rpTogglePanel(${ev.id})">
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
    const players = await apiFetch(`/reporting/${eventId}/players`);
    const ev = allEvents.find(e => e.id === eventId);
    renderPanel(eventId, players, ev?.reporting_time || null);
}

function renderPanel(eventId, players, scheduledTime) {
    const body = document.getElementById(`rp-panel-body-${eventId}`);
    if (!players.length) {
        body.innerHTML = `<p class="text-muted small mb-0">
            <i class="bi bi-info-circle me-1"></i>No players have marked themselves available for this match yet.</p>`;
        return;
    }

    const reportedCount = players.filter(p => p.reported).length;
    body.innerHTML = `
        <div class="small text-muted mb-3">
          ${reportedCount} of ${players.length} reported
          ${scheduledTime ? ` &bull; Scheduled: <strong>${scheduledTime}</strong>` : ""}
        </div>
        ${players.map(p => {
            const isLate = scheduledTime && p.reported_time && p.reported_time > scheduledTime;
            return `
            <div class="rp-row" id="rp-row-${eventId}-${p.member_id}">
              <span class="flex-grow-1 fw-medium small">${p.name}</span>
              ${isLate ? `<span class="badge bg-danger rp-late">Late</span>` : `<span class="rp-late" style="width:36px"></span>`}
              <input type="time" class="form-control form-control-sm" style="width:108px"
                     value="${p.reported_time || ""}"
                     title="Actual arrival time"
                     onchange="window._rpSetTime(${eventId}, ${p.member_id}, this.value)" />
              <button type="button"
                  class="btn btn-sm ${p.reported ? "btn-success" : "btn-outline-secondary"} flex-shrink-0"
                  style="min-width:108px"
                  onclick="window._rpToggle(${eventId}, ${p.member_id}, this)">
                <i class="bi ${p.reported ? "bi-check-circle-fill" : "bi-circle"} me-1"></i>${p.reported ? "Reported" : "Not Yet"}
              </button>
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

window._rpToggle = async (eventId, memberId, btn) => {
    btn.disabled = true;
    const wasReported = btn.classList.contains("btn-success");
    try {
        const res = await apiFetch(`/reporting/${eventId}/players/${memberId}`, {
            method: "PATCH",
            body: JSON.stringify({ reported: !wasReported }),
        });
        btn.className = `btn btn-sm ${res.reported ? "btn-success" : "btn-outline-secondary"} flex-shrink-0`;
        btn.style.minWidth = "108px";
        btn.innerHTML = `<i class="bi ${res.reported ? "bi-check-circle-fill" : "bi-circle"} me-1"></i>${res.reported ? "Reported" : "Not Yet"}`;
        updateLateBadge(eventId, memberId, res.reported_time);
        await refreshCardStats(eventId);
    } catch (e) {
        showToast(e.message, "error");
    } finally {
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
    if (isLate) {
        badge.className = "badge bg-danger rp-late";
        badge.textContent = "Late";
    } else {
        badge.className = "rp-late";
        badge.textContent = "";
        badge.style.width = "36px";
    }
}

async function refreshCardStats(eventId) {
    const year = document.getElementById("rp-year").value;
    allEvents = await apiFetch(`/reporting?year=${year}`);
    renderSummary();
    const ev = allEvents.find(e => e.id === eventId);
    if (!ev) return;
    const card = document.getElementById(`rp-card-${ev.id}`);
    if (!card) return;
    const pct = ev.total_members ? Math.round(ev.reported_count / ev.total_members * 100) : 0;
    const barColor = pct === 100 ? "bg-success" : pct >= 60 ? "bg-warning" : "bg-danger";
    const statsRow = card.querySelector(".d-flex.align-items-center.gap-3.mt-1");
    if (statsRow) {
        statsRow.innerHTML = `
            <span class="small text-muted">${ev.reported_count}/${ev.total_members} reported</span>
            ${pct === 100 ? `<span class="text-success small"><i class="bi bi-check-circle-fill me-1"></i>All in</span>` : ""}`;
    }
    const bar = card.querySelector(".progress-bar");
    if (bar) { bar.className = `progress-bar ${barColor}`; bar.style.width = `${pct}%`; }
    const footer = document.querySelector(`#rp-panel-body-${eventId} .small.text-muted`);
    if (footer) {
        footer.innerHTML = `${ev.reported_count} of ${ev.total_members} reported${ev.reporting_time ? ` &bull; Scheduled: <strong>${ev.reporting_time}</strong>` : ""}`;
    }
}
