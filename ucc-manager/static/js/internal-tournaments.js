import { apiFetch, showToast } from "/js/api.js";

let modal, addPlayerModal;
let tournaments = [];
let members = [];
let selectedId = null;
let addPlayerTeamId = null;

export async function init() {
    modal = new bootstrap.Modal(document.getElementById("intTournamentModal"));
    addPlayerModal = new bootstrap.Modal(document.getElementById("intAddPlayerModal"));

    document.getElementById("btn-new-int-tournament").addEventListener("click", () => openModal());
    document.getElementById("int-tournament-form").addEventListener("submit", onSubmit);
    document.getElementById("btn-edit-int-tournament").addEventListener("click", () => {
        const t = tournaments.find(t => t.id === selectedId);
        if (t) openModal(t);
    });
    document.getElementById("btn-close-int-detail").addEventListener("click", closeDetail);
    document.getElementById("btn-delete-int-tournament").addEventListener("click", onDelete);
    document.getElementById("btn-int-add-team").addEventListener("click", onAddTeam);
    document.getElementById("btn-save-champion").addEventListener("click", onSaveChampion);
    document.getElementById("btn-int-confirm-add-player").addEventListener("click", onConfirmAddPlayer);

    document.querySelectorAll(".int-status-btn").forEach(btn => {
        btn.addEventListener("click", () => onSetStatus(btn.dataset.status));
    });

    await loadAll();
}

// ── Data ──────────────────────────────────────────────────────────────────────

async function loadAll() {
    [tournaments, members] = await Promise.all([
        apiFetch("/int-tournaments"),
        apiFetch("/members"),
    ]);
    renderList();
    if (selectedId) {
        const t = tournaments.find(t => t.id === selectedId);
        if (t) showDetail(t); else closeDetail();
    }
}

async function refreshTournament(id) {
    const updated = await apiFetch(`/int-tournaments/${id}`);
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
    const tbody = document.getElementById("int-tournament-tbody");
    if (!tournaments.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-muted text-center py-3">No internal tournaments yet. Create one to get started.</td></tr>`;
        return;
    }
    tbody.innerHTML = tournaments.map(t => {
        const dates = t.end_date
            ? `${_fmtDate(t.start_date)} – ${_fmtDate(t.end_date)}`
            : _fmtDate(t.start_date);
        const totalPlayers = t.teams.reduce((s, team) => s + team.players.length, 0);
        const teamSummary = t.teams.length
            ? `${t.teams.length} team${t.teams.length > 1 ? "s" : ""}, ${totalPlayers} players`
            : "—";
        const badge = `<span class="badge ${STATUS_BADGE[t.status] || "bg-secondary"}">${t.status}</span>`;
        return `
        <tr style="cursor:pointer" onclick="window._viewIntTournament(${t.id})">
          <td class="fw-semibold">${t.name}</td>
          <td class="text-muted small text-nowrap">${dates}</td>
          <td>${t.format || "—"}</td>
          <td class="text-muted small">${t.venue || "—"}</td>
          <td class="small">${teamSummary}</td>
          <td>${badge}</td>
          <td>${t.champion ? `<span class="text-success fw-semibold">🏆 ${t.champion}</span>` : `<span class="text-muted">—</span>`}</td>
        </tr>`;
    }).join("");
}

