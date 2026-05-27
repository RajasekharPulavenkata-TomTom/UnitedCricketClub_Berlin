import { apiFetch, showToast, fmt } from "/js/api.js";

let modal, editMatchesModal;
let tournaments = [];
let members = [];
let selectedId = null;
let editingParticipantId = null;

export async function init() {
    modal = new bootstrap.Modal(document.getElementById("tournamentModal"));
    editMatchesModal = new bootstrap.Modal(document.getElementById("editMatchesModal"));

    document.getElementById("btn-new-tournament").addEventListener("click", () => openTournamentModal());
    document.getElementById("tournament-form").addEventListener("submit", onTournamentSubmit);
    document.getElementById("btn-add-participant").addEventListener("click", onAddParticipant);
    document.getElementById("btn-close-detail").addEventListener("click", closeDetail);
    document.getElementById("btn-edit-tournament").addEventListener("click", () => {
        const t = tournaments.find(t => t.id === selectedId);
        if (t) openTournamentModal(t);
    });
    document.getElementById("edit-matches-form").addEventListener("submit", onEditMatchesSubmit);

    await loadAll();
}

async function loadAll() {
    [tournaments, members] = await Promise.all([
        apiFetch("/tournaments"),
        apiFetch("/members"),
    ]);
    renderTournaments();
    populateMemberSelect();
    if (selectedId) {
        const t = tournaments.find(t => t.id === selectedId);
        if (t) showDetail(t);
    }
}

function populateMemberSelect() {
    const sel = document.getElementById("add-member-select");
    const current = sel.value;
    sel.innerHTML = '<option value="">— Select player —</option>' +
        members.map(m => `<option value="${m.id}">${m.name}</option>`).join("");
    if (current) sel.value = current;
}

function renderTournaments() {
    const tbody = document.getElementById("tournament-tbody");
    if (!tournaments.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-muted text-center py-3">No tournaments yet. Create one to get started.</td></tr>`;
        return;
    }
    tbody.innerHTML = tournaments.map(t => {
        const totalMatches = t.participants.reduce((s, p) => s + p.matches_played, 0);
        const feePerMatch = totalMatches ? (t.total_fee / totalMatches).toFixed(2) : "—";
        return `
        <tr class="align-middle" style="cursor:pointer" onclick="window._viewTournament(${t.id})">
          <td class="fw-semibold">${t.name}</td>
          <td>${fmt.currency(t.total_fee)}</td>
          <td>${t.participants.length}</td>
          <td>${totalMatches || "—"}</td>
          <td>${totalMatches ? "€" + feePerMatch : "—"}</td>
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
    document.getElementById("tournament-detail").style.display = "";
    document.getElementById("detail-title").textContent = `${t.name} — ${fmt.currency(t.total_fee)}`;

    // Remove already-added players from the select
    const addedIds = new Set(t.participants.map(p => p.member_id));
    const sel = document.getElementById("add-member-select");
    sel.innerHTML = '<option value="">— Select player —</option>' +
        members.filter(m => !addedIds.has(m.id)).map(m => `<option value="${m.id}">${m.name}</option>`).join("");

    const tbody = document.getElementById("participants-tbody");
    const tfoot = document.getElementById("participants-tfoot");

    if (!t.participants.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-muted text-center py-3">No players added yet.</td></tr>`;
        tfoot.style.display = "none";
        return;
    }

    const totalMatches = t.participants.reduce((s, p) => s + p.matches_played, 0);
    const feePerMatch = totalMatches ? t.total_fee / totalMatches : 0;

    tbody.innerHTML = t.participants.map(p => `
      <tr class="align-middle">
        <td>${p.member.name}</td>
        <td class="text-center">
          ${p.matches_played}
          <button class="btn btn-link btn-sm p-0 ms-1 text-muted" onclick="window._editMatches(${p.id}, ${p.matches_played})">
            <i class="bi bi-pencil" style="font-size:.75rem"></i>
          </button>
        </td>
        <td class="text-end fw-semibold">${fmt.currency(p.fee_share ?? 0)}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-danger" onclick="window._removeParticipant(${p.id})">
            <i class="bi bi-trash"></i>
          </button>
        </td>
      </tr>`).join("");

    document.getElementById("total-matches").textContent = totalMatches;
    document.getElementById("total-fee-display").textContent = fmt.currency(t.total_fee);
    document.getElementById("fee-per-match-label").textContent =
        `€${feePerMatch.toFixed(2)} per match (${fmt.currency(t.total_fee)} ÷ ${totalMatches} matches)`;
    tfoot.style.display = "";
}

function closeDetail() {
    selectedId = null;
    document.getElementById("tournament-detail").style.display = "none";
}

function openTournamentModal(t = null) {
    document.getElementById("tournament-modal-title").textContent = t ? "Edit Tournament" : "New Tournament";
    document.getElementById("t-name").value = t ? t.name : "";
    document.getElementById("t-fee").value = t ? t.total_fee : "";
    document.getElementById("t-save-btn").dataset.editId = t ? t.id : "";
    modal.show();
}

async function onTournamentSubmit(e) {
    e.preventDefault();
    const name = document.getElementById("t-name").value.trim();
    const total_fee = parseFloat(document.getElementById("t-fee").value);
    const editId = document.getElementById("t-save-btn").dataset.editId;

    try {
        if (editId) {
            await apiFetch(`/tournaments/${editId}`, { method: "PUT", body: JSON.stringify({ name, total_fee }) });
            showToast("Tournament updated");
        } else {
            const created = await apiFetch("/tournaments", { method: "POST", body: JSON.stringify({ name, total_fee }) });
            selectedId = created.id;
            showToast("Tournament created");
        }
        modal.hide();
        await loadAll();
        const t = tournaments.find(t => t.id === selectedId);
        if (t) showDetail(t);
    } catch (err) {
        showToast(err.message, "error");
    }
}

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
        await loadAll();
        const t = tournaments.find(t => t.id === selectedId);
        if (t) showDetail(t);
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

window._editMatches = (pid, current) => {
    editingParticipantId = pid;
    document.getElementById("edit-matches-input").value = current;
    editMatchesModal.show();
};

async function onEditMatchesSubmit(e) {
    e.preventDefault();
    const matches_played = parseInt(document.getElementById("edit-matches-input").value);
    try {
        await apiFetch(`/tournaments/${selectedId}/participants/${editingParticipantId}`, {
            method: "PUT",
            body: JSON.stringify({ matches_played }),
        });
        editMatchesModal.hide();
        await loadAll();
        const t = tournaments.find(t => t.id === selectedId);
        if (t) showDetail(t);
    } catch (err) {
        showToast(err.message, "error");
    }
}

window._removeParticipant = async (pid) => {
    if (!confirm("Remove this player from the tournament?")) return;
    try {
        await apiFetch(`/tournaments/${selectedId}/participants/${pid}`, { method: "DELETE" });
        await loadAll();
        const t = tournaments.find(t => t.id === selectedId);
        if (t) showDetail(t);
    } catch (err) {
        showToast(err.message, "error");
    }
};
