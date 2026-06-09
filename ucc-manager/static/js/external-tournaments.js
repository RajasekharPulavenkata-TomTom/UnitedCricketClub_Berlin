import { apiFetch, showToast } from "/js/api.js";

let modal;
let tournaments = [];
let members = [];
let selectedId = null;

export async function init() {
    modal = new bootstrap.Modal(document.getElementById("extTournamentModal"));

    document.getElementById("btn-new-ext-tournament").addEventListener("click", () => openModal());
    document.getElementById("ext-tournament-form").addEventListener("submit", onSubmit);
    document.getElementById("btn-edit-ext-tournament").addEventListener("click", () => {
        const t = tournaments.find(t => t.id === selectedId);
        if (t) openModal(t);
    });
    document.getElementById("btn-close-ext-detail").addEventListener("click", closeDetail);
    document.getElementById("btn-delete-ext-tournament").addEventListener("click", onDelete);
    document.getElementById("btn-ext-add-player").addEventListener("click", onAddPlayer);
    document.getElementById("btn-save-result").addEventListener("click", onSaveResult);

    document.querySelectorAll(".ext-status-btn").forEach(btn => {
        btn.addEventListener("click", () => onSetStatus(btn.dataset.status));
    });

    await loadAll();
}

// ── Data ──────────────────────────────────────────────────────────────────────

async function loadAll() {
    [tournaments, members] = await Promise.all([
        apiFetch("/ext-tournaments"),
        apiFetch("/members"),
    ]);
    renderList();
    if (selectedId) {
        const t = tournaments.find(t => t.id === selectedId);
        if (t) showDetail(t); else closeDetail();
    }
}

async function refreshTournament(id) {
    const updated = await apiFetch(`/ext-tournaments/${id}`);
    const idx = tournaments.findIndex(t => t.id === id);
    if (idx >= 0) tournaments[idx] = updated; else tournaments.unshift(updated);
    renderList();
    showDetail(updated);
}

// ── Rendering ─────────────────────────────────────────────────────────────────

const STATUS_BADGE = {
    upcoming:  "bg-secondary",
    ongoing:   "bg-warning text-dark",
    completed: "bg-success",
};

function _fmtDate(d) {
    return d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB") : "—";
}

function renderList() {
    const tbody = document.getElementById("ext-tournament-tbody");
    if (!tournaments.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-muted text-center py-3">No external tournaments yet. Create one to get started.</td></tr>`;
        return;
    }
    tbody.innerHTML = tournaments.map(t => {
        const dates = t.end_date
            ? `${_fmtDate(t.start_date)} – ${_fmtDate(t.end_date)}`
            : _fmtDate(t.start_date);
        const paidCount = t.players.filter(p => p.paid).length;
        const badge = `<span class="badge ${STATUS_BADGE[t.status] || "bg-secondary"}">${t.status}</span>`;
        return `
        <tr style="cursor:pointer" onclick="window._viewExtTournament(${t.id})">
          <td class="fw-semibold">${t.name}</td>
          <td class="text-muted small text-nowrap">${dates}</td>
          <td>${t.format || "—"}</td>
          <td class="text-muted small">${t.venue || "—"}</td>
          <td>${t.players.length ? `${paidCount}/${t.players.length}` : "—"}</td>
          <td>${badge}</td>
          <td>${t.result ? `<span class="text-success fw-semibold">${t.result}</span>` : `<span class="text-muted">—</span>`}</td>
        </tr>`;
    }).join("");
}

