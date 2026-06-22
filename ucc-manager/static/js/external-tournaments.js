import { apiFetch, showToast, fmt } from "/js/api.js";

let modal;
let playerFbModal;
let tournaments = [];
let members = [];
let selectedId = null;

let _user = null;
try { _user = JSON.parse(localStorage.getItem("ucc_user") || "null"); } catch { /**/ }

function _isAdmin()        { return _user?.role === "manager" || _user?.role === "developer"; }
function _canEdit(t)       {
    if (_isAdmin()) return true;
    if (t.captain_id == null) return true;        // no captain set — open to all
    return _user?.member_id != null && _user.member_id === t.captain_id;
}

export async function init() {
    // Refresh member_id from the server without blocking page init — localStorage
    // may be stale if an admin linked this account after the user last logged in.
    // Completes well before the user can click a tournament row.
    apiFetch("/auth/me").then(me => {
        if (!_user || !me) return;
        _user.member_id = me.member_id ?? null;
        const stored = JSON.parse(localStorage.getItem("ucc_user") || "null");
        if (stored) { stored.member_id = me.member_id ?? null; localStorage.setItem("ucc_user", JSON.stringify(stored)); }
    }).catch(() => {});

    modal = new bootstrap.Modal(document.getElementById("extTournamentModal"));
    playerFbModal = new bootstrap.Modal(document.getElementById("playerFbModal"));

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
    document.getElementById("btn-ext-save-captain").addEventListener("click", onSaveCaptain);

    document.querySelectorAll(".ext-status-btn").forEach(btn => {
        btn.addEventListener("click", () => onSetStatus(btn.dataset.status));
    });

    // Player feedback modal star picker
    {
        const picker = document.getElementById("pfb-star-picker");
        const stars = picker.querySelectorAll(".star-btn");
        playerFbModal._selected = 0;
        const _setStars = (arr, upTo) => arr.forEach((x, i) => {
            x.classList.toggle("text-warning", i < upTo);
            x.classList.toggle("text-muted", i >= upTo);
        });
        stars.forEach(s => {
            s.addEventListener("mouseover", () => _setStars(stars, parseInt(s.dataset.val)));
            s.addEventListener("mouseout",  () => _setStars(stars, playerFbModal._selected));
            s.addEventListener("click",     () => {
                playerFbModal._selected = parseInt(s.dataset.val);
                _setStars(stars, playerFbModal._selected);
            });
        });
    }

    document.getElementById("btn-pfb-save").addEventListener("click", async () => {
        const memberId = parseInt(document.getElementById("pfb-member-id").value);
        const rating = playerFbModal._selected || null;
        const comment = document.getElementById("pfb-comment").value.trim() || null;
        if (!memberId) return;
        try {
            await apiFetch(`/tournament-feedback/external/${selectedId}/players/${memberId}`, {
                method: "PUT",
                body: JSON.stringify({ rating, comment }),
            });
            showToast("Player review saved");
            playerFbModal.hide();
            const t = tournaments.find(t => t.id === selectedId);
            if (t) renderFeedbackSection("external", t);
        } catch (err) {
            showToast(err.message, "error");
        }
    });

    await loadAll();
}

// ── Data ──────────────────────────────────────────────────────────────────────

