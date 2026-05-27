import { apiFetch, showToast } from "/js/api.js";

let allEvents = [];
let openEventId = null;

export async function init() {
    const yearSel = document.getElementById("mf-year");
    for (let y = 2026; y <= 2030; y++) {
        yearSel.innerHTML += `<option value="${y}" ${y === 2026 ? "selected" : ""}>${y}</option>`;
    }
    yearSel.addEventListener("change", load);
    await load();
}

async function load() {
    const year = document.getElementById("mf-year").value;
    try {
        allEvents = await apiFetch(`/match-fees?year=${year}`);
    } catch (e) {
        document.getElementById("mf-cards").innerHTML =
            `<div class="alert alert-danger">${e.message}</div>`;
        return;
    }
    renderSummary();
    renderCards();
    if (openEventId !== null) {
        const panel = document.getElementById(`mf-payments-${openEventId}`);
        if (panel) openPayments(openEventId);
    }
}

function renderSummary() {
    const withFee = allEvents.filter(e => e.fee !== null);
    const collected = withFee.reduce((s, e) => s + e.collected, 0);
    const outstanding = withFee.reduce((s, e) => s + e.outstanding, 0);
    document.getElementById("mf-summary").innerHTML = `
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
              <div class="fs-3 fw-bold text-success">€${collected.toFixed(2)}</div>
              <div class="small text-muted">Collected</div>
            </div>
          </div>
        </div>
        <div class="col-auto">
          <div class="card border-danger text-center" style="min-width:130px">
            <div class="card-body py-2 px-3">
              <div class="fs-3 fw-bold text-danger">€${outstanding.toFixed(2)}</div>
              <div class="small text-muted">Outstanding</div>
            </div>
          </div>
        </div>`;
}

function renderCards() {
    const container = document.getElementById("mf-cards");
    if (!allEvents.length) {
        container.innerHTML = `<div class="card"><div class="card-body text-center text-muted py-5">No match events found for this season.</div></div>`;
        return;
    }
    container.innerHTML = allEvents.map(ev => {
        const [y, m, d] = ev.date.split("-").map(Number);
        const dateStr = new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
        const pct = ev.fee && ev.total_members ? Math.round(ev.paid_count / ev.total_members * 100) : 0;
        const barColor = pct === 100 ? "bg-success" : pct >= 60 ? "bg-warning" : "bg-danger";
        const feeStr = ev.fee !== null ? `€${Number(ev.fee).toFixed(2)}` : null;

        return `
        <div class="card mb-3" id="mf-card-${ev.id}">
          <div class="card-body">
            <div class="d-flex align-items-start justify-content-between gap-3">
              <div class="flex-grow-1 min-width-0">
                <div class="d-flex align-items-center flex-wrap gap-2 mb-1">
                  <span class="badge bg-secondary">${dateStr}</span>
                  <span class="fw-semibold">${ev.title}</span>
                  ${ev.location ? `<span class="text-muted small">${ev.location}</span>` : ""}
                  ${ev.total_members > 0
                    ? `<span class="badge bg-success"><i class="bi bi-people-fill me-1"></i>XI set (${ev.total_members})</span>`
                    : `<span class="badge bg-warning text-dark"><i class="bi bi-exclamation-triangle me-1"></i>No XI set</span>`}
                </div>
                ${feeStr ? `
                <div class="d-flex align-items-center flex-wrap gap-3 mt-1">
                  <span class="badge bg-primary">${feeStr}/player</span>
                  <span class="text-success small fw-semibold">€${ev.collected.toFixed(2)} collected</span>
                  ${ev.outstanding > 0
                    ? `<span class="text-danger small">€${ev.outstanding.toFixed(2)} outstanding</span>`
                    : `<span class="text-success small"><i class="bi bi-check-circle-fill me-1"></i>All paid</span>`}
                  <span class="text-muted small">${ev.paid_count}/${ev.total_members} paid</span>
                </div>
                <div class="progress mt-2" style="height:5px;max-width:280px">
                  <div class="progress-bar ${barColor}" style="width:${pct}%"></div>
                </div>` : `<span class="text-muted small fst-italic">No fee set</span>`}
              </div>
              <div class="d-flex gap-2 flex-shrink-0 no-print">
                <button class="btn btn-sm btn-outline-secondary"
                    onclick="window._mfEditFee(${ev.id})">
                  <i class="bi bi-${feeStr ? "pencil" : "plus-lg"} me-1"></i>${feeStr ? "Edit Fee" : "Set Fee"}
                </button>
                ${feeStr ? `
                <button class="btn btn-sm btn-outline-primary"
                    onclick="window._mfTogglePayments(${ev.id})">
                  <i class="bi bi-people me-1"></i>Payments
                </button>` : ""}
              </div>
            </div>
          </div>
          <div id="mf-payments-${ev.id}" style="display:none;border-top:1px solid #dee2e6">
            <div class="card-body py-3" id="mf-payments-body-${ev.id}"></div>
          </div>
        </div>`;
    }).join("");
}

