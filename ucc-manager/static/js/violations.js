import { apiFetch, showToast, escHtml } from "/js/api.js";

let items = [];
let isAdmin = false;
let currentMemberId = null;
let allMembers = null;
let _fm = "", _fr = "", _fs = "";

const RULE_META = {
    MISCONDUCT:    { label: "Misconduct",    cls: "bg-danger",            icon: "bi-emoji-angry"      },
    PUNCTUALITY:   { label: "Punctuality",   cls: "bg-warning text-dark", icon: "bi-clock-fill"       },
    EQUIPMENT:     { label: "Equipment",     cls: "bg-primary",           icon: "bi-bag"              },
    FINANCIAL:     { label: "Financial",     cls: "bg-info text-dark",    icon: "bi-cash-coin"        },
    COMMUNICATION: { label: "Communication", cls: "bg-secondary",         icon: "bi-chat-dots-fill"   },
    OTHER:         { label: "Other",         cls: "bg-dark",              icon: "bi-exclamation-lg"   },
};

export async function init() {
    const me = await apiFetch("/auth/me").catch(() => null);
    isAdmin = me?.role === "admin" || me?.role === "root";
    currentMemberId = me?.member_id ?? null;

    if (isAdmin) {
        document.getElementById("v-page-title").innerHTML =
            `<i class="bi bi-shield-exclamation me-2"></i>Rule Violations`;
        document.getElementById("btn-log-violation").classList.remove("d-none");
        document.getElementById("v-admin-stats").classList.remove("d-none");
        document.getElementById("v-filters").classList.remove("d-none");
    } else {
        document.getElementById("v-page-title").innerHTML =
            `<i class="bi bi-shield-exclamation me-2"></i>My Disciplinary Record`;
    }

    setupFilters();
    setupLogModal();
    await load();
}

async function load() {
    try {
        items = await apiFetch("/violations");
    } catch (e) {
        document.getElementById("v-container").innerHTML =
            `<div class="alert alert-danger">${escHtml(e.message)}</div>`;
        return;
    }

    if (!isAdmin && !currentMemberId) {
        document.getElementById("v-no-member").classList.remove("d-none");
        document.getElementById("v-container").innerHTML = "";
        return;
    }

    if (isAdmin) {
        renderAdminStats();
        populateMemberFilter();
    } else {
        renderMemberSummary();
    }
    renderList();
}

// ── Stats / summary ────────────────────────────────────────────────────────────

function renderAdminStats() {
    const total    = items.length;
    const pending  = items.filter(v => !v.acknowledged_at).length;
    const affected = new Set(items.map(v => v.member_id)).size;
    document.getElementById("v-admin-stats").innerHTML = `
        <span class="badge bg-secondary fs-6 fw-normal">${total} violation${total !== 1 ? "s" : ""}</span>
        ${pending  ? `<span class="badge bg-danger  fs-6 fw-normal">${pending} pending acknowledgement</span>` : ""}
        ${affected ? `<span class="badge bg-primary fs-6 fw-normal">${affected} member${affected !== 1 ? "s" : ""} affected</span>` : ""}`;
}

function renderMemberSummary() {
    const el = document.getElementById("v-member-summary");
    const strikes = items.length;
    if (!strikes) { el.innerHTML = ""; return; }
    const pending = items.filter(v => !v.acknowledged_at).length;
    const cls  = strikes >= 3 ? "alert-danger" : "alert-warning";
    const icon = strikes >= 3 ? "bi-exclamation-triangle-fill" : "bi-exclamation-circle-fill";
    el.innerHTML = `
        <div class="alert ${cls} d-flex align-items-center gap-2 mb-3">
            <i class="bi ${icon} fs-5 flex-shrink-0"></i>
            <div>
                <strong>${strikes} strike${strikes !== 1 ? "s" : ""} on your record</strong>
                ${pending ? `&nbsp;·&nbsp;${pending} pending your acknowledgement` : ""}
            </div>
        </div>`;
}

// ── Filters ────────────────────────────────────────────────────────────────────

