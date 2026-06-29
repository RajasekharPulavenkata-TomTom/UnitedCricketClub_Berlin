import { apiFetch, fmt } from "/js/api.js";

function getRole() {
    try { return JSON.parse(atob(localStorage.getItem("ucc_token").split(".")[1])).role; }
    catch { return null; }
}
const isAdmin = () => ["manager", "developer"].includes(getRole());

function getUserId() {
    try { return JSON.parse(atob(localStorage.getItem("ucc_token").split(".")[1])).sub; }
    catch { return null; }
}

const STATUS_BADGE  = { pending: "badge-pending", discussed: "badge-discussed", deferred: "badge-deferred", dropped: "badge-dropped" };
const STATUS_LABEL  = { pending: "Pending", discussed: "Discussed ✓", deferred: "Deferred →", dropped: "Dropped ✗" };
const STATUS_ICON   = { upcoming: "📅", in_progress: "🟡", completed: "✅" };
const STATUS_COLORS = { upcoming: "meeting-upcoming", in_progress: "meeting-inprogress", completed: "meeting-completed" };

let _activeMeetingId = null;  // used by raise-item modal

// ── Main init ─────────────────────────────────────────────────────────────────

export async function init() {
    if (isAdmin()) {
        document.getElementById("btn-create-meeting").classList.remove("d-none");
        document.getElementById("btn-meet-submit").addEventListener("click", submitCreate);
    }
    document.getElementById("btn-item-submit").addEventListener("click", submitRaiseItem);
    await loadMeetings();
}

async function loadMeetings() {
    const loadEl   = document.getElementById("meeting-loading");
    const emptyEl  = document.getElementById("meeting-empty");
    const activeW  = document.getElementById("meeting-active-wrap");
    const historyW = document.getElementById("meeting-history-wrap");

    loadEl.classList.remove("d-none");
    activeW.innerHTML  = "";
    historyW.innerHTML = "";
    emptyEl.classList.add("d-none");

    let meetings;
    try {
        meetings = await apiFetch("/meetings");
    } catch (err) {
        loadEl.classList.add("d-none");
        activeW.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
        return;
    }
    loadEl.classList.add("d-none");

    if (!meetings.length) { emptyEl.classList.remove("d-none"); return; }

    const active  = meetings.find(m => m.status !== "completed");
    const past    = meetings.filter(m => m.status === "completed");
    const refresh = () => loadMeetings();

    if (active) activeW.appendChild(renderActiveMeeting(active, refresh));

    if (past.length) {
        const h = document.createElement("h5");
        h.className = "fw-semibold text-muted mt-4 mb-3";
        h.innerHTML = `<i class="bi bi-clock-history me-2"></i>Past Meetings`;
        historyW.appendChild(h);
        past.forEach(m => historyW.appendChild(renderHistoryCard(m, refresh)));
    }

    if (!active && !past.length) emptyEl.classList.remove("d-none");
}

// ── Active meeting (upcoming / in_progress) ───────────────────────────────────

