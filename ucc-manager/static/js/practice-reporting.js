import { apiFetch, showToast } from "/js/api.js";

let allEvents = [];
let openEventId = null;

export async function init() {
    const yearSel = document.getElementById("pr-year");
    for (let y = 2026; y <= 2030; y++) {
        yearSel.innerHTML += `<option value="${y}" ${y === 2026 ? "selected" : ""}>${y}</option>`;
    }
    yearSel.addEventListener("change", load);
    await load();
}

async function load() {
    const year = document.getElementById("pr-year").value;
    try {
        allEvents = await apiFetch(`/reporting?year=${year}&event_type=training`);
    } catch (e) {
        document.getElementById("pr-cards").innerHTML =
            `<div class="alert alert-danger">${e.message}</div>`;
        return;
    }
    renderSummary();
    renderCards();
    if (openEventId !== null) {
        const panel = document.getElementById(`pr-panel-${openEventId}`);
        if (panel) openPanel(openEventId);
    }
}

function renderSummary() {
    const withAvail     = allEvents.filter(e => e.total_members > 0);
    const totalRep      = withAvail.reduce((s, e) => s + e.reported_count, 0);
    const totalAbsent   = withAvail.reduce((s, e) => s + e.absent_count,   0);
    const totalExpected = withAvail.reduce((s, e) => s + e.total_members,  0);

    document.getElementById("pr-summary").innerHTML = `
        <div class="col-auto">
          <div class="card border-primary text-center" style="min-width:120px">
            <div class="card-body py-2 px-3">
              <div class="fs-3 fw-bold text-primary">${allEvents.length}</div>
              <div class="small text-muted">Sessions</div>
            </div>
          </div>
        </div>
        <div class="col-auto">
          <div class="card border-success text-center" style="min-width:130px">
            <div class="card-body py-2 px-3">
              <div class="fs-3 fw-bold text-success">${totalRep}<span class="fs-6 text-muted">/${totalExpected}</span></div>
              <div class="small text-muted">Attended</div>
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
    const container = document.getElementById("pr-cards");
    if (!allEvents.length) {
        container.innerHTML = `<div class="card"><div class="card-body text-center text-muted py-5">No practice sessions found for this season.</div></div>`;
        return;
    }
    container.innerHTML = allEvents.map(ev => {
        const [y, m, d] = ev.date.split("-").map(Number);
        const dateStr = new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
        const unknown  = ev.total_members - ev.reported_count - ev.absent_count;
        const pct      = ev.total_members ? Math.round(ev.reported_count / ev.total_members * 100) : 0;
        const barColor = pct === 100 ? "bg-success" : pct >= 60 ? "bg-warning" : "bg-danger";

        return `
        <div class="card mb-3" id="pr-card-${ev.id}">
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
                <div class="d-flex align-items-center flex-wrap gap-3 mt-1" id="pr-stats-${ev.id}">
                  <span class="text-success small fw-semibold"><i class="bi bi-check-circle-fill me-1"></i>${ev.reported_count} attended</span>
                  ${ev.absent_count > 0 ? `<span class="text-danger small fw-semibold"><i class="bi bi-x-circle-fill me-1"></i>${ev.absent_count} no show</span>` : ""}
                  ${unknown > 0 ? `<span class="text-muted small">${unknown} pending</span>` : ""}
                </div>
                <div class="progress mt-2" style="height:5px;max-width:280px">
                  <div class="progress-bar ${barColor}" id="pr-bar-${ev.id}" style="width:${pct}%"></div>
                </div>` : `<span class="text-muted small fst-italic">No players marked available for this session</span>`}
              </div>
              ${ev.total_members > 0 ? `
              <div class="flex-shrink-0 no-print">
                <button class="btn btn-sm btn-outline-primary" onclick="window._prTogglePanel(${ev.id})">
                  <i class="bi bi-people me-1"></i>Attendance
                </button>
              </div>` : ""}
            </div>
          </div>
          <div id="pr-panel-${ev.id}" style="display:none;border-top:1px solid #dee2e6">
            <div class="card-body py-3" id="pr-panel-body-${ev.id}"></div>
          </div>
        </div>`;
    }).join("");
}

async function openPanel(eventId) {
    const panel = document.getElementById(`pr-panel-${eventId}`);
    const body  = document.getElementById(`pr-panel-body-${eventId}`);
    if (!panel) return;
    panel.style.display = "";
    body.innerHTML = `<div class="text-center py-2"><div class="spinner-border spinner-border-sm"></div></div>`;
    const players = await apiFetch(`/reporting/${eventId}/players`);
    const ev = allEvents.find(e => e.id === eventId);
    renderPanel(eventId, players, ev?.reporting_time || null);
}

function statusBtn(eventId, memberId, current) {
    const states = {
        unknown:  { label: "Not Yet",  icon: "bi-circle",            cls: "btn-outline-secondary" },
        reported: { label: "Attended", icon: "bi-check-circle-fill",  cls: "btn-success"           },
        absent:   { label: "No Show",  icon: "bi-x-circle-fill",      cls: "btn-danger"            },
    };
    const s = states[current] || states.unknown;
    return `<button type="button"
        class="btn btn-sm ${s.cls} pr-status-btn flex-shrink-0"
        style="min-width:108px"
        data-event="${eventId}" data-member="${memberId}" data-status="${current}"
        onclick="window._prCycleStatus(this)">
      <i class="bi ${s.icon} me-1"></i>${s.label}
    </button>`;
}