function setupFilters() {
    document.getElementById("v-filter-member")?.addEventListener("change", e => { _fm = e.target.value; renderList(); });
    document.getElementById("v-filter-rule")?.addEventListener("change", e => { _fr = e.target.value; renderList(); });
    document.getElementById("v-filter-status")?.addEventListener("change", e => { _fs = e.target.value; renderList(); });
}

function populateMemberFilter() {
    const sel = document.getElementById("v-filter-member");
    const memberMap = new Map(items.map(v => [v.member_id, v.member_name]));
    sel.innerHTML = `<option value="">All members</option>` +
        [...memberMap.entries()]
            .sort(([, a], [, b]) => a.localeCompare(b))
            .map(([id, name]) => `<option value="${id}">${escHtml(name)}</option>`)
            .join("");
    sel.value = _fm;
}

function _visible() {
    return items.filter(v => {
        if (_fm && String(v.member_id) !== _fm) return false;
        if (_fr && v.rule_ref !== _fr) return false;
        if (_fs === "pending"      && v.acknowledged_at) return false;
        if (_fs === "acknowledged" && !v.acknowledged_at) return false;
        return true;
    });
}

// ── Render ─────────────────────────────────────────────────────────────────────

function renderList() {
    const filtered = _visible();
    const c = document.getElementById("v-container");
    if (!filtered.length) {
        const hasFilter = _fm || _fr || _fs;
        c.innerHTML = `
            <div class="card"><div class="card-body text-center text-muted py-5">
              <i class="bi bi-shield-check" style="font-size:2.5rem"></i>
              <div class="mt-2">${isAdmin
                ? (hasFilter ? "No violations matching this filter." : "No violations logged yet.")
                : "No violations on your record."}</div>
            </div></div>`;
        return;
    }
    c.innerHTML = filtered.map(v => isAdmin ? adminCard(v) : memberCard(v)).join("");
}

function strikeBadge(n) {
    const cls  = n >= 3 ? "bg-danger" : "bg-warning text-dark";
    const icon = n >= 3 ? "bi-exclamation-triangle-fill" : "bi-exclamation-circle-fill";
    return `<span class="badge ${cls}"><i class="bi ${icon} me-1"></i>${n} strike${n !== 1 ? "s" : ""}</span>`;
}

function ruleBadge(ref) {
    const m = RULE_META[ref] || { label: ref, cls: "bg-secondary", icon: "bi-circle" };
    return `<span class="badge ${m.cls}"><i class="bi ${m.icon} me-1"></i>${m.label}</span>`;
}

