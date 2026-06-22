import { apiFetch, showToast } from "/js/api.js";

let polls = [];
let isAdmin = false;
let _optIdx = 0;
const _selectedOption = {};

export async function init() {
    const user = JSON.parse(localStorage.getItem("ucc_user") || "null");
    isAdmin = user?.role === "admin" || user?.role === "root";
    if (isAdmin) {
        document.getElementById("btn-create-poll").classList.remove("d-none");
    }
    _resetOptions();
    await load();
}

async function load() {
    try {
        polls = await apiFetch("/polls");
    } catch (e) {
        document.getElementById("polls-container").innerHTML =
            `<div class="alert alert-danger">${e.message}</div>`;
        return;
    }
    renderSummary();
    renderAll();
}

function renderSummary() {
    const open   = polls.filter(p => !p.is_closed).length;
    const voted  = polls.filter(p => p.has_voted).length;
    const closed = polls.filter(p => p.is_closed).length;
    document.getElementById("poll-summary").innerHTML = `
        <span class="badge bg-secondary fs-6 fw-normal">${polls.length} poll${polls.length !== 1 ? "s" : ""}</span>
        ${open   ? `<span class="badge bg-success  fs-6 fw-normal">${open} open</span>` : ""}
        ${voted  ? `<span class="badge bg-primary  fs-6 fw-normal">${voted} voted</span>` : ""}
        ${closed ? `<span class="badge bg-secondary fs-6 fw-normal">${closed} closed</span>` : ""}`;
}

function renderAll() {
    const c = document.getElementById("polls-container");
    if (!polls.length) {
        c.innerHTML = `
            <div class="card"><div class="card-body text-center text-muted py-5">
              <i class="bi bi-ui-checks-grid" style="font-size:2.5rem"></i>
              <div class="mt-2">No polls yet.${isAdmin ? " Use <strong>Create Poll</strong> to get started." : ""}</div>
            </div></div>`;
        return;
    }
    c.innerHTML = polls.map(pollCard).join("");
}

function pollCard(p) {
    const closed = p.is_closed;
    const statusBadge = closed
        ? `<span class="badge bg-secondary"><i class="bi bi-lock me-1"></i>Closed</span>`
        : `<span class="badge bg-success"><i class="bi bi-circle-fill me-1" style="font-size:.5rem"></i>Open</span>`;
    const anonBadge = p.is_anonymous
        ? `<span class="badge bg-dark"><i class="bi bi-incognito me-1"></i>Anonymous</span>`
        : `<span class="badge bg-light text-dark border"><i class="bi bi-eye me-1"></i>Public</span>`;
    const multipleBadge = p.allow_multiple
        ? `<span class="badge bg-info text-dark"><i class="bi bi-check2-square me-1"></i>Multi-select</span>`
        : "";

    const deadlineHtml = p.closes_at && !closed
        ? `<span class="text-muted small"><i class="bi bi-clock me-1"></i>Closes ${new Date(p.closes_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>`
        : "";

    const createdHtml = p.created_by
        ? `<span class="text-muted small"><i class="bi bi-person me-1"></i>${p.created_by}</span>`
        : "";

    const votesHtml = `<span class="text-muted small"><i class="bi bi-people me-1"></i>${p.total_votes} vote${p.total_votes !== 1 ? "s" : ""}</span>`;

    const adminBtns = isAdmin ? `
        <div class="d-flex gap-2 flex-shrink-0 no-print">
            ${!closed ? `<button class="btn btn-sm btn-outline-warning" onclick="window._pollClose(${p.id})" title="Close poll"><i class="bi bi-lock me-1"></i>Close</button>` : ""}
            <button class="btn btn-sm btn-outline-danger" onclick="window._pollDelete(${p.id})" title="Delete poll"><i class="bi bi-trash"></i></button>
        </div>` : "";

    let body;
    if (!p.has_voted && !closed) {
        const voteHint = p.is_anonymous
            ? `<i class="bi bi-incognito me-1"></i>Anonymous poll — nobody can see your choice.`
            : `<i class="bi bi-eye me-1"></i>Public poll — results are revealed after you vote.`;
        const optIcon = p.allow_multiple ? "bi-square" : "bi-circle";
        body = `
            <p class="text-muted small mb-2">${voteHint}</p>
            ${p.allow_multiple ? `<p class="text-muted small mb-3"><i class="bi bi-check2-square me-1"></i>Multi-select — choose all that apply.</p>` : ""}
            <div class="d-flex flex-column gap-2" id="poll-opts-${p.id}">
                ${p.options.map(o => `
                    <button type="button" class="poll-opt-btn"
                        onclick="window._pollSelect(${p.id}, ${o.id}, this, ${p.allow_multiple})">
                        <i class="bi ${optIcon} text-muted flex-shrink-0"></i>
                        <span class="flex-grow-1">${escHtml(o.text)}</span>
                    </button>`).join("")}
            </div>
            <div class="mt-3">
                <button class="btn btn-primary px-4" id="poll-vote-btn-${p.id}"
                    onclick="window._pollVote(${p.id})" disabled>
                    <i class="bi bi-check2 me-1"></i>Cast Vote
                </button>
                <span class="text-muted small ms-2">${p.allow_multiple ? "Select at least one option above" : "Select an option above"}</span>
            </div>`;
    } else {
        const maxVotes = p.options.reduce((m, o) => Math.max(m, o.vote_count ?? 0), 0);
        body = `
            <div class="mb-3 small ${p.has_voted && !closed ? "text-success" : "text-muted"}">
                ${p.has_voted && !closed
                    ? `<i class="bi bi-check-circle-fill me-1"></i>You voted — results revealed.${p.is_anonymous ? " Your choice is private." : ""}`
                    : `<i class="bi bi-lock me-1"></i>Poll closed — final results:`}
            </div>
            <div class="d-flex flex-column gap-3">
                ${p.options.map(o => {
                    const isMyVote  = (p.voted_option_ids || []).includes(o.id);
                    const isWinner  = closed && (o.vote_count ?? 0) === maxVotes && maxVotes > 0;
                    const barColor  = isMyVote ? "bg-primary" : (isWinner ? "bg-warning" : "bg-success");
                    return `
                    <div>
                        <div class="d-flex justify-content-between align-items-center mb-1">
                            <span class="${isMyVote ? "fw-semibold text-primary" : isWinner && closed ? "fw-semibold" : ""}">
                                ${isWinner && closed ? '<i class="bi bi-trophy-fill text-warning me-1"></i>' : ""}
                                ${escHtml(o.text)}
                                ${isMyVote ? '<span class="badge bg-primary ms-1" style="font-size:.65rem">Your vote</span>' : ""}
                            </span>
                            <span class="text-muted small ms-2 flex-shrink-0">
                                ${o.vote_count} vote${o.vote_count !== 1 ? "s" : ""} · ${o.pct}%
                            </span>
                        </div>
                        <div class="poll-result-bar-bg">
                            <div class="poll-result-bar ${barColor}" style="width:${o.pct}%"></div>
                        </div>
                    </div>`;
                }).join("")}
            </div>`;
    }

    return `
    <div class="card poll-card mb-3" id="poll-card-${p.id}">
        <div class="card-body">
            <div class="d-flex align-items-start gap-2 flex-wrap mb-2">
                <div class="flex-grow-1 min-width-0">
                    <h5 class="mb-1">${escHtml(p.title)}</h5>
                    <div class="d-flex flex-wrap gap-3 align-items-center">
                        ${statusBadge}
                        ${anonBadge}
                        ${multipleBadge}
                        ${votesHtml}
                        ${createdHtml}
                        ${deadlineHtml}
                    </div>
                </div>
                ${adminBtns}
            </div>
            ${p.description ? `<p class="text-muted small mb-3">${escHtml(p.description)}</p>` : ""}
            ${body}
        </div>
    </div>`;
}

