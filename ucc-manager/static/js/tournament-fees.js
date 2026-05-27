import { apiFetch, showToast, fmt } from "/js/api.js";

let modal;
let tournaments = [];
let members = [];
let selectedId = null;

export async function init() {
    modal = new bootstrap.Modal(document.getElementById("tournamentModal"));

    document.getElementById("btn-new-tournament").addEventListener("click", () => openTournamentModal());
    document.getElementById("tournament-form").addEventListener("submit", onTournamentSubmit);
    document.getElementById("btn-add-participant").addEventListener("click", onAddParticipant);
    document.getElementById("btn-close-detail").addEventListener("click", closeDetail);
    document.getElementById("btn-edit-tournament").addEventListener("click", () => {
        const t = tournaments.find(t => t.id === selectedId);
        if (t) openTournamentModal(t);
    });
    document.getElementById("btn-copy-summary").addEventListener("click", copySummary);

    await loadAll();
}

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadAll() {
    [tournaments, members] = await Promise.all([
        apiFetch("/tournaments"),
        apiFetch("/members"),
    ]);
    renderTournaments();
    if (selectedId) {
        const t = tournaments.find(t => t.id === selectedId);
        if (t) showDetail(t);
    }
}

async function refreshTournament(id) {
    const updated = await apiFetch(`/tournaments/${id}`);
    const idx = tournaments.findIndex(t => t.id === id);
    if (idx >= 0) tournaments[idx] = updated; else tournaments.unshift(updated);
    renderTournaments();
    showDetail(updated);
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderTournaments() {
    const tbody = document.getElementById("tournament-tbody");
    if (!tournaments.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-muted text-center py-3">No tournaments yet. Create one to get started.</td></tr>`;
        return;
    }
    tbody.innerHTML = tournaments.map(t => {
        const totalMatches = t.participants.reduce((s, p) => s + p.matches_played, 0);
        const paidCount = t.participants.filter(p => p.paid).length;
        const feePerMatch = totalMatches ? "€" + (t.total_fee / totalMatches).toFixed(2) : "—";
        const dateStr = t.date ? new Date(t.date + "T00:00:00").toLocaleDateString("en-GB") : "—";
        return `
        <tr class="align-middle" style="cursor:pointer" onclick="window._viewTournament(${t.id})">
          <td class="fw-semibold">${t.name}</td>
          <td class="text-muted">${dateStr}</td>
          <td>${fmt.currency(t.total_fee)}</td>
          <td>${t.participants.length}</td>
          <td>${paidCount}/${t.participants.length}</td>
          <td>${feePerMatch}</td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-danger" onclick="event.stopPropagation(); window._deleteTournament(${t.id})">
              <i class="bi bi-trash"></i>
            </button>
          </td>
        </tr>`;
    }).join("");
}

function showDetail(t) {
    selectedId = t.id;
    const panel = document.getElementById("tournament-detail");
    panel.style.display = "";
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });

    const dateStr = t.date ? new Date(t.date + "T00:00:00").toLocaleDateString("en-GB") : null;
    document.getElementById("detail-title").textContent =
        `${t.name}${dateStr ? " · " + dateStr : ""} — ${fmt.currency(t.total_fee)}`;

    const addedIds = new Set(t.participants.map(p => p.member_id));
    const sel = document.getElementById("add-member-select");
    sel.innerHTML = '<option value="">— Select player —</option>' +
        members.filter(m => !addedIds.has(m.id)).map(m => `<option value="${m.id}">${m.name}</option>`).join("");

    const tbody = document.getElementById("participants-tbody");
    const tfoot = document.getElementById("participants-tfoot");

    if (!t.participants.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-muted text-center py-3">No players added yet.</td></tr>`;
        tfoot.style.display = "none";
        return;
    }

    const totalMatches = t.participants.reduce((s, p) => s + p.matches_played, 0);
    const feePerMatch = totalMatches ? t.total_fee / totalMatches : 0;
    const paidCount = t.participants.filter(p => p.paid).length;

    tbody.innerHTML = t.participants.map(p => `
      <tr class="align-middle ${p.paid ? "table-success" : ""}">
        <td>${p.member.name}</td>
        <td class="text-center">
          <input type="number" min="1" value="${p.matches_played}"
            class="form-control form-control-sm d-inline-block text-center matches-inline"
            style="width:65px;border:1px solid transparent;background:transparent"
            onfocus="this.style.borderColor='#dee2e6'"
            onblur="this.style.borderColor='transparent'; window._inlineEditMatches(${p.id}, this)"
            onkeydown="if(event.key==='Enter'){this.blur()}" />
          <button class="btn btn-link btn-sm p-0 ms-1 text-muted"
            onclick="this.closest('tr').querySelector('.matches-inline').focus()"
            title="Edit matches">
            <i class="bi bi-pencil" style="font-size:.75rem"></i>
          </button>
        </td>
        <td class="text-end fw-semibold">${fmt.currency(p.fee_share ?? 0)}</td>
        <td class="text-center">
          <button class="btn btn-sm ${p.paid ? "btn-success" : "btn-outline-secondary"}"
            onclick="window._togglePaid(${p.id})" title="${p.paid ? "Mark unpaid" : "Mark paid"}">
            <i class="bi ${p.paid ? "bi-check-circle-fill" : "bi-circle"}"></i>
          </button>
        </td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-danger" onclick="window._removeParticipant(${p.id})">
            <i class="bi bi-trash"></i>
          </button>
        </td>
      </tr>`).join("");

    document.getElementById("total-matches").textContent = totalMatches;
    document.getElementById("total-fee-display").textContent = fmt.currency(t.total_fee);
    document.getElementById("paid-summary").textContent = `${paidCount}/${t.participants.length}`;
    document.getElementById("fee-per-match-label").textContent =
        `€${feePerMatch.toFixed(2)} per match (${fmt.currency(t.total_fee)} ÷ ${totalMatches} matches)`;
    tfoot.style.display = "";
}

