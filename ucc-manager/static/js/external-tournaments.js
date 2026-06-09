import { apiFetch, showToast, fmt } from "/js/api.js";

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
    document.getElementById("btn-ext-copy-summary").addEventListener("click", copySummary);

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

function _allPaid(t) {
    return t.players.length === 0 || t.players.every(p => p.paid);
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
        const fee = t.registration_fee ? fmt.currency(t.registration_fee) : "—";
        return `
        <tr style="cursor:pointer" onclick="window._viewExtTournament(${t.id})">
          <td class="fw-semibold">${t.name}</td>
          <td class="text-muted small text-nowrap">${dates}</td>
          <td>${t.format || "—"}</td>
          <td>${fee}</td>
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
        t.organiser ? `<div class="col-auto"><span class="text-muted small">Organiser</span><br><strong>${t.organiser}</strong></div>` : "",
        t.format    ? `<div class="col-auto"><span class="text-muted small">Format</span><br><strong>${t.format}</strong></div>` : "",
        t.venue     ? `<div class="col-auto"><span class="text-muted small">Venue</span><br><strong>${t.venue}</strong></div>` : "",
        `<div class="col-auto"><span class="text-muted small">Dates</span><br><strong>${t.end_date ? _fmtDate(t.start_date) + " – " + _fmtDate(t.end_date) : _fmtDate(t.start_date)}</strong></div>`,
        t.registration_deadline ? `<div class="col-auto"><span class="text-muted small">Reg. Deadline</span><br><strong>${_fmtDate(t.registration_deadline)}</strong></div>` : "",
        t.website_url ? `<div class="col-auto"><span class="text-muted small">Website</span><br><a href="${t.website_url}" target="_blank" rel="noopener">Link <i class="bi bi-box-arrow-up-right"></i></a></div>` : "",
        t.notes ? `<div class="col-12"><span class="text-muted small">Notes</span><br>${t.notes}</div>` : "",
    ].filter(Boolean).join("");
    document.getElementById("ext-detail-meta").innerHTML = meta || `<div class="col-12 text-muted">No additional details.</div>`;

    // Status buttons
    document.querySelectorAll(".ext-status-btn").forEach(btn => {
        const active = btn.dataset.status === t.status;
        btn.className = `btn btn-sm ext-status-btn ${active ? _statusBtnClass(t.status) : "btn-outline-secondary"}`;
    });

    // Result field
    const resultRow = document.getElementById("ext-result-row");
    if (t.status === "completed" || t.result) {
        resultRow.style.display = "";
        document.getElementById("ext-result-input").value = t.result || "";
    } else {
        resultRow.style.display = "none";
    }

    // Available members for add dropdown
    const addedIds = new Set(t.players.map(p => p.member_id));
    const sel = document.getElementById("ext-add-member-select");
    sel.innerHTML = '<option value="">— Select player —</option>' +
        members.filter(m => !addedIds.has(m.id)).map(m => `<option value="${m.id}">${m.name}</option>`).join("");

    // Players table
    const tbody = document.getElementById("ext-players-tbody");
    const tfoot = document.getElementById("ext-players-tfoot");

    if (!t.players.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-muted text-center py-3">No players added yet.</td></tr>`;
        tfoot.style.display = "none";
    } else {
        const totalFee = parseFloat(t.registration_fee || 0);
        const totalMatches = t.players.reduce((s, p) => s + p.matches_played, 0);
        const feePerMatch = totalMatches ? totalFee / totalMatches : 0;
        const paidCount = t.players.filter(p => p.paid).length;

        tbody.innerHTML = t.players.map(p => `
          <tr class="align-middle ${p.paid ? "table-success" : ""}">
            <td>${p.member.name}</td>
            <td class="text-center">
              <input type="number" min="1" value="${p.matches_played}"
                class="form-control form-control-sm d-inline-block text-center matches-inline"
                style="width:65px;border:1px solid transparent;background:transparent"
                onfocus="this.style.borderColor='#dee2e6'"
                onblur="this.style.borderColor='transparent'; window._extInlineEditMatches(${p.id}, this)"
                onkeydown="if(event.key==='Enter'){this.blur()}" />
            </td>
            <td class="text-end fw-semibold">${fmt.currency(p.fee_share ?? 0)}</td>
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

        document.getElementById("ext-total-matches").textContent = totalMatches;
        document.getElementById("ext-total-fee-display").textContent = fmt.currency(totalFee);
        document.getElementById("ext-paid-summary").textContent = `${paidCount}/${t.players.length}`;
        document.getElementById("ext-fee-per-match-label").textContent =
            totalMatches
                ? `€${feePerMatch.toFixed(2)} per match (${fmt.currency(totalFee)} ÷ ${totalMatches} matches)`
                : "Enter a Total Fee in Edit to calculate shares";
        tfoot.style.display = "";
    }

    // Delete button
    const delBtn = document.getElementById("btn-delete-ext-tournament");
    delBtn.classList.toggle("d-none", !_allPaid(t));
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
        form.name.value                  = t.name;
        form.organiser.value             = t.organiser ?? "";
        form.format.value                = t.format ?? "";
        form.venue.value                 = t.venue ?? "";
        form.start_date.value            = t.start_date ?? "";
        form.end_date.value              = t.end_date ?? "";
        form.registration_deadline.value = t.registration_deadline ?? "";
        form.registration_fee.value      = t.registration_fee ?? "";
        form.website_url.value           = t.website_url ?? "";
        form.notes.value                 = t.notes ?? "";
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
    const member_id     = parseInt(document.getElementById("ext-add-member-select").value);
    const matches_played = parseInt(document.getElementById("ext-add-matches-input").value);
    if (!member_id || !matches_played || matches_played < 1) {
        showToast("Select a player and enter matches played", "error");
        return;
    }
    try {
        await apiFetch(`/ext-tournaments/${selectedId}/players`, {
            method: "POST",
            body: JSON.stringify({ member_id, matches_played }),
        });
        document.getElementById("ext-add-matches-input").value = "1";
        await refreshTournament(selectedId);
    } catch (err) {
        showToast(err.message, "error");
    }
}

window._viewExtTournament = (id) => {
    const t = tournaments.find(t => t.id === id);
    if (t) showDetail(t);
};

window._extInlineEditMatches = async (pid, input) => {
    const matches_played = parseInt(input.value);
    const t = tournaments.find(t => t.id === selectedId);
    const p = t?.players.find(p => p.id === pid);
    if (!matches_played || matches_played < 1 || matches_played === p?.matches_played) return;
    try {
        await apiFetch(`/ext-tournaments/${selectedId}/players/${pid}`, {
            method: "PUT",
            body: JSON.stringify({ matches_played }),
        });
        await refreshTournament(selectedId);
    } catch (err) {
        showToast(err.message, "error");
        if (p) input.value = p.matches_played;
    }
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

// ── Copy summary ──────────────────────────────────────────────────────────────

function copySummary() {
    const t = tournaments.find(t => t.id === selectedId);
    if (!t) return;

    const totalFee = parseFloat(t.registration_fee || 0);
    const totalMatches = t.players.reduce((s, p) => s + p.matches_played, 0);
    const feePerMatch = totalMatches ? totalFee / totalMatches : 0;
    const dateStr = t.end_date
        ? `${_fmtDate(t.start_date)} – ${_fmtDate(t.end_date)}`
        : _fmtDate(t.start_date);

    const header   = `🌍 ${t.name}${dateStr !== "—" ? " – " + dateStr : ""}`;
    const subheader = `Total Fee: ${fmt.currency(totalFee)}  |  ${fmt.currency(feePerMatch)} per match`;
    const divider  = "─".repeat(45);

    const rows = t.players
        .slice()
        .sort((a, b) => a.member.name.localeCompare(b.member.name))
        .map(p => {
            const name    = p.member.name.padEnd(20);
            const matches = String(p.matches_played).padStart(3);
            const fee     = fmt.currency(p.fee_share ?? 0).padStart(8);
            const status  = p.paid ? "✓ Paid" : "✗ Unpaid";
            return `${name}  ${matches} match  ${fee}  ${status}`;
        });

    const paidCount = t.players.filter(p => p.paid).length;
    const footer = `\n${paidCount}/${t.players.length} players paid`;

    const text = [header, subheader, divider, ...rows, divider, footer].join("\n");
    navigator.clipboard.writeText(text)
        .then(() => showToast("Summary copied to clipboard"))
        .catch(() => showToast("Could not copy to clipboard", "error"));
}