function renderActiveMeeting(m, onAction) {
    const admin = isAdmin();
    const wrap  = document.createElement("div");

    // Header card
    const header = document.createElement("div");
    header.className = `p-3 mb-3 rounded-3 ${STATUS_COLORS[m.status]}`;
    header.innerHTML = `
      <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
        <div>
          <div class="fw-bold fs-5">${STATUS_ICON[m.status]} ${m.title}</div>
          <div class="text-muted small mt-1"><i class="bi bi-calendar3 me-1"></i>${fmt.date(m.meeting_date)}
            &nbsp;·&nbsp; ${m.items.length} agenda item${m.items.length !== 1 ? "s" : ""}
          </div>
        </div>
        <div class="d-flex gap-2 flex-wrap">
          ${admin && m.status === "upcoming"
              ? `<button class="btn btn-sm btn-warning" id="btn-start-${m.id}"><i class="bi bi-play-fill me-1"></i>Start Meeting</button>`
              : ""}
          ${admin && m.status === "in_progress"
              ? `<button class="btn btn-sm btn-success" id="btn-complete-${m.id}"><i class="bi bi-check2-all me-1"></i>Complete Meeting</button>`
              : ""}
          ${admin
              ? `<button class="btn btn-sm btn-outline-danger" id="btn-del-meet-${m.id}"><i class="bi bi-trash"></i></button>`
              : ""}
        </div>
      </div>`;
    wrap.appendChild(header);

    // Agenda items
    if (m.items.length) {
        m.items.forEach(item => wrap.appendChild(renderAgendaItem(item, m, onAction)));
    } else {
        const empty = document.createElement("p");
        empty.className = "text-muted small text-center py-3";
        empty.textContent = "No agenda items yet — be the first to raise one!";
        wrap.appendChild(empty);
    }

    // Raise item button (available for upcoming and in_progress)
    if (m.status !== "completed") {
        const raiseBtn = document.createElement("button");
        raiseBtn.className = "btn btn-outline-primary btn-sm mt-3";
        raiseBtn.innerHTML = `<i class="bi bi-hand-index-thumb me-1"></i>Raise Agenda Item`;
        raiseBtn.addEventListener("click", () => {
            _activeMeetingId = m.id;
            document.getElementById("item-title").value = "";
            document.getElementById("item-description").value = "";
            document.getElementById("raise-item-error").classList.add("d-none");
            new bootstrap.Modal(document.getElementById("raiseItemModal")).show();
        });
        wrap.appendChild(raiseBtn);
    }

    // Wire admin buttons
    const startBtn = wrap.querySelector(`#btn-start-${m.id}`);
    if (startBtn) {
        startBtn.addEventListener("click", async () => {
            if (!confirm("Start the meeting? Members can still raise items during the meeting.")) return;
            startBtn.disabled = true;
            try { onAction(await apiFetch(`/meetings/${m.id}/start`, { method: "PATCH" })); }
            catch (err) { startBtn.disabled = false; alert(err.message); }
        });
    }

    const completeBtn = wrap.querySelector(`#btn-complete-${m.id}`);
    if (completeBtn) {
        completeBtn.addEventListener("click", async () => {
            if (!confirm("Mark the meeting as completed? Minutes will be published to all members.")) return;
            completeBtn.disabled = true;
            try { onAction(await apiFetch(`/meetings/${m.id}/complete`, { method: "PATCH" })); }
            catch (err) { completeBtn.disabled = false; alert(err.message); }
        });
    }

    const delMeetBtn = wrap.querySelector(`#btn-del-meet-${m.id}`);
    if (delMeetBtn) {
        delMeetBtn.addEventListener("click", async () => {
            if (!confirm("Delete this meeting and all its agenda items?")) return;
            try {
                await apiFetch(`/meetings/${m.id}`, { method: "DELETE" });
                onAction(null);
            } catch (err) { alert(err.message); }
        });
    }

    return wrap;
}

// ── Single agenda item ────────────────────────────────────────────────────────