async function openPayments(eventId) {
    const panel = document.getElementById(`mf-payments-${eventId}`);
    const body = document.getElementById(`mf-payments-body-${eventId}`);
    if (!panel) return;
    panel.style.display = "";
    body.innerHTML = `<div class="text-center py-2"><div class="spinner-border spinner-border-sm"></div></div>`;
    const payments = await apiFetch(`/match-fees/${eventId}/payments`);
    renderPayments(eventId, payments);
}

function renderPayments(eventId, payments) {
    const body = document.getElementById(`mf-payments-body-${eventId}`);
    if (!payments.length) {
        body.innerHTML = `<p class="text-muted small mb-0">
            <i class="bi bi-info-circle me-1"></i>No Playing XI set for this match.
            Select a Playing XI from the Calendar first.</p>`;
        return;
    }
    const paidCount = payments.filter(p => p.paid).length;
    body.innerHTML = `
        <div class="d-flex flex-wrap gap-2 mb-2">
          ${payments.map(p => `
            <button type="button"
                class="btn btn-sm ${p.paid ? "btn-success" : "btn-outline-secondary"} mf-pay-btn"
                onclick="window._mfTogglePay(${eventId}, ${p.member_id}, this)">
              <i class="bi ${p.paid ? "bi-check-circle-fill" : "bi-circle"} me-1"></i>${p.name}
            </button>`).join("")}
        </div>
        <div class="small text-muted">${paidCount} of ${payments.length} paid</div>`;
}

window._mfEditFee = async (eventId) => {
    const ev = allEvents.find(e => e.id === eventId);
    const current = ev?.fee != null ? Number(ev.fee).toFixed(2) : "";
    const val = prompt("Fee per player (€):", current);
    if (val === null) return;
    const amount = parseFloat(val);
    if (isNaN(amount) || amount < 0) { showToast("Invalid amount", "error"); return; }
    try {
        await apiFetch(`/match-fees/${eventId}/fee`, { method: "PUT", body: JSON.stringify({ amount }) });
        showToast("Fee saved");
        openEventId = eventId;
        await load();
    } catch (e) {
        showToast(e.message, "error");
    }
};

window._mfTogglePayments = async (eventId) => {
    const panel = document.getElementById(`mf-payments-${eventId}`);
    if (panel.style.display !== "none") {
        panel.style.display = "none";
        openEventId = null;
        return;
    }
    openEventId = eventId;
    await openPayments(eventId);
};

window._mfTogglePay = async (eventId, memberId, btn) => {
    btn.disabled = true;
    try {
        const res = await apiFetch(`/match-fees/${eventId}/payments/${memberId}`, { method: "PATCH" });
        btn.className = `btn btn-sm ${res.paid ? "btn-success" : "btn-outline-secondary"} mf-pay-btn`;
        btn.querySelector("i").className = `bi ${res.paid ? "bi-check-circle-fill" : "bi-circle"} me-1`;
        // Refresh summary and card stats without closing the panel
        const year = document.getElementById("mf-year").value;
        allEvents = await apiFetch(`/match-fees?year=${year}`);
        renderSummary();
        const ev = allEvents.find(e => e.id === eventId);
        if (ev) updateCardStats(ev);
    } catch (e) {
        showToast(e.message, "error");
    } finally {
        btn.disabled = false;
    }
};

function updateCardStats(ev) {
    const card = document.getElementById(`mf-card-${ev.id}`);
    if (!card) return;
    const pct = ev.fee && ev.total_members ? Math.round(ev.paid_count / ev.total_members * 100) : 0;
    const barColor = pct === 100 ? "bg-success" : pct >= 60 ? "bg-warning" : "bg-danger";
    const statsRow = card.querySelector(".d-flex.align-items-center.flex-wrap.gap-3.mt-1");
    if (statsRow) {
        statsRow.innerHTML = `
            <span class="badge bg-primary">€${Number(ev.fee).toFixed(2)}/player</span>
            <span class="text-success small fw-semibold">€${ev.collected.toFixed(2)} collected</span>
            ${ev.outstanding > 0
              ? `<span class="text-danger small">€${ev.outstanding.toFixed(2)} outstanding</span>`
              : `<span class="text-success small"><i class="bi bi-check-circle-fill me-1"></i>All paid</span>`}
            <span class="text-muted small">${ev.paid_count}/${ev.total_members} paid</span>`;
    }
    const bar = card.querySelector(".progress-bar");
    if (bar) {
        bar.className = `progress-bar ${barColor}`;
        bar.style.width = `${pct}%`;
    }
    // Update paid count in the payments footer
    const body = document.getElementById(`mf-payments-body-${ev.id}`);
    if (body) {
        const footer = body.querySelector(".small.text-muted");
        if (footer) footer.textContent = `${ev.paid_count} of ${ev.total_members} paid`;
    }
}