function renderPanel(eventId, players, scheduledTime) {
    const body = document.getElementById(`pr-panel-body-${eventId}`);
    const ev = allEvents.find(e => e.id === eventId);
    const remarksSection = `
        <div class="mt-3 pt-3" style="border-top:1px solid #e9ecef">
          <label class="form-label small fw-semibold mb-1"><i class="bi bi-journal-text me-1"></i>Session Remarks</label>
          <textarea class="form-control form-control-sm" rows="2" placeholder="e.g. Focused on batting drills, great turnout..."
              id="pr-remarks-${eventId}"
              onblur="window._prSaveRemarks(${eventId}, this.value)">${ev?.remarks || ""}</textarea>
          <div class="text-muted small mt-1" id="pr-remarks-status-${eventId}"></div>
        </div>`;

    if (!players.length) {
        body.innerHTML = `<p class="text-muted small mb-2">
            <i class="bi bi-info-circle me-1"></i>No players have marked themselves available for this session yet.</p>
            ${remarksSection}`;
        return;
    }
    const attendedCount = players.filter(p => p.status === "reported").length;
    const absentCount   = players.filter(p => p.status === "absent").length;
    body.innerHTML = `
        <div class="small text-muted mb-3" id="pr-footer-${eventId}">
          ${attendedCount} attended &bull; ${absentCount} no show &bull; ${players.length - attendedCount - absentCount} pending
          ${scheduledTime ? ` &bull; Report by <strong>${scheduledTime}</strong>` : ""}
        </div>
        ${players.map(p => {
            const isLate = scheduledTime && p.reported_time && p.reported_time > scheduledTime;
            return `
            <div class="pr-row" id="pr-row-${eventId}-${p.member_id}">
              <span class="flex-grow-1 fw-medium small">${p.name}</span>
              ${isLate ? `<span class="badge bg-danger pr-late">Late</span>` : `<span class="pr-late" style="width:36px"></span>`}
              <input type="time" class="form-control form-control-sm" style="width:108px"
                     value="${p.reported_time || ""}"
                     title="Actual arrival time"
                     onchange="window._prSetTime(${eventId}, ${p.member_id}, this.value)" />
              ${statusBtn(eventId, p.member_id, p.status)}
            </div>`;
        }).join("")}
        ${remarksSection}`;
}

window._prTogglePanel = async (eventId) => {
    const panel = document.getElementById(`pr-panel-${eventId}`);
    if (panel.style.display !== "none") {
        panel.style.display = "none";
        openEventId = null;
        return;
    }
    openEventId = eventId;
    await openPanel(eventId);
};

const STATUS_CYCLE = { unknown: "reported", reported: "absent", absent: "unknown" };

window._prCycleStatus = async (btn) => {
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

window._prSaveRemarks = async (eventId, value) => {
    const status = document.getElementById(`pr-remarks-status-${eventId}`);
    try {
        await apiFetch(`/events/${eventId}`, {
            method: "PUT",
            body: JSON.stringify({ remarks: value }),
        });
        const ev = allEvents.find(e => e.id === eventId);
        if (ev) ev.remarks = value;
        if (status) { status.textContent = "Saved"; setTimeout(() => { if (status) status.textContent = ""; }, 2000); }
    } catch (e) {
        showToast(e.message, "error");
    }
};

window._prSetTime = async (eventId, memberId, value) => {
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
    const row = document.getElementById(`pr-row-${eventId}-${memberId}`);
    if (!row) return;
    const badge = row.querySelector(".pr-late");
    if (!badge) return;
    const isLate = scheduledTime && reportedTime && reportedTime > scheduledTime;
    badge.className = isLate ? "badge bg-danger pr-late" : "pr-late";
    badge.textContent = isLate ? "Late" : "";
    if (!isLate) badge.style.width = "36px";
}

async function refreshCardStats(eventId) {
    const year = document.getElementById("pr-year").value;
    allEvents = await apiFetch(`/reporting?year=${year}&event_type=training`);
    renderSummary();
    const ev = allEvents.find(e => e.id === eventId);
    if (!ev) return;

    const unknown  = ev.total_members - ev.reported_count - ev.absent_count;
    const pct      = ev.total_members ? Math.round(ev.reported_count / ev.total_members * 100) : 0;
    const barColor = pct === 100 ? "bg-success" : pct >= 60 ? "bg-warning" : "bg-danger";

    const stats = document.getElementById(`pr-stats-${ev.id}`);
    if (stats) {
        stats.innerHTML = `
            <span class="text-success small fw-semibold"><i class="bi bi-check-circle-fill me-1"></i>${ev.reported_count} attended</span>
            ${ev.absent_count > 0 ? `<span class="text-danger small fw-semibold"><i class="bi bi-x-circle-fill me-1"></i>${ev.absent_count} no show</span>` : ""}
            ${unknown > 0 ? `<span class="text-muted small">${unknown} pending</span>` : ""}`;
    }
    const bar = document.getElementById(`pr-bar-${ev.id}`);
    if (bar) { bar.className = `progress-bar ${barColor}`; bar.style.width = `${pct}%`; }

    const footer = document.getElementById(`pr-footer-${eventId}`);
    if (footer) {
        footer.innerHTML = `${ev.reported_count} attended &bull; ${ev.absent_count} no show &bull; ${unknown} pending${ev.reporting_time ? ` &bull; Report by <strong>${ev.reporting_time}</strong>` : ""}`;
    }
}