function _age(iso) {
    if (!iso) return "—";
    const d = Math.floor((Date.now() - new Date(iso)) / 86400000);
    if (d === 0) return "today";
    if (d === 1) return "yesterday";
    if (d < 7)  return `${d}d ago`;
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function adminCard(v) {
    const ackHtml = v.acknowledged_at
        ? `<span class="text-success small"><i class="bi bi-check-circle-fill me-1"></i>Acknowledged ${_age(v.acknowledged_at)}</span>`
        : `<span class="text-warning small"><i class="bi bi-hourglass-split me-1"></i>Pending acknowledgement</span>`;
    return `
    <div class="card violation-card mb-3" id="v-card-${v.id}">
      <div class="card-body">
        <div class="d-flex align-items-start gap-2 flex-wrap">
          <div class="flex-grow-1 min-width-0">
            <div class="d-flex flex-wrap gap-2 align-items-center mb-1">
              <span class="fw-semibold">${escHtml(v.member_name)}</span>
              ${strikeBadge(v.member_strikes)}
              ${ruleBadge(v.rule_ref)}
              <span class="text-muted small ms-auto">${_age(v.created_at)}</span>
            </div>
            ${v.description ? `<p class="text-muted small mb-1">${escHtml(v.description)}</p>` : ""}
            <div class="text-muted small d-flex flex-wrap gap-3 mt-1">
              ${v.logged_by ? `<span><i class="bi bi-person me-1"></i>Logged by ${escHtml(v.logged_by)}</span>` : ""}
              ${ackHtml}
            </div>
          </div>
          <div class="d-flex gap-1 flex-shrink-0 no-print">
            <button class="btn btn-sm btn-outline-danger" onclick="window._vDelete(${v.id})" title="Delete">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </div>
      </div>
    </div>`;
}

function memberCard(v) {
    const ackHtml = v.acknowledged_at
        ? `<span class="text-success small"><i class="bi bi-check-circle-fill me-1"></i>Acknowledged ${_age(v.acknowledged_at)}</span>`
        : `<button class="btn btn-sm btn-outline-success no-print" onclick="window._vAcknowledge(${v.id})">
             <i class="bi bi-check2 me-1"></i>Acknowledge
           </button>`;
    return `
    <div class="card violation-card mb-3" id="v-card-${v.id}">
      <div class="card-body">
        <div class="d-flex flex-wrap gap-2 align-items-center mb-1">
          ${ruleBadge(v.rule_ref)}
          <span class="text-muted small ms-auto">${_age(v.created_at)}</span>
        </div>
        ${v.description ? `<p class="text-muted small mb-1">${escHtml(v.description)}</p>` : ""}
        <div class="d-flex flex-wrap gap-3 align-items-center mt-2">
          ${v.logged_by ? `<span class="text-muted small"><i class="bi bi-person me-1"></i>Logged by ${escHtml(v.logged_by)}</span>` : ""}
          ${ackHtml}
        </div>
      </div>
    </div>`;
}

// ── Log Violation (admin) ──────────────────────────────────────────────────────

function setupLogModal() {
    document.getElementById("logViolationModal")?.addEventListener("show.bs.modal", async () => {
        document.getElementById("v-log-form").reset();
        document.getElementById("log-violation-error").classList.add("d-none");
        if (allMembers !== null) return;
        try {
            const ms = await apiFetch("/members?active_only=true");
            allMembers = ms.sort((a, b) => (a.jersey_name || a.name).localeCompare(b.jersey_name || b.name));
        } catch { allMembers = []; }
        const sel = document.getElementById("v-log-member");
        sel.innerHTML = `<option value="">— Select member —</option>` +
            allMembers.map(m => `<option value="${m.id}">${escHtml(m.jersey_name || m.name)}</option>`).join("");
    });
}

window._vLog = async () => {
    const member_id  = parseInt(document.getElementById("v-log-member").value);
    const rule_ref   = document.getElementById("v-log-rule").value;
    const description = (document.getElementById("v-log-description").value || "").trim() || null;
    const errEl = document.getElementById("log-violation-error");
    errEl.classList.add("d-none");
    if (!member_id) { errEl.textContent = "Please select a member."; errEl.classList.remove("d-none"); return; }
    if (!rule_ref)  { errEl.textContent = "Please select a rule.";   errEl.classList.remove("d-none"); return; }
    try {
        const created = await apiFetch("/violations", {
            method: "POST",
            body: JSON.stringify({ member_id, rule_ref, description }),
        });
        items.unshift(created);
        bootstrap.Modal.getInstance(document.getElementById("logViolationModal"))?.hide();
        renderAdminStats();
        populateMemberFilter();
        renderList();
        showToast("Violation logged");
    } catch (e) {
        errEl.textContent = e.message;
        errEl.classList.remove("d-none");
    }
};

// ── Acknowledge ────────────────────────────────────────────────────────────────

window._vAcknowledge = async (id) => {
    try {
        const updated = await apiFetch(`/violations/${id}/acknowledge`, { method: "POST" });
        const idx = items.findIndex(v => v.id === id);
        if (idx !== -1) items[idx] = updated;
        renderMemberSummary();
        renderList();
        showToast("Violation acknowledged");
    } catch (e) { showToast(e.message, "error"); }
};

// ── Delete ─────────────────────────────────────────────────────────────────────

window._vDelete = async (id) => {
    if (!confirm("Delete this violation permanently?")) return;
    try {
        await apiFetch(`/violations/${id}`, { method: "DELETE" });
        items = items.filter(v => v.id !== id);
        document.getElementById(`v-card-${id}`)?.remove();
        renderAdminStats();
        populateMemberFilter();
        if (!_visible().length) renderList();
        showToast("Violation deleted");
    } catch (e) { showToast(e.message, "error"); }
};
