import { apiFetch, showToast } from "/js/api.js";

let modal, addPlayerModal, playerFbModal;
let tournaments = [];
let members = [];
let selectedId = null;
let addPlayerTeamId = null;

let _user = null;
try { _user = JSON.parse(localStorage.getItem("ucc_user") || "null"); } catch { /**/ }

function _isAdmin()    { return _user?.role === "admin" || _user?.role === "root"; }
function _canEdit(t)   {
    if (_isAdmin()) return true;
    if (t.captain_id == null) return true;
    return _user?.member_id != null && _user.member_id === t.captain_id;
}

export async function init() {
    modal = new bootstrap.Modal(document.getElementById("intTournamentModal"));
    addPlayerModal = new bootstrap.Modal(document.getElementById("intAddPlayerModal"));
    playerFbModal = new bootstrap.Modal(document.getElementById("playerFbModal"));

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
    document.getElementById("btn-int-save-captain").addEventListener("click", onSaveIntCaptain);

    document.querySelectorAll(".int-status-btn").forEach(btn => {
        btn.addEventListener("click", () => onSetStatus(btn.dataset.status));
    });

    // Player feedback modal star picker
    {
        const picker = document.getElementById("pfb-star-picker");
        const stars = picker.querySelectorAll(".star-btn");
        playerFbModal._selected = 0;
        stars.forEach(s => {
            s.addEventListener("mouseover", () => {
                stars.forEach((x, i) => x.classList.toggle("text-warning", i < parseInt(s.dataset.val)));
            });
            s.addEventListener("mouseout", () => {
                stars.forEach((x, i) => x.classList.toggle("text-warning", i < playerFbModal._selected));
            });
            s.addEventListener("click", () => {
                playerFbModal._selected = parseInt(s.dataset.val);
                stars.forEach((x, i) => x.classList.toggle("text-warning", i < playerFbModal._selected));
            });
        });
    }

    document.getElementById("btn-pfb-save").addEventListener("click", async () => {
        const memberId = parseInt(document.getElementById("pfb-member-id").value);
        const rating = playerFbModal._selected || null;
        const comment = document.getElementById("pfb-comment").value.trim() || null;
        if (!memberId) return;
        try {
            await apiFetch(`/tournament-feedback/internal/${selectedId}/players/${memberId}`, {
                method: "PUT",
                body: JSON.stringify({ rating, comment }),
            });
            showToast("Player review saved");
            playerFbModal.hide();
            const t = tournaments.find(t => t.id === selectedId);
            if (t) renderFeedbackSection("internal", t);
        } catch (err) {
            showToast(err.message, "error");
        }
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

    const canEdit = _canEdit(t);
    const isAdmin = _isAdmin();

    document.getElementById("int-detail-title").textContent = t.name;
    document.getElementById("btn-edit-int-tournament").classList.toggle("d-none", !canEdit);

    // Meta
    const captainName = t.captain_id ? members.find(m => m.id === t.captain_id)?.name : null;
    const meta = [
        t.format ? `<div class="col-auto"><span class="text-muted small">Format</span><br><strong>${t.format}</strong></div>` : "",
        t.venue  ? `<div class="col-auto"><span class="text-muted small">Venue</span><br><strong>${t.venue}</strong></div>` : "",
        `<div class="col-auto"><span class="text-muted small">Dates</span><br><strong>${t.end_date ? _fmtDate(t.start_date) + " – " + _fmtDate(t.end_date) : _fmtDate(t.start_date)}</strong></div>`,
        captainName ? `<div class="col-auto"><span class="text-muted small">Captain</span><br><strong><i class="bi bi-crown-fill text-warning me-1"></i>${captainName}</strong></div>` : "",
        t.notes ? `<div class="col-12"><span class="text-muted small">Notes</span><br>${t.notes}</div>` : "",
    ].filter(Boolean).join("");
    document.getElementById("int-detail-meta").innerHTML = meta || `<div class="col-12 text-muted">No additional details.</div>`;

    // Admin-only captain select
    const captainSection = document.getElementById("int-captain-section");
    if (isAdmin) {
        captainSection.style.display = "";
        const capSel = document.getElementById("int-captain-select");
        capSel.innerHTML = '<option value="">— None —</option>' +
            members.filter(m => m.is_active).map(m =>
                `<option value="${m.id}" ${m.id === t.captain_id ? "selected" : ""}>${m.name}</option>`
            ).join("");
    } else {
        captainSection.style.display = "none";
    }

    // Status buttons
    document.querySelectorAll(".int-status-btn").forEach(btn => {
        const active = btn.dataset.status === t.status;
        btn.className = `btn btn-sm int-status-btn ${active ? _statusBtnClass(t.status) : "btn-outline-secondary"}`;
        btn.disabled = !canEdit;
    });

    // Champion field
    const championRow = document.getElementById("int-champion-row");
    if (t.status === "completed" || t.champion) {
        championRow.style.display = "";
        document.getElementById("int-champion-input").value = t.champion || "";
        document.getElementById("int-champion-input").disabled = !canEdit;
        document.getElementById("btn-save-champion").disabled = !canEdit;
    } else {
        championRow.style.display = "none";
    }

    // Add team row
    const addTeamRow = document.getElementById("int-add-team-row");
    if (addTeamRow) addTeamRow.style.display = canEdit ? "" : "none";

    // Teams
    renderTeams(t, canEdit);

    // Delete button — only for captain/admin, only when no teams
    const delBtn = document.getElementById("btn-delete-int-tournament");
    delBtn.classList.toggle("d-none", !canEdit || t.teams.length > 0);
    delBtn.dataset.id = t.id;

    // Feedback section loads async — does not block the rest of the detail panel
    renderFeedbackSection("internal", t);
}

function renderTeams(t, canEdit = true) {
    const assignedIds = new Set(
        t.teams.flatMap(team => team.players.map(p => p.member_id))
    );
    const available = members.filter(m => !assignedIds.has(m.id));

    const container = document.getElementById("int-teams-container");
    if (!t.teams.length) {
        container.innerHTML = `<p class="text-muted">No teams yet.${canEdit ? " Add a team above." : ""}</p>`;
        return;
    }

    container.innerHTML = t.teams.map(team => {
        const captainName = team.captain_id
            ? team.players.find(p => p.member_id === team.captain_id)?.member?.name
            : null;

        const rows = team.players.length
            ? team.players.slice().sort((a, b) => a.member.name.localeCompare(b.member.name))
                .map(p => {
                    const isCaptain = team.captain_id === p.member_id;
                    const captainBtn = canEdit
                        ? `<button class="btn btn-sm ${isCaptain ? "btn-warning" : "btn-outline-secondary"}"
                             onclick="window._intSetCaptain(${team.id}, ${p.member_id})"
                             title="${isCaptain ? "Remove as captain" : "Set as captain"}">
                             <i class="bi bi-crown${isCaptain ? "-fill" : ""}"></i>
                           </button>`
                        : isCaptain ? `<i class="bi bi-crown-fill text-warning" title="Captain"></i>` : "";
                    const removeBtn = canEdit
                        ? `<button class="btn btn-sm btn-outline-danger"
                             onclick="window._intRemovePlayer(${team.id}, ${p.id})">
                             <i class="bi bi-trash"></i>
                           </button>`
                        : "";
                    return `
                <tr>
                  <td>${p.member.name}</td>
                  <td class="text-center">${captainBtn}</td>
                  <td class="text-end">${removeBtn}</td>
                </tr>`;
                }).join("")
            : `<tr><td colspan="3" class="text-muted text-center small py-2">No players yet.</td></tr>`;

        const actionBtns = canEdit ? `
              <button class="btn btn-sm btn-outline-success"
                onclick="window._intOpenAddPlayer(${team.id}, '${team.name.replace(/'/g, "\\'")}')"
                ${!available.length ? "disabled title='All players assigned'" : ""}>
                <i class="bi bi-person-plus me-1"></i>Add Player
              </button>
              <button class="btn btn-sm btn-outline-danger"
                onclick="window._intRemoveTeam(${team.id})">
                <i class="bi bi-trash"></i>
              </button>` : "";

        return `
        <div class="card mb-3">
          <div class="card-header d-flex align-items-center justify-content-between py-2">
            <span class="fw-semibold">${team.name}
              <span class="badge bg-light text-dark ms-1">${team.players.length}</span>
              ${captainName ? `<span class="ms-2 small text-muted"><i class="bi bi-crown-fill text-warning me-1"></i>${captainName}</span>` : ""}
            </span>
            <div class="d-flex gap-2">${actionBtns}</div>
          </div>
          <div class="card-body p-0">
            <table class="table table-sm mb-0">
              <thead class="table-light">
                <tr>
                  <th>Player</th>
                  <th class="text-center">Captain</th>
                  <th class="text-end">${canEdit ? "Remove" : ""}</th>
                </tr>
              </thead>
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

async function onSaveIntCaptain() {
    const captain_id = parseInt(document.getElementById("int-captain-select").value) || null;
    try {
        await apiFetch(`/int-tournaments/${selectedId}/captain`, {
            method: "PATCH",
            body: JSON.stringify({ captain_id }),
        });
        showToast(captain_id ? "Captain assigned" : "Captain cleared");
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

window._intSetCaptain = async (teamId, memberId) => {
    const t = tournaments.find(t => t.id === selectedId);
    const team = t?.teams.find(team => team.id === teamId);
    const captain_id = team?.captain_id === memberId ? null : memberId;
    try {
        await apiFetch(`/int-tournaments/${selectedId}/teams/${teamId}/captain`, {
            method: "PATCH",
            body: JSON.stringify({ captain_id }),
        });
        await refreshTournament(selectedId);
    } catch (err) {
        showToast(err.message, "error");
    }
};

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

// ── Tournament Feedback ───────────────────────────────────────────────────────

async function renderFeedbackSection(tType, t) {
    const el = document.getElementById(`${tType === "external" ? "ext" : "int"}-feedback-section`);
    if (!el) return;
    el.innerHTML = `<div class="text-center py-2"><div class="spinner-border spinner-border-sm"></div></div>`;

    const isAdmin = _isAdmin();
    const isCaptain = _user?.member_id != null && _user.member_id === t.captain_id;
    const canSeePlayerReviews = isAdmin || isCaptain;

    try {
        const captainFb = await apiFetch(`/tournament-feedback/${tType}/${t.id}/captain`);
        const playerFb = canSeePlayerReviews
            ? await apiFetch(`/tournament-feedback/${tType}/${t.id}/players`)
            : null;

        el.innerHTML = _renderFeedbackHTML(t, tType, captainFb, playerFb, canSeePlayerReviews);
        _bindFeedbackEvents(t, tType, el);
    } catch (e) {
        el.innerHTML = `<p class="text-danger small">${e.message}</p>`;
    }
}

function _stars(rating, interactive = false, prefix = "") {
    if (!interactive) {
        if (!rating) return `<span class="text-muted small">No rating</span>`;
        return Array.from({ length: 5 }, (_, i) =>
            `<i class="bi bi-star${i < rating ? "-fill" : ""} text-warning"></i>`
        ).join("");
    }
    // interactive star picker
    return `<div class="d-flex gap-1 my-1" id="${prefix}star-picker">
        ${Array.from({ length: 5 }, (_, i) =>
            `<i class="bi bi-star-fill fs-5 star-btn text-muted" data-val="${i + 1}" style="cursor:pointer"></i>`
        ).join("")}
    </div>`;
}

function _renderFeedbackHTML(t, tType, captainFb, playerFb, canSeePlayerReviews) {
    // ── Captain feedback section ──
    const avgBlock = captainFb.count
        ? `<span class="fw-semibold">${captainFb.avg_rating ?? "—"}</span> / 5
           <span class="text-muted small ms-1">(${captainFb.count} review${captainFb.count !== 1 ? "s" : ""})</span>`
        : `<span class="text-muted small">No reviews yet</span>`;

    const commentsList = captainFb.comments.length
        ? `<ul class="list-unstyled mt-2 mb-0">
               ${captainFb.comments.map(c => `<li class="text-muted small mb-1"><i class="bi bi-chat-left-quote me-1"></i>${c}</li>`).join("")}
           </ul>`
        : "";

    const submitBtn = `<button class="btn btn-sm btn-success mt-2" id="btn-submit-captain-fb">Submit Feedback</button>`;

    const myFbBlock = _user?.member_id
        ? `<div class="mt-3 border-top pt-3" id="captain-fb-form">
               <div class="small fw-semibold mb-1">${captainFb.my_rating ? "Your rating (click to update):" : "Leave your rating:"}</div>
               ${_stars(null, true, "captain-")}
               <textarea class="form-control form-control-sm mt-2" id="captain-fb-comment" rows="2"
                   placeholder="Optional comment…" maxlength="500">${captainFb.my_comment ?? ""}</textarea>
               ${submitBtn}
               ${captainFb.my_rating ? `<div class="text-muted small mt-1">Your current rating: ${_stars(captainFb.my_rating)}</div>` : ""}
           </div>`
        : `<p class="text-muted small mt-2">Link your account to a member profile to leave feedback.</p>`;

    const captainSection = `
        <div class="mb-4">
            <h6 class="fw-semibold mb-2"><i class="bi bi-chat-square-heart me-1 text-danger"></i>Anonymous Captain Feedback</h6>
            <div class="d-flex align-items-center gap-2">
                ${captainFb.count ? _stars(Math.round(captainFb.avg_rating)) : ""}
                ${avgBlock}
            </div>
            ${commentsList}
            ${myFbBlock}
        </div>`;

    // ── Player reviews section ──
    let playerSection = "";
    if (canSeePlayerReviews && playerFb) {
        const rows = playerFb.length
            ? playerFb.map(p => `
                <tr>
                    <td class="fw-semibold">${p.member_name}</td>
                    <td>${_stars(p.rating)}</td>
                    <td class="text-muted small">${p.comment ?? "—"}</td>
                    <td class="text-end">
                        <button class="btn btn-sm btn-outline-secondary"
                            onclick="window._openPlayerFbModal(${p.member_id}, '${p.member_name.replace(/'/g, "\\'")}', ${p.rating ?? "null"}, \`${(p.comment ?? "").replace(/`/g, "\\`")}\`)">
                            <i class="bi bi-pencil"></i>
                        </button>
                    </td>
                </tr>`).join("")
            : `<tr><td colspan="4" class="text-muted text-center py-2">No players in this tournament.</td></tr>`;

        playerSection = `
            <div>
                <h6 class="fw-semibold mb-2"><i class="bi bi-person-lines-fill me-1 text-primary"></i>Player Reviews (Captain Only)</h6>
                <div class="table-responsive">
                    <table class="table table-sm table-hover mb-0">
                        <thead class="table-light">
                            <tr><th>Player</th><th>Rating</th><th>Comment</th><th></th></tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>`;
    }

    return captainSection + playerSection;
}