function renderAgendaItem(item, meeting, onAction) {
    const admin   = isAdmin();
    const userId  = getUserId();
    const isOwner = String(item.raised_by_id) === String(userId);
    const inProgress = meeting.status === "in_progress";
    const canEdit = (isOwner && meeting.status === "upcoming") || (admin && meeting.status !== "completed");

    const card = document.createElement("div");
    card.className = `agenda-item mb-2 status-${item.status}`;

    // Header row
    const headerRow = document.createElement("div");
    headerRow.className = "d-flex align-items-start justify-content-between gap-2 flex-wrap";
    headerRow.innerHTML = `
      <div class="flex-grow-1">
        <div class="fw-semibold">${item.title}</div>
        ${item.description ? `<div class="text-muted small mt-1">${item.description}</div>` : ""}
        <div class="text-muted mt-1" style="font-size:.75rem">
          Raised by <strong>${item.raised_by}</strong>
        </div>
      </div>
      <div class="d-flex align-items-center gap-2 flex-shrink-0 flex-wrap">
        <span class="badge rounded-pill px-2 ${STATUS_BADGE[item.status]}">${STATUS_LABEL[item.status]}</span>
        ${canEdit
            ? `<button class="btn btn-outline-secondary btn-sm py-0 px-1" style="font-size:.75rem" data-edit-item="${item.id}" title="Edit">
                <i class="bi bi-pencil"></i></button>`
            : ""}
        ${(isOwner || admin) && meeting.status !== "completed"
            ? `<button class="btn btn-outline-danger btn-sm py-0 px-1" style="font-size:.75rem" data-del-item="${item.id}">
                <i class="bi bi-trash"></i></button>`
            : ""}
      </div>`;
    card.appendChild(headerRow);

    // Edit item wiring
    const editItemBtn = card.querySelector(`[data-edit-item="${item.id}"]`);
    if (editItemBtn) {
        editItemBtn.addEventListener("click", () => {
            const contentDiv = headerRow.querySelector(".flex-grow-1");
            const original = contentDiv.innerHTML;
            contentDiv.innerHTML = `
              <input class="form-control form-control-sm mb-1" id="edit-title-${item.id}" value="${item.title.replace(/"/g, '&quot;')}" />
              <textarea class="form-control form-control-sm mb-1" id="edit-desc-${item.id}" rows="2" placeholder="Details (optional)">${item.description || ""}</textarea>
              <div class="d-flex gap-1">
                <button class="btn btn-sm btn-primary" id="edit-save-${item.id}"><i class="bi bi-floppy me-1"></i>Save</button>
                <button class="btn btn-sm btn-secondary" id="edit-cancel-${item.id}">Cancel</button>
              </div>`;
            editItemBtn.disabled = true;

            card.querySelector(`#edit-cancel-${item.id}`).addEventListener("click", () => {
                contentDiv.innerHTML = original;
                editItemBtn.disabled = false;
            });

            card.querySelector(`#edit-save-${item.id}`).addEventListener("click", async () => {
                const newTitle = card.querySelector(`#edit-title-${item.id}`).value.trim();
                const newDesc  = card.querySelector(`#edit-desc-${item.id}`).value.trim();
                if (!newTitle) { alert("Title is required."); return; }
                const saveBtn = card.querySelector(`#edit-save-${item.id}`);
                saveBtn.disabled = true;
                try {
                    const updated = await apiFetch(`/meetings/${meeting.id}/items/${item.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ title: newTitle, description: newDesc || null }),
                    });
                    onAction(updated);
                } catch (err) {
                    saveBtn.disabled = false;
                    alert(err.message || "Failed to save");
                }
            });
        });
    }

    // Second button
    if (meeting.status !== "completed") {
        const secondRow = document.createElement("div");
        secondRow.className = "mt-2 d-flex align-items-center gap-2";

        if (!isOwner) {
            const secondBtn = document.createElement("button");
            secondBtn.className = `btn-second${item.has_seconded ? " active" : ""}`;
            secondBtn.innerHTML = `<i class="bi bi-hand-thumbs-up${item.has_seconded ? "-fill" : ""}"></i> ${item.seconds_count} Second${item.seconds_count !== 1 ? "s" : ""}`;
            secondBtn.addEventListener("click", async () => {
                secondBtn.disabled = true;
                try {
                    const method = item.has_seconded ? "DELETE" : "POST";
                    const updated = await apiFetch(`/meetings/${meeting.id}/items/${item.id}/second`, { method });
                    onAction(updated);
                } catch (err) {
                    secondBtn.disabled = false;
                    alert(err.message || "Failed");
                }
            });
            secondRow.appendChild(secondBtn);
        } else {
            secondRow.innerHTML = `<span class="text-muted small">${item.seconds_count} second${item.seconds_count !== 1 ? "s" : ""}</span>`;
        }
        card.appendChild(secondRow);
    }

    // Decision panel (admin only, during/after meeting)
    if (admin && inProgress) {
        const panel = document.createElement("div");
        panel.className = "mt-3 pt-2 border-top";

        const statusSel = document.createElement("select");
        statusSel.className = "form-select form-select-sm mb-2";
        statusSel.style.maxWidth = "200px";
        ["pending", "discussed", "deferred", "dropped"].forEach(s => {
            const opt = document.createElement("option");
            opt.value = s; opt.textContent = STATUS_LABEL[s];
            if (s === item.status) opt.selected = true;
            statusSel.appendChild(opt);
        });

        const decisionTA = document.createElement("textarea");
        decisionTA.className = "form-control form-control-sm mb-2";
        decisionTA.rows = 2;
        decisionTA.placeholder = "Decision or action agreed…";
        decisionTA.value = item.decision || "";

        const saveBtn = document.createElement("button");
        saveBtn.className = "btn btn-sm btn-primary";
        saveBtn.innerHTML = `<i class="bi bi-floppy me-1"></i>Save`;
        saveBtn.addEventListener("click", async () => {
            saveBtn.disabled = true;
            try {
                const updated = await apiFetch(`/meetings/${meeting.id}/items/${item.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ status: statusSel.value, decision: decisionTA.value }),
                });
                onAction(updated);
            } catch (err) {
                saveBtn.disabled = false;
                alert(err.message || "Failed to save");
            }
        });

        panel.appendChild(statusSel);
        panel.appendChild(decisionTA);
        panel.appendChild(saveBtn);
        card.appendChild(panel);
    }

    // Show recorded decision (non-admin or completed)
    if (item.decision && (!admin || !inProgress)) {
        const dec = document.createElement("div");
        dec.className = "mt-2 pt-2 border-top small";
        dec.innerHTML = `<i class="bi bi-check2-circle me-1 text-success"></i><strong>Decision:</strong> ${item.decision}`;
        card.appendChild(dec);
    }

    // Delete item wiring
    const delItemBtn = card.querySelector(`[data-del-item="${item.id}"]`);
    if (delItemBtn) {
        delItemBtn.addEventListener("click", async () => {
            if (!confirm("Remove this agenda item?")) return;
            try {
                const updated = await apiFetch(`/meetings/${meeting.id}/items/${item.id}`, { method: "DELETE" });
                onAction(updated ?? null);
                if (!updated) loadMeetings();
            } catch (err) { alert(err.message); }
        });
    }

    return card;
}

// ── Completed meeting (minutes) ───────────────────────────────────────────────