function showDetail(t) {
    selectedId = t.id;
    const panel = document.getElementById("int-tournament-detail");
    panel.style.display = "";
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });

    document.getElementById("int-detail-title").textContent = t.name;

    // Meta
    const meta = [
        t.format ? `<div class="col-auto"><span class="text-muted small">Format</span><br><strong>${t.format}</strong></div>` : "",
        t.venue  ? `<div class="col-auto"><span class="text-muted small">Venue</span><br><strong>${t.venue}</strong></div>` : "",
        `<div class="col-auto"><span class="text-muted small">Dates</span><br><strong>${t.end_date ? _fmtDate(t.start_date) + " – " + _fmtDate(t.end_date) : _fmtDate(t.start_date)}</strong></div>`,
        t.notes ? `<div class="col-12"><span class="text-muted small">Notes</span><br>${t.notes}</div>` : "",
    ].filter(Boolean).join("");
    document.getElementById("int-detail-meta").innerHTML = meta || `<div class="col-12 text-muted">No additional details.</div>`;

    // Status buttons
    document.querySelectorAll(".int-status-btn").forEach(btn => {
        const active = btn.dataset.status === t.status;
        btn.className = `btn btn-sm int-status-btn ${active ? _statusBtnClass(t.status) : "btn-outline-secondary"}`;
    });

    // Champion field
    const championRow = document.getElementById("int-champion-row");
    if (t.status === "completed" || t.champion) {
        championRow.style.display = "";
        document.getElementById("int-champion-input").value = t.champion || "";
    } else {
        championRow.style.display = "none";
    }

    // Teams
    renderTeams(t);

    // Delete button — only when no teams (or tournament is empty)
    const delBtn = document.getElementById("btn-delete-int-tournament");
    delBtn.classList.toggle("d-none", t.teams.length > 0);
    delBtn.dataset.id = t.id;
}

function renderTeams(t) {
    // Collect all assigned member IDs across all teams
    const assignedIds = new Set(
        t.teams.flatMap(team => team.players.map(p => p.member_id))
    );
    const available = members.filter(m => !assignedIds.has(m.id));

    const container = document.getElementById("int-teams-container");
    if (!t.teams.length) {
        container.innerHTML = `<p class="text-muted">No teams yet. Add a team above.</p>`;
        return;
    }

    container.innerHTML = t.teams.map(team => {
        const rows = team.players.length
            ? team.players.slice().sort((a, b) => a.member.name.localeCompare(b.member.name))
                .map(p => `
                <tr>
                  <td>${p.member.name}</td>
                  <td class="text-end">
                    <button class="btn btn-sm btn-outline-danger"
                      onclick="window._intRemovePlayer(${team.id}, ${p.id})">
                      <i class="bi bi-trash"></i>
                    </button>
                  </td>
                </tr>`).join("")
            : `<tr><td colspan="2" class="text-muted text-center small py-2">No players yet.</td></tr>`;

        return `
        <div class="card mb-3">
          <div class="card-header d-flex align-items-center justify-content-between py-2">
            <span class="fw-semibold">${team.name}
              <span class="badge bg-light text-dark ms-1">${team.players.length}</span>
            </span>
            <div class="d-flex gap-2">
              <button class="btn btn-sm btn-outline-success"
                onclick="window._intOpenAddPlayer(${team.id}, '${team.name.replace(/'/g, "\\'")}')"
                ${!available.length ? "disabled title='All players assigned'" : ""}>
                <i class="bi bi-person-plus me-1"></i>Add Player
              </button>
              <button class="btn btn-sm btn-outline-danger"
                onclick="window._intRemoveTeam(${team.id})">
                <i class="bi bi-trash"></i>
              </button>
            </div>
          </div>
          <div class="card-body p-0">
            <table class="table table-sm mb-0">
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>`;
    }).join("");
}

function _statusBtnClass(status) {
    return { upcoming: "btn-secondary", ongoing: "btn-warning", completed: "btn-success" }[status] || "btn-secondary";
}