function closeDetail() {
    selectedId = null;
    document.getElementById("tournament-detail").style.display = "none";
}

// ── Tournament CRUD ───────────────────────────────────────────────────────────

function openTournamentModal(t = null) {
    document.getElementById("tournament-modal-title").textContent = t ? "Edit Tournament" : "New Tournament";
    document.getElementById("t-name").value = t ? t.name : "";
    document.getElementById("t-date").value = t?.date ?? "";
    document.getElementById("t-fee").value = t ? t.total_fee : "";
    document.getElementById("t-save-btn").dataset.editId = t ? t.id : "";
    modal.show();
}

async function onTournamentSubmit(e) {
    e.preventDefault();
    const name = document.getElementById("t-name").value.trim();
    const date = document.getElementById("t-date").value || null;
    const total_fee = parseFloat(document.getElementById("t-fee").value);
    const editId = document.getElementById("t-save-btn").dataset.editId;

    try {
        if (editId) {
            await apiFetch(`/tournaments/${editId}`, { method: "PUT", body: JSON.stringify({ name, date, total_fee }) });
            showToast("Tournament updated");
            modal.hide();
            await refreshTournament(parseInt(editId));
        } else {
            const created = await apiFetch("/tournaments", { method: "POST", body: JSON.stringify({ name, date, total_fee }) });
            selectedId = created.id;
            showToast("Tournament created");
            modal.hide();
            await loadAll();
            showDetail(tournaments.find(t => t.id === selectedId));
        }
    } catch (err) {
        showToast(err.message, "error");
    }
}

window._viewTournament = (id) => {
    const t = tournaments.find(t => t.id === id);
    if (t) showDetail(t);
};

window._deleteTournament = async (id) => {
    if (!confirm("Delete this tournament and all its participant data?")) return;
    try {
        await apiFetch(`/tournaments/${id}`, { method: "DELETE" });
        if (selectedId === id) closeDetail();
        showToast("Tournament deleted");
        await loadAll();
    } catch (err) {
        showToast(err.message, "error");
    }
};

// ── Participant actions ───────────────────────────────────────────────────────

async function onAddParticipant() {
    const member_id = parseInt(document.getElementById("add-member-select").value);
    const matches_played = parseInt(document.getElementById("add-matches-input").value);
    if (!member_id || !matches_played || matches_played < 1) {
        showToast("Select a player and enter matches played", "error");
        return;
    }
    try {
        await apiFetch(`/tournaments/${selectedId}/participants`, {
            method: "POST",
            body: JSON.stringify({ member_id, matches_played }),
        });
        document.getElementById("add-matches-input").value = "1";
        await refreshTournament(selectedId);
    } catch (err) {
        showToast(err.message, "error");
    }
}

window._inlineEditMatches = async (pid, input) => {
    const matches_played = parseInt(input.value);
    const t = tournaments.find(t => t.id === selectedId);
    const p = t?.participants.find(p => p.id === pid);
    if (!matches_played || matches_played < 1 || matches_played === p?.matches_played) return;
    try {
        await apiFetch(`/tournaments/${selectedId}/participants/${pid}`, {
            method: "PUT",
            body: JSON.stringify({ matches_played }),
        });
        await refreshTournament(selectedId);
    } catch (err) {
        showToast(err.message, "error");
        if (p) input.value = p.matches_played;
    }
};

window._togglePaid = async (pid) => {
    try {
        await apiFetch(`/tournaments/${selectedId}/participants/${pid}/paid`, { method: "PATCH" });
        await refreshTournament(selectedId);
    } catch (err) {
        showToast(err.message, "error");
    }
};

window._removeParticipant = async (pid) => {
    if (!confirm("Remove this player from the tournament?")) return;
    try {
        await apiFetch(`/tournaments/${selectedId}/participants/${pid}`, { method: "DELETE" });
        await refreshTournament(selectedId);
    } catch (err) {
        showToast(err.message, "error");
    }
};

// ── Copy summary ──────────────────────────────────────────────────────────────

function copySummary() {
    const t = tournaments.find(t => t.id === selectedId);
    if (!t) return;

    const totalMatches = t.participants.reduce((s, p) => s + p.matches_played, 0);
    const feePerMatch = totalMatches ? t.total_fee / totalMatches : 0;
    const dateStr = t.date ? new Date(t.date + "T00:00:00").toLocaleDateString("en-GB") : null;

    const header = `🏆 ${t.name}${dateStr ? " – " + dateStr : ""}`;
    const subheader = `Total Fee: ${fmt.currency(t.total_fee)}  |  ${fmt.currency(feePerMatch)} per match`;
    const divider = "─".repeat(45);

    const rows = t.participants
        .slice()
        .sort((a, b) => a.member.name.localeCompare(b.member.name))
        .map(p => {
            const name = p.member.name.padEnd(20);
            const matches = String(p.matches_played).padStart(3);
            const fee = fmt.currency(p.fee_share ?? 0).padStart(8);
            const status = p.paid ? "✓ Paid" : "✗ Unpaid";
            return `${name}  ${matches} match  ${fee}  ${status}`;
        });

    const paidCount = t.participants.filter(p => p.paid).length;
    const footer = `\n${paidCount}/${t.participants.length} players paid`;

    const text = [header, subheader, divider, ...rows, divider, footer].join("\n");

    navigator.clipboard.writeText(text)
        .then(() => showToast("Summary copied to clipboard"))
        .catch(() => showToast("Could not copy to clipboard", "error"));
}