async function loadAll() {
    [tournaments, members] = await Promise.all([
        apiFetch("/ext-tournaments"),
        apiFetch("/members/summary"),
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

    const canEdit = _canEdit(t);
    const isAdmin = _isAdmin();

    document.getElementById("ext-detail-title").textContent = t.name;

    // Header buttons
    document.getElementById("btn-edit-ext-tournament").classList.toggle("d-none", !canEdit);
    document.getElementById("btn-ext-copy-summary").classList.toggle("d-none", false);

    // Meta row
    const captainName = t.captain_id ? t.players.find(p => p.member_id === t.captain_id)?.member?.name : null;
    const meta = [
        t.organiser ? `<div class="col-auto"><span class="text-muted small">Organiser</span><br><strong>${t.organiser}</strong></div>` : "",
        t.format    ? `<div class="col-auto"><span class="text-muted small">Format</span><br><strong>${t.format}</strong></div>` : "",
        t.venue     ? `<div class="col-auto"><span class="text-muted small">Venue</span><br><strong>${t.venue}</strong></div>` : "",
        `<div class="col-auto"><span class="text-muted small">Dates</span><br><strong>${t.end_date ? _fmtDate(t.start_date) + " – " + _fmtDate(t.end_date) : _fmtDate(t.start_date)}</strong></div>`,
        captainName ? `<div class="col-auto"><span class="text-muted small">Captain</span><br><strong><i class="bi bi-crown-fill text-warning me-1"></i>${captainName}</strong></div>` : "",
        t.registration_deadline ? `<div class="col-auto"><span class="text-muted small">Reg. Deadline</span><br><strong>${_fmtDate(t.registration_deadline)}</strong></div>` : "",
        t.website_url ? `<div class="col-auto"><span class="text-muted small">Website</span><br><a href="${t.website_url}" target="_blank" rel="noopener">Link <i class="bi bi-box-arrow-up-right"></i></a></div>` : "",
        t.notes ? `<div class="col-12"><span class="text-muted small">Notes</span><br>${t.notes}</div>` : "",
    ].filter(Boolean).join("");
    document.getElementById("ext-detail-meta").innerHTML = meta || `<div class="col-12 text-muted">No additional details.</div>`;

    // Admin-only captain select
    const captainSection = document.getElementById("ext-captain-section");
    if (isAdmin) {
        captainSection.style.display = "";
        const capSel = document.getElementById("ext-captain-select");
        capSel.innerHTML = '<option value="">— None —</option>' +
            members.filter(m => m.is_active).map(m =>
                `<option value="${m.id}" ${m.id === t.captain_id ? "selected" : ""}>${m.name}</option>`
            ).join("");
    } else {
        captainSection.style.display = "none";
    }

    // Status buttons
    document.querySelectorAll(".ext-status-btn").forEach(btn => {
        const active = btn.dataset.status === t.status;
        btn.className = `btn btn-sm ext-status-btn ${active ? _statusBtnClass(t.status) : "btn-outline-secondary"}`;
        btn.disabled = !canEdit;
    });

    // Result field
    const resultRow = document.getElementById("ext-result-row");
    if (t.status === "completed" || t.result) {
        resultRow.style.display = "";
        document.getElementById("ext-result-input").value = t.result || "";
        document.getElementById("ext-result-input").disabled = !canEdit;
        document.getElementById("btn-save-result").disabled = !canEdit;
    } else {
        resultRow.style.display = "none";
    }

    // Add player row
    const addPlayerRow = document.querySelector(".ext-add-player-row");
    if (addPlayerRow) addPlayerRow.style.display = canEdit ? "" : "none";

    // Available members for add dropdown
    const addedIds = new Set(t.players.map(p => p.member_id));
    const sel = document.getElementById("ext-add-member-select");
    sel.innerHTML = '<option value="">— Select player —</option>' +
        members.filter(m => !addedIds.has(m.id)).map(m => `<option value="${m.id}">${m.name}</option>`).join("");

    // Players table
    const tbody = document.getElementById("ext-players-tbody");
    const tfoot = document.getElementById("ext-players-tfoot");
    const colRemove = document.getElementById("ext-col-remove");
    if (colRemove) colRemove.textContent = canEdit ? "Remove" : "";

    if (!t.players.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-muted text-center py-3">No players added yet.</td></tr>`;
        tfoot.style.display = "none";
    } else {
        const totalFee = parseFloat(t.registration_fee || 0);
        const totalMatches = t.players.reduce((s, p) => s + p.matches_played, 0);
        const feePerMatch = totalMatches ? totalFee / totalMatches : 0;
        const paidCount = t.players.filter(p => p.paid).length;

        tbody.innerHTML = t.players.map(p => {
            const isCaptain = t.captain_id === p.member_id;
            const nameCell = `${p.member.name}${isCaptain ? ' <i class="bi bi-crown-fill text-warning ms-1" title="Captain"></i>' : ""}`;

            const matchesCell = canEdit
                ? `<input type="number" min="0" value="${p.matches_played}"
                     class="form-control form-control-sm d-inline-block text-center matches-inline"
                     style="width:65px;border:1px solid transparent;background:transparent"
                     onfocus="this.style.borderColor='#dee2e6'"
                     onblur="this.style.borderColor='transparent'; window._extInlineEditMatches(${p.id}, this)"
                     onkeydown="if(event.key==='Enter'){this.blur()}" />`
                : p.matches_played;

            const paidCell = canEdit
                ? `<button class="btn btn-sm ${p.paid ? "btn-success" : "btn-outline-secondary"}"
                     onclick="window._extTogglePaid(${p.id})" title="${p.paid ? "Mark unpaid" : "Mark paid"}">
                     <i class="bi ${p.paid ? "bi-check-circle-fill" : "bi-circle"}"></i>
                   </button>`
                : `<span class="badge ${p.paid ? "bg-success" : "bg-secondary"}">${p.paid ? "Paid" : "Unpaid"}</span>`;

            const removeCell = canEdit
                ? `<button class="btn btn-sm btn-outline-danger" onclick="window._extRemovePlayer(${p.id})">
                     <i class="bi bi-trash"></i>
                   </button>`
                : "";

            return `
          <tr class="align-middle ${p.paid ? "table-success" : ""}">
            <td>${nameCell}</td>
            <td class="text-center">${matchesCell}</td>
            <td class="text-end fw-semibold">${fmt.currency(p.fee_share ?? 0)}</td>
            <td class="text-center">${paidCell}</td>
            <td class="text-end">${removeCell}</td>
          </tr>`;
        }).join("");

        document.getElementById("ext-total-matches").textContent = totalMatches;
        document.getElementById("ext-total-fee-display").textContent = fmt.currency(totalFee);
        document.getElementById("ext-paid-summary").textContent = `${paidCount}/${t.players.length}`;
        document.getElementById("ext-fee-per-match-label").textContent =
            totalMatches
                ? `€${feePerMatch.toFixed(2)} per match (${fmt.currency(totalFee)} ÷ ${totalMatches} matches)`
                : "Enter a Total Fee in Edit to calculate shares";
        tfoot.style.display = "";
    }

    // Delete button — only for captain/admin, only when all paid
    const delBtn = document.getElementById("btn-delete-ext-tournament");
    delBtn.classList.toggle("d-none", !canEdit || !_allPaid(t));
    delBtn.dataset.id = t.id;

    // Feedback section loads async — does not block the rest of the detail panel
    renderFeedbackSection("external", t);
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
    if (!member_id || isNaN(matches_played) || matches_played < 0) {
        showToast("Select a player and enter a valid number of matches", "error");
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
    if (isNaN(matches_played) || matches_played < 0 || matches_played === p?.matches_played) return;
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

async function onSaveCaptain() {
    const captain_id = parseInt(document.getElementById("ext-captain-select").value) || null;
    try {
        await apiFetch(`/ext-tournaments/${selectedId}/captain`, {
            method: "PATCH",
            body: JSON.stringify({ captain_id }),
        });
        showToast(captain_id ? "Captain assigned" : "Captain cleared");
        await refreshTournament(selectedId);
    } catch (err) {
        showToast(err.message, "error");
    }
}

window._extRemovePlayer = async (pid) => {
    if (!confirm("Remove this player from the tournament?")) return;
    try {
        await apiFetch(`/ext-tournaments/${selectedId}/players/${pid}`, { method: "DELETE" });
        await refreshTournament(selectedId);
    } catch (err) {
        showToast(err.message, "error");
    }
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
    return `<div class="d-flex gap-1 my-1" id="${prefix}star-picker" data-initial="${rating || 0}">
        ${Array.from({ length: 5 }, (_, i) =>
            `<i class="bi bi-star-fill fs-5 star-btn ${i < (rating || 0) ? "text-warning" : "text-muted"}" data-val="${i + 1}" style="cursor:pointer"></i>`
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
               ${_stars(captainFb.my_rating, true, "captain-")}
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
        let selected = parseInt(picker.dataset.initial || "0") || 0;
        const stars = picker.querySelectorAll(".star-btn");
        const _setStars = (upTo) => stars.forEach((x, i) => {
            x.classList.toggle("text-warning", i < upTo);
            x.classList.toggle("text-muted", i >= upTo);
        });
        stars.forEach(s => {
            s.addEventListener("mouseover", () => _setStars(parseInt(s.dataset.val)));
            s.addEventListener("mouseout",  () => _setStars(selected));
            s.addEventListener("click",     () => { selected = parseInt(s.dataset.val); _setStars(selected); });
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
    stars.forEach((s, i) => {
        s.classList.toggle("text-warning", i < selected);
        s.classList.toggle("text-muted", i >= selected);
    });
    playerFbModal.show();
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