function renderHistoryCard(m, onAction) {
    const admin = isAdmin();
    const card  = document.createElement("div");
    card.className = "card history-card mb-3";

    const body = document.createElement("div");
    body.className = "card-body p-3";
    card.appendChild(body);

    body.innerHTML = `
      <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-1">
        <div class="fw-bold">✅ ${m.title}</div>
        <span class="text-muted small">${fmt.date(m.meeting_date)}</span>
      </div>
      <div class="text-muted small mb-3">${m.items.length} item${m.items.length !== 1 ? "s" : ""}</div>`;

    // Collapsible minutes
    const collapseId = `minutes-${m.id}`;
    const toggle = document.createElement("button");
    toggle.className = "btn btn-sm btn-outline-secondary mb-2";
    toggle.setAttribute("data-bs-toggle", "collapse");
    toggle.setAttribute("data-bs-target", `#${collapseId}`);
    toggle.innerHTML = `<i class="bi bi-chevron-down me-1"></i>View Minutes`;
    body.appendChild(toggle);

    const collapse = document.createElement("div");
    collapse.className = "collapse";
    collapse.id = collapseId;

    if (m.items.length) {
        m.items.forEach(item => {
            const row = document.createElement("div");
            row.className = `minutes-item ${item.status}`;
            row.innerHTML = `
              <div class="d-flex align-items-start gap-2 mb-1">
                <span class="badge rounded-pill px-2 ${STATUS_BADGE[item.status]}">${STATUS_LABEL[item.status]}</span>
                <span class="fw-semibold small">${item.title}</span>
              </div>
              ${item.description ? `<div class="text-muted small">${item.description}</div>` : ""}
              ${item.decision
                  ? `<div class="small mt-1"><i class="bi bi-check2-circle text-success me-1"></i><strong>Decision:</strong> ${item.decision}</div>`
                  : `<div class="small text-muted mt-1">No decision recorded.</div>`}`;
            collapse.appendChild(row);
        });
    } else {
        collapse.innerHTML = `<p class="text-muted small">No agenda items were recorded.</p>`;
    }
    body.appendChild(collapse);

    if (admin) {
        const delBtn = document.createElement("button");
        delBtn.className = "btn btn-sm btn-outline-danger mt-2";
        delBtn.innerHTML = `<i class="bi bi-trash me-1"></i>Delete`;
        delBtn.addEventListener("click", async () => {
            if (!confirm(`Delete minutes for "${m.title}"?`)) return;
            try {
                await apiFetch(`/meetings/${m.id}`, { method: "DELETE" });
                onAction(null);
            } catch (err) { alert(err.message); }
        });
        body.appendChild(delBtn);
    }

    return card;
}

// ── Create meeting form ───────────────────────────────────────────────────────

async function submitCreate() {
    const btn   = document.getElementById("btn-meet-submit");
    const errEl = document.getElementById("create-meet-error");
    const title = document.getElementById("meet-title").value.trim();
    const date  = document.getElementById("meet-date").value;

    errEl.classList.add("d-none");
    if (!title) { errEl.textContent = "Title is required."; errEl.classList.remove("d-none"); return; }
    if (!date)  { errEl.textContent = "Date is required.";  errEl.classList.remove("d-none"); return; }

    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Scheduling…`;
    try {
        await apiFetch("/meetings", { method: "POST", body: JSON.stringify({ title, meeting_date: date }) });
        bootstrap.Modal.getInstance(document.getElementById("createMeetingModal")).hide();
        document.getElementById("meet-title").value = "";
        document.getElementById("meet-date").value  = "";
        await loadMeetings();
    } catch (err) {
        errEl.textContent = err.message || "Failed to schedule meeting";
        errEl.classList.remove("d-none");
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="bi bi-send me-1"></i>Schedule`;
    }
}

// ── Raise agenda item form ────────────────────────────────────────────────────

async function submitRaiseItem() {
    const btn   = document.getElementById("btn-item-submit");
    const errEl = document.getElementById("raise-item-error");
    const title = document.getElementById("item-title").value.trim();
    const desc  = document.getElementById("item-description").value.trim();

    errEl.classList.add("d-none");
    if (!title) { errEl.textContent = "Topic is required."; errEl.classList.remove("d-none"); return; }
    if (!_activeMeetingId) return;

    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Raising…`;
    try {
        await apiFetch(`/meetings/${_activeMeetingId}/items`, {
            method: "POST",
            body: JSON.stringify({ title, description: desc || null }),
        });
        bootstrap.Modal.getInstance(document.getElementById("raiseItemModal")).hide();
        await loadMeetings();
    } catch (err) {
        errEl.textContent = err.message || "Failed to raise item";
        errEl.classList.remove("d-none");
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="bi bi-send me-1"></i>Raise Item`;
    }
}