function showDetail(t) {
    selectedId = t.id;
    const panel = document.getElementById("ext-tournament-detail");
    panel.style.display = "";
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });

    document.getElementById("ext-detail-title").textContent = t.name;

    // Meta row
    const meta = [
        t.organiser  ? `<div class="col-auto"><span class="text-muted small">Organiser</span><br><strong>${t.organiser}</strong></div>` : "",
        t.format     ? `<div class="col-auto"><span class="text-muted small">Format</span><br><strong>${t.format}</strong></div>` : "",
        t.venue      ? `<div class="col-auto"><span class="text-muted small">Venue</span><br><strong>${t.venue}</strong></div>` : "",
        `<div class="col-auto"><span class="text-muted small">Dates</span><br><strong>${t.end_date ? _fmtDate(t.start_date) + " – " + _fmtDate(t.end_date) : _fmtDate(t.start_date)}</strong></div>`,
        t.registration_deadline ? `<div class="col-auto"><span class="text-muted small">Reg. Deadline</span><br><strong>${_fmtDate(t.registration_deadline)}</strong></div>` : "",
        t.registration_fee != null && t.registration_fee > 0
            ? `<div class="col-auto"><span class="text-muted small">Reg. Fee</span><br><strong>€${parseFloat(t.registration_fee).toFixed(2)}</strong></div>` : "",
        t.website_url ? `<div class="col-auto"><span class="text-muted small">Website</span><br><a href="${t.website_url}" target="_blank" rel="noopener">Link <i class="bi bi-box-arrow-up-right"></i></a></div>` : "",
        t.notes ? `<div class="col-12"><span class="text-muted small">Notes</span><br>${t.notes}</div>` : "",
    ].filter(Boolean).join("");
    document.getElementById("ext-detail-meta").innerHTML = meta || `<div class="col-12 text-muted">No additional details.</div>`;

    // Status buttons
    document.querySelectorAll(".ext-status-btn").forEach(btn => {
        const active = btn.dataset.status === t.status;
        btn.className = `btn btn-sm ext-status-btn ${active ? _statusBtnClass(t.status) : "btn-outline-secondary"}`;
    });

    // Result field (show when completed or has result)
    const resultRow = document.getElementById("ext-result-row");
    if (t.status === "completed" || t.result) {
        resultRow.style.display = "";
        document.getElementById("ext-result-input").value = t.result || "";
    } else {
        resultRow.style.display = "none";
    }

    // Players
    const addedIds = new Set(t.players.map(p => p.member_id));
    const sel = document.getElementById("ext-add-member-select");
    sel.innerHTML = '<option value="">— Select player —</option>' +
        members.filter(m => !addedIds.has(m.id)).map(m => `<option value="${m.id}">${m.name}</option>`).join("");

    const tbody = document.getElementById("ext-players-tbody");
    if (!t.players.length) {
        tbody.innerHTML = `<tr><td colspan="3" class="text-muted text-center py-3">No players added yet.</td></tr>`;
        document.getElementById("ext-paid-summary").textContent = "";
    } else {
        const paidCount = t.players.filter(p => p.paid).length;
        tbody.innerHTML = t.players
            .slice().sort((a, b) => a.member.name.localeCompare(b.member.name))
            .map(p => `
            <tr class="${p.paid ? "table-success" : ""}">
              <td>${p.member.name}</td>
              <td class="text-center">
                <button class="btn btn-sm ${p.paid ? "btn-success" : "btn-outline-secondary"}"
                  onclick="window._extTogglePaid(${p.id})" title="${p.paid ? "Mark unpaid" : "Mark paid"}">
                  <i class="bi ${p.paid ? "bi-check-circle-fill" : "bi-circle"}"></i>
                </button>
              </td>
              <td class="text-end">
                <button class="btn btn-sm btn-outline-danger" onclick="window._extRemovePlayer(${p.id})">
                  <i class="bi bi-trash"></i>
                </button>
              </td>
            </tr>`).join("");
        document.getElementById("ext-paid-summary").textContent =
            `${paidCount} of ${t.players.length} players paid`;
    }

    // Delete button — only when all paid (or no players)
    const delBtn = document.getElementById("btn-delete-ext-tournament");
    const allPaid = t.players.length === 0 || t.players.every(p => p.paid);
    delBtn.classList.toggle("d-none", !allPaid);
    delBtn.dataset.id = t.id;
}

function _statusBtnClass(status) {
    return { upcoming: "btn-secondary", ongoing: "btn-warning", completed: "btn-success" }[status] || "btn-secondary";
}