function _bindFeedbackEvents(t, tType, el) {
    // Star picker interaction for captain feedback form
    const picker = el.querySelector("#captain-star-picker");
    if (picker) {
        let selected = 0;
        const stars = picker.querySelectorAll(".star-btn");
        stars.forEach(s => {
            s.addEventListener("mouseover", () => {
                stars.forEach((x, i) =>
                    x.classList.toggle("text-warning", i < parseInt(s.dataset.val)));
            });
            s.addEventListener("mouseout", () => {
                stars.forEach((x, i) =>
                    x.classList.toggle("text-warning", i < selected));
            });
            s.addEventListener("click", () => {
                selected = parseInt(s.dataset.val);
                stars.forEach((x, i) =>
                    x.classList.toggle("text-warning", i < selected));
            });
        });

        const submitBtn = el.querySelector("#btn-submit-captain-fb");
        if (submitBtn) {
            submitBtn.addEventListener("click", async () => {
                if (!selected) { showToast("Please select a rating", "error"); return; }
                const comment = el.querySelector("#captain-fb-comment")?.value.trim() || null;
                try {
                    await apiFetch(`/tournament-feedback/${tType}/${t.id}/captain`, {
                        method: "POST",
                        body: JSON.stringify({ rating: selected, comment }),
                    });
                    showToast("Feedback submitted");
                    await renderFeedbackSection(tType, t);
                } catch (e) {
                    showToast(e.message, "error");
                }
            });
        }
    }
}

window._openPlayerFbModal = (memberId, memberName, currentRating, currentComment) => {
    document.getElementById("pfb-modal-title").textContent = `Review: ${memberName}`;
    document.getElementById("pfb-member-id").value = memberId;
    document.getElementById("pfb-comment").value = currentComment || "";
    const stars = document.querySelectorAll("#pfb-star-picker .star-btn");
    const selected = currentRating || 0;
    playerFbModal._selected = selected;
    stars.forEach((s, i) => s.classList.toggle("text-warning", i < selected));
    playerFbModal.show();
};