function closeDetail() {
    selectedId = null;
    document.getElementById("int-tournament-detail").style.display = "none";
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

function openModal(t = null) {
    document.getElementById("int-modal-title").textContent = t ? "Edit Tournament" : "New Tournament";
    const form = document.getElementById("int-tournament-form");
    form.reset();
    if (t) {
        form.name.value       = t.name;
        form.format.value     = t.format ?? "";
        form.venue.value      = t.venue ?? "";
        form.start_date.value = t.start_date ?? "";
        form.end_date.value   = t.end_date ?? "";
        form.notes.value      = t.notes ?? "";
    }
    document.getElementById("int-save-btn").dataset.editId = t ? t.id : "";
    modal.show();
}

async function onSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const body = {
        name:       form.name.value.trim(),
        format:     form.format.value || null,
        venue:      form.venue.value.trim() || null,
        start_date: form.start_date.value,
        end_date:   form.end_date.value || null,
        notes:      form.notes.value.trim() || null,
    };
    const editId = document.getElementById("int-save-btn").dataset.editId;
    try {
        if (editId) {
            await apiFetch(`/int-tournaments/${editId}`, { method: "PUT", body: JSON.stringify(body) });
            showToast("Tournament updated");
            modal.hide();
            await refreshTournament(parseInt(editId));
        } else {
            const created = await apiFetch("/int-tournaments", { method: "POST", body: JSON.stringify(body) });
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
    const id = parseInt(document.getElementById("btn-delete-int-tournament").dataset.id);
    if (!id || !confirm("Delete this tournament and all its data? This cannot be undone.")) return;
    try {
        await apiFetch(`/int-tournaments/${id}`, { method: "DELETE" });
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
        await apiFetch(`/int-tournaments/${selectedId}`, { method: "PUT", body: JSON.stringify({ status }) });
        await refreshTournament(selectedId);
    } catch (err) {
        showToast(err.message, "error");
    }
}

async function onSaveChampion() {
    if (!selectedId) return;
    const champion = document.getElementById("int-champion-input").value.trim() || null;
    try {
        await apiFetch(`/int-tournaments/${selectedId}`, { method: "PUT", body: JSON.stringify({ champion }) });
        showToast("Champion saved");
        await refreshTournament(selectedId);
    } catch (err) {
        showToast(err.message, "error");
    }
}

// ── Teams ─────────────────────────────────────────────────────────────────────

async function onAddTeam() {
    const name = document.getElementById("int-team-name-input").value.trim();
    if (!name) { showToast("Enter a team name", "error"); return; }
    try {
        await apiFetch(`/int-tournaments/${selectedId}/teams`, {
            method: "POST",
            body: JSON.stringify({ name }),
        });
        document.getElementById("int-team-name-input").value = "";
        await refreshTournament(selectedId);
    } catch (err) {
        showToast(err.message, "error");
    }
}

window._intRemoveTeam = async (tid) => {
    if (!confirm("Remove this team and all its players?")) return;
    try {
        await apiFetch(`/int-tournaments/${selectedId}/teams/${tid}`, { method: "DELETE" });
        await refreshTournament(selectedId);
    } catch (err) {
        showToast(err.message, "error");
    }
};

// ── Players ───────────────────────────────────────────────────────────────────

window._intOpenAddPlayer = (teamId, teamName) => {
    addPlayerTeamId = teamId;
    document.getElementById("int-team-modal-name").textContent = teamName;

    const t = tournaments.find(t => t.id === selectedId);
    const assignedIds = new Set(
        (t?.teams ?? []).flatMap(team => team.players.map(p => p.member_id))
    );
    const available = members.filter(m => !assignedIds.has(m.id));

    const sel = document.getElementById("int-add-player-select");
    sel.innerHTML = '<option value="">— Select player —</option>' +
        available.map(m => `<option value="${m.id}">${m.name}</option>`).join("");

    addPlayerModal.show();
};

async function onConfirmAddPlayer() {
    const member_id = parseInt(document.getElementById("int-add-player-select").value);
    if (!member_id) { showToast("Select a player", "error"); return; }
    try {
        await apiFetch(`/int-tournaments/${selectedId}/teams/${addPlayerTeamId}/players`, {
            method: "POST",
            body: JSON.stringify({ member_id }),
        });
        addPlayerModal.hide();
        await refreshTournament(selectedId);
    } catch (err) {
        showToast(err.message, "error");
    }
}

window._intRemovePlayer = async (tid, pid) => {
    if (!confirm("Remove this player from the team?")) return;
    try {
        await apiFetch(`/int-tournaments/${selectedId}/teams/${tid}/players/${pid}`, { method: "DELETE" });
        await refreshTournament(selectedId);
    } catch (err) {
        showToast(err.message, "error");
    }
};

window._viewIntTournament = (id) => {
    const t = tournaments.find(t => t.id === id);
    if (t) showDetail(t);
};