function closeDetail() {
    selectedId = null;
    document.getElementById("ext-tournament-detail").style.display = "none";
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

function openModal(t = null) {
    document.getElementById("ext-modal-title").textContent = t ? "Edit Tournament" : "New Tournament";
    const form = document.getElementById("ext-tournament-form");
    form.reset();
    if (t) {
        form.name.value            = t.name;
        form.organiser.value       = t.organiser ?? "";
        form.format.value          = t.format ?? "";
        form.venue.value           = t.venue ?? "";
        form.start_date.value      = t.start_date ?? "";
        form.end_date.value        = t.end_date ?? "";
        form.registration_deadline.value = t.registration_deadline ?? "";
        form.registration_fee.value = t.registration_fee ?? "";
        form.website_url.value     = t.website_url ?? "";
        form.notes.value           = t.notes ?? "";
    }
    document.getElementById("ext-save-btn").dataset.editId = t ? t.id : "";
    modal.show();
}

async function onSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const body = {
        name:                  form.name.value.trim(),
        organiser:             form.organiser.value.trim() || null,
        format:                form.format.value || null,
        venue:                 form.venue.value.trim() || null,
        start_date:            form.start_date.value,
        end_date:              form.end_date.value || null,
        registration_deadline: form.registration_deadline.value || null,
        registration_fee:      form.registration_fee.value ? parseFloat(form.registration_fee.value) : null,
        website_url:           form.website_url.value.trim() || null,
        notes:                 form.notes.value.trim() || null,
    };
    const editId = document.getElementById("ext-save-btn").dataset.editId;
    try {
        if (editId) {
            await apiFetch(`/ext-tournaments/${editId}`, { method: "PUT", body: JSON.stringify(body) });
            showToast("Tournament updated");
            modal.hide();
            await refreshTournament(parseInt(editId));
        } else {
            const created = await apiFetch("/ext-tournaments", { method: "POST", body: JSON.stringify(body) });
            selectedId = created.id;
            showToast("Tournament created");
            modal.hide();
            await loadAll();
        }
    } catch (err) {
        showToast(err.message, "error");
    }
}

async function onDelete() {
    const id = parseInt(document.getElementById("btn-delete-ext-tournament").dataset.id);
    if (!id || !confirm("Delete this tournament and all its data? This cannot be undone.")) return;
    try {
        await apiFetch(`/ext-tournaments/${id}`, { method: "DELETE" });
        closeDetail();
        showToast("Tournament deleted");
        await loadAll();
    } catch (err) {
        showToast(err.message, "error");
    }
}

async function onSetStatus(status) {
    if (!selectedId) return;
    try {
        await apiFetch(`/ext-tournaments/${selectedId}`, { method: "PUT", body: JSON.stringify({ status }) });
        await refreshTournament(selectedId);
    } catch (err) {
        showToast(err.message, "error");
    }
}

async function onSaveResult() {
    if (!selectedId) return;
    const result = document.getElementById("ext-result-input").value.trim() || null;
    try {
        await apiFetch(`/ext-tournaments/${selectedId}`, { method: "PUT", body: JSON.stringify({ result }) });
        showToast("Result saved");
        await refreshTournament(selectedId);
    } catch (err) {
        showToast(err.message, "error");
    }
}

// ── Player actions ────────────────────────────────────────────────────────────

async function onAddPlayer() {
    const member_id = parseInt(document.getElementById("ext-add-member-select").value);
    if (!member_id) { showToast("Select a player", "error"); return; }
    try {
        await apiFetch(`/ext-tournaments/${selectedId}/players`, {
            method: "POST",
            body: JSON.stringify({ member_id }),
        });
        await refreshTournament(selectedId);
    } catch (err) {
        showToast(err.message, "error");
    }
}

window._viewExtTournament = (id) => {
    const t = tournaments.find(t => t.id === id);
    if (t) showDetail(t);
};

window._extTogglePaid = async (pid) => {
    try {
        await apiFetch(`/ext-tournaments/${selectedId}/players/${pid}/paid`, { method: "PATCH" });
        await refreshTournament(selectedId);
    } catch (err) {
        showToast(err.message, "error");
    }
};

window._extRemovePlayer = async (pid) => {
    if (!confirm("Remove this player from the tournament?")) return;
    try {
        await apiFetch(`/ext-tournaments/${selectedId}/players/${pid}`, { method: "DELETE" });
        await refreshTournament(selectedId);
    } catch (err) {
        showToast(err.message, "error");
    }
};