function replaceCard(pollId, updated) {
    const old = document.getElementById(`poll-card-${pollId}`);
    if (old) {
        old.insertAdjacentHTML("afterend", pollCard(updated));
        old.remove();
    }
}

function escHtml(s) {
    return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ── Voting ─────────────────────────────────────────────────────────────────────

window._pollSelect = (pollId, optId, btn, allowMultiple = false) => {
    if (allowMultiple) {
        if (!Array.isArray(_selectedOption[pollId])) _selectedOption[pollId] = [];
        const arr = _selectedOption[pollId];
        const idx = arr.indexOf(optId);
        if (idx === -1) {
            arr.push(optId);
            btn.classList.add("selected");
            btn.querySelector(".bi").className = "bi bi-check-square-fill text-primary flex-shrink-0";
        } else {
            arr.splice(idx, 1);
            btn.classList.remove("selected");
            btn.querySelector(".bi").className = "bi bi-square text-muted flex-shrink-0";
        }
    } else {
        _selectedOption[pollId] = [optId];
        document.querySelectorAll(`#poll-opts-${pollId} .poll-opt-btn`).forEach(b => {
            b.classList.remove("selected");
            b.querySelector(".bi").className = "bi bi-circle text-muted flex-shrink-0";
        });
        btn.classList.add("selected");
        btn.querySelector(".bi").className = "bi bi-check-circle-fill text-primary flex-shrink-0";
    }
    const voteBtn = document.getElementById(`poll-vote-btn-${pollId}`);
    const hasSelection = Array.isArray(_selectedOption[pollId]) && _selectedOption[pollId].length > 0;
    if (voteBtn) {
        voteBtn.disabled = !hasSelection;
        if (hasSelection) voteBtn.nextElementSibling?.remove();
    }
};

window._pollVote = async (pollId) => {
    const selection = _selectedOption[pollId];
    const option_ids = Array.isArray(selection) ? selection : (selection ? [selection] : []);
    if (!option_ids.length) return;
    const btn = document.getElementById(`poll-vote-btn-${pollId}`);
    if (btn) { btn.disabled = true; btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Submitting…`; }
    try {
        const updated = await apiFetch(`/polls/${pollId}/vote`, {
            method: "POST",
            body: JSON.stringify({ option_ids }),
        });
        const idx = polls.findIndex(p => p.id === pollId);
        if (idx !== -1) polls[idx] = updated;
        replaceCard(pollId, updated);
        renderSummary();
        showToast("Vote cast — results are now visible");
    } catch (e) {
        showToast(e.message, "error");
        if (btn) { btn.disabled = false; btn.innerHTML = `<i class="bi bi-check2 me-1"></i>Cast Vote`; }
    }
};

// ── Admin actions ──────────────────────────────────────────────────────────────

window._pollClose = async (pollId) => {
    if (!confirm("Close this poll? Members will no longer be able to vote.")) return;
    try {
        const updated = await apiFetch(`/polls/${pollId}/close`, { method: "PATCH" });
        const idx = polls.findIndex(p => p.id === pollId);
        if (idx !== -1) polls[idx] = updated;
        replaceCard(pollId, updated);
        renderSummary();
        showToast("Poll closed");
    } catch (e) {
        showToast(e.message, "error");
    }
};

window._pollDelete = async (pollId) => {
    if (!confirm("Delete this poll permanently? All votes will be lost.")) return;
    try {
        await apiFetch(`/polls/${pollId}`, { method: "DELETE" });
        polls = polls.filter(p => p.id !== pollId);
        document.getElementById(`poll-card-${pollId}`)?.remove();
        renderSummary();
        if (!polls.length) renderAll();
        showToast("Poll deleted");
    } catch (e) {
        showToast(e.message, "error");
    }
};

// ── Create Poll ────────────────────────────────────────────────────────────────

function _resetOptions() {
    _optIdx = 0;
    const list = document.getElementById("poll-options-list");
    if (!list) return;
    list.innerHTML = "";
    _addOptionRow();
    _addOptionRow();
}

function _addOptionRow() {
    const list = document.getElementById("poll-options-list");
    if (!list) return;
    const i = _optIdx++;
    const div = document.createElement("div");
    div.className = "input-group mb-2";
    div.id = `poll-opt-row-${i}`;
    div.innerHTML = `
        <span class="input-group-text text-muted">${i + 1}</span>
        <input type="text" class="form-control" placeholder="Option ${i + 1}" />
        <button type="button" class="btn btn-outline-danger"
            onclick="document.getElementById('poll-opt-row-${i}').remove()">
            <i class="bi bi-x"></i>
        </button>`;
    list.appendChild(div);
}

window._pollAddOption = _addOptionRow;

window._pollSubmit = async () => {
    const title = (document.getElementById("poll-title").value || "").trim();
    const description = (document.getElementById("poll-description").value || "").trim() || null;
    const closesAtRaw = document.getElementById("poll-closes-at").value;
    const errEl = document.getElementById("create-poll-error");
    errEl.classList.add("d-none");

    if (!title) {
        errEl.textContent = "Poll question is required.";
        errEl.classList.remove("d-none");
        return;
    }

    const inputs = document.querySelectorAll("#poll-options-list input[type=text]");
    const options = Array.from(inputs)
        .map((inp, i) => ({ text: (inp.value || "").trim(), position: i }))
        .filter(o => o.text);

    if (options.length < 2) {
        errEl.textContent = "Please provide at least 2 options.";
        errEl.classList.remove("d-none");
        return;
    }

    const closes_at      = closesAtRaw ? new Date(closesAtRaw).toISOString() : null;
    const is_anonymous   = document.getElementById("poll-is-anonymous")?.checked ?? false;
    const allow_multiple = document.getElementById("poll-allow-multiple")?.checked ?? false;

    try {
        const created = await apiFetch("/polls", {
            method: "POST",
            body: JSON.stringify({ title, description, closes_at, is_anonymous, allow_multiple, options }),
        });
        polls.unshift(created);
        bootstrap.Modal.getInstance(document.getElementById("createPollModal"))?.hide();
        document.getElementById("poll-title").value = "";
        document.getElementById("poll-description").value = "";
        document.getElementById("poll-closes-at").value = "";
        _resetOptions();
        renderSummary();
        renderAll();
        showToast("Poll created");
    } catch (e) {
        errEl.textContent = e.message;
        errEl.classList.remove("d-none");
    }
};

// Reset options list and anon toggle when modal is shown
document.addEventListener("shown.bs.modal", (e) => {
    if (e.target.id !== "createPollModal") return;
    _resetOptions();
    const chk = document.getElementById("poll-is-anonymous");
    if (chk) chk.checked = false;
    _updateAnonHint(false);
    const multiChk = document.getElementById("poll-allow-multiple");
    if (multiChk) multiChk.checked = false;
});

document.addEventListener("change", (e) => {
    if (e.target.id === "poll-is-anonymous") _updateAnonHint(e.target.checked);
});

function _updateAnonHint(isAnon) {
    document.getElementById("poll-anon-hint-on")?.classList.toggle("d-none", !isAnon);
    document.getElementById("poll-anon-hint-off")?.classList.toggle("d-none", isAnon);
}
