import { apiFetch } from "/js/api.js";

// ── Deadline modal state ──────────────────────────────────────────────────────
let _deadlineElId = null;
let _deadlineOnAction = null;
let _deadlineBody = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name) {
    return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

function fmtDate(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

function getRole() {
    try { return JSON.parse(atob(localStorage.getItem("ucc_token").split(".")[1])).role; }
    catch { return null; }
}
const isAdmin = () => ["admin", "root"].includes(getRole());
const isRoot  = () => getRole() === "root";

// ── Phase stepper ─────────────────────────────────────────────────────────────

function stepperHtml(status) {
    const steps = [
        { key: "nominating", label: "🙋 Nominations" },
        { key: "voting",     label: "🗳️ Voting" },
        { key: "closed",     label: "🔒 Closed" },
    ];
    const idx = steps.findIndex(s => s.key === status);
    return `<div class="phase-stepper">
        ${steps.map((s, i) => {
            const cls = i < idx ? "done" : i === idx ? "active" : "";
            return `<div class="phase-step ${cls}">${s.label}</div>`;
        }).join("")}
    </div>`;
}

// ── Render election card ──────────────────────────────────────────────────────

function renderCard(el, { compact = false, onAction } = {}) {
    const admin  = isAdmin();
    const root   = isRoot();
    const status = el.status;

    const card = document.createElement("div");
    card.className = compact ? "card history-card mb-3" : "card mb-4 shadow-sm";

    const body = document.createElement("div");
    body.className = compact ? "card-body p-3" : "card-body p-4";
    card.appendChild(body);

    // Header
    const seats = el.seats || 3;
    body.innerHTML = `
      ${stepperHtml(status)}
      <div class="d-flex align-items-start justify-content-between gap-2 mb-1 flex-wrap">
        <h5 class="mb-0 fw-bold">${el.title}</h5>
        <span class="badge bg-secondary fw-normal" style="font-size:.78rem">
          <i class="bi bi-people me-1"></i>Electing ${seats} member${seats !== 1 ? "s" : ""}
        </span>
      </div>
      ${el.description ? `<p class="text-muted small mb-3">${el.description}</p>` : ""}`;

    if (status === "nominating") renderNominating(body, el, admin, root, onAction);
    else if (status === "voting") renderVoting(body, el, admin, root, onAction);
    else renderClosed(body, el, root, onAction);

    return card;
}

// ── Condensed charter card (shown during nomination phase) ────────────────────

function charterCardHtml() {
    const pillars = [
        { icon: "bi-compass",            color: "#1e40af", bg: "#dbeafe", label: "Strategic Leadership",      desc: "Structured planning, analytical decisions, mentorship." },
        { icon: "bi-people-fill",        color: "#c2410c", bg: "#ffedd5", label: "People & Culture",          desc: "Belonging, proactive communication, accountability." },
        { icon: "bi-gear-wide-connected",color: "#166534", bg: "#dcfce7", label: "Operational Excellence",    desc: "Delegation, continuous improvement, financial stewardship." },
        { icon: "bi-globe2",             color: "#5b21b6", bg: "#ede9fe", label: "External Relations",        desc: "Inter-club collaboration, cricket advocacy." },
    ];
    return `
      <div class="card mb-3" style="border:1px solid #c7d7ff;border-radius:12px;background:#f8faff">
        <div class="card-body p-3">
          <div class="d-flex align-items-center justify-content-between mb-2 flex-wrap gap-2">
            <span class="fw-semibold" style="color:#1a3a8b"><i class="bi bi-journal-richtext me-1"></i>What the manager role involves</span>
            <a href="#management-charter" class="small text-decoration-none" style="color:#1a3a8b">Read full charter →</a>
          </div>
          <div class="row g-2">
            ${pillars.map(p => `
              <div class="col-6">
                <div class="d-flex align-items-start gap-2 p-2 rounded" style="background:#fff;border:1px solid #e2e8f0">
                  <div style="width:28px;height:28px;border-radius:7px;background:${p.bg};color:${p.color};display:flex;align-items:center;justify-content:center;flex-shrink:0">
                    <i class="bi ${p.icon}" style="font-size:.8rem"></i>
                  </div>
                  <div>
                    <div style="font-size:.78rem;font-weight:600;color:#1e293b">${p.label}</div>
                    <div style="font-size:.72rem;color:#64748b;line-height:1.4">${p.desc}</div>
                  </div>
                </div>
              </div>`).join("")}
          </div>
        </div>
      </div>`;
}

// ── Nominating phase ──────────────────────────────────────────────────────────

function renderNominating(body, el, admin, root, onAction) {
    const seats = el.seats || 3;
    const MIN   = Math.max(2, seats);
    const count = el.nomination_count;

    // Nominees list
    const nomineesHtml = el.nominations.length
        ? el.nominations.map(n => `
            <div class="candidate-card mb-2">
              <div class="c-avatar">${initials(n.member_name)}</div>
              <div class="fw-semibold">${n.member_name}</div>
            </div>`).join("")
        : `<p class="text-muted small">No nominations yet. Be the first!</p>`;

    body.innerHTML += charterCardHtml();

    const deadlineBanner = (() => {
        if (!el.nominations_close_at) return "";
        const closes = new Date(el.nominations_close_at);
        const now    = new Date();
        if (now < closes) {
            return `<div class="alert alert-info py-2 small mb-3">
                <i class="bi bi-clock me-1"></i>
                Nominations close <strong>${closes.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</strong>.
                Voting will open automatically when the deadline passes${count >= MIN ? "" : ` (need ${MIN - count} more nomination${MIN - count !== 1 ? "s" : ""})`}.
            </div>`;
        } else if (count < MIN) {
            return `<div class="alert alert-warning py-2 small mb-3">
                <i class="bi bi-exclamation-triangle me-1"></i>
                Nomination deadline passed. Only ${count} of ${MIN} required nominations received — a root admin must intervene.
            </div>`;
        }
        return "";
    })();

    body.innerHTML += `
      <div class="anon-notice mb-3">
        <i class="bi bi-hand-index-thumb-fill"></i>
        <span>Nomination phase — members can put themselves forward.${el.nominations_close_at ? " Voting opens automatically when the deadline passes." : " Voting opens once the club manager advances the election."}</span>
      </div>
      ${deadlineBanner}
      <div class="d-flex align-items-center justify-content-between mb-2">
        <span class="fw-semibold small text-muted">${count} nomination${count !== 1 ? "s" : ""}</span>
        ${(admin || root) ? `<span class="small text-muted">(need ${MIN} to open voting for ${seats} seat${seats !== 1 ? "s" : ""})</span>` : ""}
      </div>
      <div id="nominees-${el.id}">${nomineesHtml}</div>`;

    // Member actions
    if (!el.has_nominated) {
        const btn = document.createElement("button");
        btn.className = "btn btn-primary mt-3 me-2";
        btn.innerHTML = `<i class="bi bi-hand-index-thumb me-1"></i>Nominate Myself`;
        btn.addEventListener("click", async () => {
            btn.disabled = true;
            btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Nominating…`;
            try {
                const updated = await apiFetch(`/elections/${el.id}/nominate`, { method: "POST" });
                onAction && onAction(updated);
            } catch (err) {
                btn.disabled = false;
                btn.innerHTML = `<i class="bi bi-hand-index-thumb me-1"></i>Nominate Myself`;
                showError(body, err.message || "Failed to nominate");
            }
        });
        body.appendChild(btn);
    } else {
        const info = document.createElement("div");
        info.className = "alert alert-success py-2 small mt-3 d-flex align-items-center gap-2 mb-0";
        info.innerHTML = `<i class="bi bi-check-circle-fill"></i> You have nominated yourself.`;
        body.appendChild(info);

        const withdraw = document.createElement("button");
        withdraw.className = "btn btn-sm btn-outline-secondary mt-2";
        withdraw.innerHTML = `<i class="bi bi-x-circle me-1"></i>Withdraw Nomination`;
        withdraw.addEventListener("click", async () => {
            if (!confirm("Withdraw your nomination?")) return;
            withdraw.disabled = true;
            try {
                const updated = await apiFetch(`/elections/${el.id}/nominate`, { method: "DELETE" });
                onAction && onAction(updated);
            } catch (err) {
                withdraw.disabled = false;
                showError(body, err.message || "Failed to withdraw");
            }
        });
        body.appendChild(withdraw);
    }

    // Admin actions
    if (admin || root) {
        const adminBar = document.createElement("div");
        adminBar.className = "mt-3 border-top pt-3 d-flex gap-2 flex-wrap";

        if (root) {
            const deadlineBtn = document.createElement("button");
            deadlineBtn.className = "btn btn-sm btn-outline-secondary";
            deadlineBtn.innerHTML = `<i class="bi bi-calendar-event me-1"></i>${el.nominations_close_at ? "Change deadline" : "Set deadline"}`;
            deadlineBtn.addEventListener("click", () => {
                _deadlineElId      = el.id;
                _deadlineOnAction  = onAction;
                _deadlineBody      = body;
                const existing = el.nominations_close_at ? el.nominations_close_at.slice(0, 10) : "";
                document.getElementById("deadline-date-input").value = existing;
                bootstrap.Modal.getOrCreateInstance(document.getElementById("deadlineModal")).show();
            });
            adminBar.appendChild(deadlineBtn);

            const openBtn = document.createElement("button");
            openBtn.className = `btn btn-sm btn-success${count < MIN ? " disabled" : ""}`;
            openBtn.title = count < MIN ? `Need ${MIN} nominations` : "";
            openBtn.innerHTML = `<i class="bi bi-play-fill me-1"></i>Open Voting`;
            if (count >= MIN) {
                openBtn.addEventListener("click", async () => {
                    if (!confirm(`Open voting with ${count} candidates?`)) return;
                    openBtn.disabled = true;
                    try {
                        const updated = await apiFetch(`/elections/${el.id}/start-voting`, { method: "PATCH" });
                        onAction && onAction(updated);
                    } catch (err) {
                        openBtn.disabled = false;
                        showError(body, err.message || "Failed to open voting");
                    }
                });
            }
            adminBar.appendChild(openBtn);
        }

        if (root) {
            const delBtn = document.createElement("button");
            delBtn.className = "btn btn-sm btn-danger";
            delBtn.innerHTML = `<i class="bi bi-trash me-1"></i>Delete`;
            delBtn.addEventListener("click", () => deleteElection(el, body, onAction));
            adminBar.appendChild(delBtn);
        }

        body.appendChild(adminBar);
    }
}

// ── Voting phase ──────────────────────────────────────────────────────────────

function renderVoting(body, el, admin, root, onAction) {
    const required = el.max_votes ?? el.seats ?? 1;
    const selected = new Set();

    body.innerHTML += `
      <div class="anon-notice mb-3">
        <i class="bi bi-shield-lock-fill"></i>
        <span>Your vote is <strong>completely anonymous</strong>. No one can see who you voted for.</span>
      </div>
      ${el.has_voted && el.total_votes != null
          ? `<p class="text-muted small mb-2"><i class="bi bi-people me-1"></i>${el.total_votes} voter${el.total_votes !== 1 ? "s" : ""} · up to ${required} vote${required !== 1 ? "s" : ""} each</p>`
          : ""}
      ${!el.has_voted ? `
        <div class="card mb-3" style="border:1px solid #c7d7ff;border-radius:10px;background:#f8faff">
          <div class="card-body py-2 px-3">
            <div class="fw-semibold small mb-1" style="color:#1a3a8b">
              <i class="bi bi-info-circle me-1"></i>How to vote
            </div>
            <ul class="mb-0 ps-3 small text-muted" style="line-height:1.7">
              <li>Click up to <strong>${required}</strong> candidate card${required !== 1 ? "s" : ""} to select your choice${required !== 1 ? "s" : ""}.</li>
              <li>Click a selected card again to deselect it.</li>
              <li>You can vote for 1 to ${required} candidate${required !== 1 ? "s" : ""}. Click <strong>Cast Vote</strong> when ready.</li>
              <li>Your vote is <strong>anonymous</strong> — results are revealed after the election closes.</li>
            </ul>
          </div>
        </div>` : ""}`;

    const optionsWrap = document.createElement("div");
    optionsWrap.id = `candidates-${el.id}`;
    body.appendChild(optionsWrap);

    // Counter element (shown while voting)
    let counterEl = null;
    if (!el.has_voted) {
        counterEl = document.createElement("p");
        counterEl.className = "text-muted small mt-2 mb-0";
        counterEl.textContent = `0 / ${required} selected`;
    }

    el.candidates.forEach(c => {
        const card = document.createElement("div");
        card.className = `candidate-card mb-2${!el.has_voted ? " clickable" : ""}`;

        const resultHtml = el.has_voted
            ? `<div class="result-bar-bg"><div class="result-bar" style="width:${c.pct}%"></div></div>
               <div class="text-muted small mt-1">${c.vote_count} choice${c.vote_count !== 1 ? "s" : ""} · ${c.pct}% of voters</div>`
            : "";

        card.innerHTML = `
          <div class="c-avatar">${initials(c.member_name)}</div>
          <div class="flex-grow-1">
            <div class="fw-semibold">${c.member_name}</div>
            ${resultHtml}
          </div>
          ${!el.has_voted ? `<i class="bi bi-square text-muted flex-shrink-0" style="font-size:1.2rem"></i>` : ""}`;

        if (!el.has_voted) {
            card.addEventListener("click", () => {
                const icon = card.querySelector(".bi");
                if (selected.has(c.id)) {
                    selected.delete(c.id);
                    card.classList.remove("selected");
                    icon.className = "bi bi-square text-muted flex-shrink-0";
                } else {
                    if (selected.size >= required) {
                        showError(body, `You can only select up to ${required} candidate${required !== 1 ? "s" : ""}.`);
                        return;
                    }
                    selected.add(c.id);
                    card.classList.add("selected");
                    icon.className = "bi bi-check-square-fill text-primary flex-shrink-0";
                }
                if (counterEl) counterEl.textContent = `${selected.size} / ${required} selected`;
                if (voteBtn) voteBtn.disabled = selected.size < 1;
            });
        }
        optionsWrap.appendChild(card);
    });

    let voteBtn = null;
    if (!el.has_voted) {
        if (counterEl) body.appendChild(counterEl);
        voteBtn = document.createElement("button");
        voteBtn.className = "btn btn-primary mt-3";
        voteBtn.disabled = true;
        voteBtn.innerHTML = `<i class="bi bi-check2-circle me-1"></i>Cast Vote`;
        voteBtn.addEventListener("click", async () => {
            if (selected.size < 1 || selected.size > required) { showError(body, `Select between 1 and ${required} candidate${required !== 1 ? "s" : ""}.`); return; }
            voteBtn.disabled = true;
            voteBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Submitting…`;
            try {
                const updated = await apiFetch(`/elections/${el.id}/vote`, {
                    method: "POST",
                    body: JSON.stringify({ candidate_ids: [...selected] }),
                });
                onAction && onAction(updated);
            } catch (err) {
                voteBtn.disabled = false;
                voteBtn.innerHTML = `<i class="bi bi-check2-circle me-1"></i>Cast Vote`;
                showError(body, err.message || "Failed to cast vote");
            }
        });
        body.appendChild(voteBtn);
    } else {
        const info = document.createElement("div");
        info.className = "alert alert-success py-2 small mt-3 mb-0";
        info.innerHTML = `<i class="bi bi-check-circle-fill me-1"></i>Your vote has been recorded anonymously.`;
        body.appendChild(info);
    }

    if (admin || root) {
        const adminBar = document.createElement("div");
        adminBar.className = "mt-3 border-top pt-3 d-flex gap-2 flex-wrap";
        if (root) {
            const closeBtn = document.createElement("button");
            closeBtn.className = "btn btn-sm btn-outline-danger";
            closeBtn.innerHTML = `<i class="bi bi-lock me-1"></i>Close Election`;
            closeBtn.addEventListener("click", async () => {
                if (!confirm("Close this election? Results will be revealed to all members.")) return;
                closeBtn.disabled = true;
                try {
                    const updated = await apiFetch(`/elections/${el.id}/close`, { method: "PATCH" });
                    onAction && onAction(updated);
                } catch (err) {
                    closeBtn.disabled = false;
                    showError(body, err.message || "Failed to close election");
                }
            });
            adminBar.appendChild(closeBtn);
        }
        if (root) {
            const delBtn = document.createElement("button");
            delBtn.className = "btn btn-sm btn-danger";
            delBtn.innerHTML = `<i class="bi bi-trash me-1"></i>Delete`;
            delBtn.addEventListener("click", () => deleteElection(el, body, onAction));
            adminBar.appendChild(delBtn);
        }
        body.appendChild(adminBar);
    }
}

// ── Closed phase ──────────────────────────────────────────────────────────────

function renderClosed(body, el, root, onAction) {
    const total = el.total_votes ?? 0;
    const seats = el.seats || 3;
    const medals = ["🥇", "🥈", "🥉"];
    body.innerHTML += `
      <p class="text-muted small mb-3"><i class="bi bi-people me-1"></i>${total} vote${total !== 1 ? "s" : ""} cast · Closed ${fmtDate(el.closed_at)}</p>`;

    el.candidates.forEach(c => {
        const medal = c.is_winner ? (medals[c.rank - 1] ?? "✅") : "";
        const card = document.createElement("div");
        card.className = `candidate-card mb-2${c.is_winner ? " winner" : ""}`;
        card.innerHTML = `
          <div class="c-avatar${c.is_winner ? " winner-av" : ""}">${initials(c.member_name)}</div>
          <div class="flex-grow-1">
            <div class="fw-semibold">${c.member_name}${c.is_winner
                ? ` <span class="badge ms-1" style="background:#e8603c">${medal} Elected</span>`
                : ""}</div>
            <div class="result-bar-bg"><div class="result-bar${c.is_winner ? " winner-bar" : ""}" style="width:${c.pct}%"></div></div>
            <div class="text-muted small mt-1">${c.vote_count} vote${c.vote_count !== 1 ? "s" : ""} · ${c.pct}%</div>
          </div>`;
        body.appendChild(card);
    });

    if (root) {
        const adminBar = document.createElement("div");
        adminBar.className = "mt-3 border-top pt-3";
        const delBtn = document.createElement("button");
        delBtn.className = "btn btn-sm btn-danger";
        delBtn.innerHTML = `<i class="bi bi-trash me-1"></i>Delete`;
        delBtn.addEventListener("click", () => deleteElection(el, body, onAction));
        adminBar.appendChild(delBtn);
        body.appendChild(adminBar);
    }
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function showError(container, msg) {
    let err = container.querySelector(".inline-err");
    if (!err) {
        err = document.createElement("div");
        err.className = "alert alert-danger py-2 small mt-2 mb-0 inline-err";
        container.appendChild(err);
    }
    err.textContent = msg;
    setTimeout(() => err.remove(), 4000);
}

async function deleteElection(el, body, onAction) {
    if (!confirm(`Permanently delete "${el.title}"? This cannot be undone.`)) return;
    try {
        await apiFetch(`/elections/${el.id}`, { method: "DELETE" });
        onAction && onAction(null);
    } catch (err) {
        showError(body, err.message || "Failed to delete election");
    }
}

// ── Main init ─────────────────────────────────────────────────────────────────

export async function init() {
    if (isAdmin()) {
        document.getElementById("btn-create-election").classList.remove("d-none");
        document.getElementById("btn-election-submit").addEventListener("click", submitCreate);
    }
    document.getElementById("deadline-save-btn")?.addEventListener("click", async () => {
        const dateVal = document.getElementById("deadline-date-input").value;
        if (!dateVal) { alert("Please pick a date."); return; }
        const _d = new Date(dateVal + "T00:00:00"); _d.setHours(23, 59, 0, 0);
        const nominations_close_at = _d.toISOString();
        const btn = document.getElementById("deadline-save-btn");
        btn.disabled = true;
        try {
            const updated = await apiFetch(`/elections/${_deadlineElId}/deadline`, {
                method: "PATCH",
                body: JSON.stringify({ nominations_close_at }),
            });
            bootstrap.Modal.getInstance(document.getElementById("deadlineModal"))?.hide();
            _deadlineOnAction && _deadlineOnAction(updated);
        } catch (err) {
            if (_deadlineBody) showError(_deadlineBody, err.message || "Failed to set deadline");
        } finally {
            btn.disabled = false;
        }
    });
    await loadElections();
}

async function loadElections() {
    const loadEl   = document.getElementById("election-loading");
    const emptyEl  = document.getElementById("election-empty");
    const activeW  = document.getElementById("election-active-wrap");
    const historyW = document.getElementById("election-history-wrap");

    loadEl.classList.remove("d-none");
    activeW.innerHTML  = "";
    historyW.innerHTML = "";
    emptyEl.classList.add("d-none");

    let elections;
    try {
        elections = await apiFetch("/elections");
    } catch (err) {
        loadEl.classList.add("d-none");
        activeW.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
        return;
    }
    loadEl.classList.add("d-none");

    if (!elections.length) { emptyEl.classList.remove("d-none"); return; }

    const active = elections.find(e => e.status !== "closed");
    const past   = elections.filter(e => e.status === "closed");
    const refresh = () => loadElections();

    if (active) {
        const heroText = {
            nominating: "Nominations are open — put yourself forward to be considered.",
            voting:     "Voting is open — cast your anonymous vote below.",
        }[active.status] ?? "";

        activeW.innerHTML = `
          <div class="election-hero">
            <div style="font-size:2.5rem">${active.status === "nominating" ? "🙋" : "🗳️"}</div>
            <h2>${active.title}</h2>
            <p>${heroText}</p>
          </div>`;
        activeW.appendChild(renderCard(active, { onAction: refresh }));
    }

    if (past.length) {
        const h = document.createElement("h5");
        h.className = "fw-semibold text-muted mt-4 mb-3";
        h.innerHTML = `<i class="bi bi-clock-history me-2"></i>Past Elections`;
        historyW.appendChild(h);
        past.forEach(e => historyW.appendChild(renderCard(e, { compact: true, onAction: refresh })));
    }

    if (!active && !past.length) emptyEl.classList.remove("d-none");
}

async function submitCreate() {
    const btn   = document.getElementById("btn-election-submit");
    const errEl = document.getElementById("create-election-error");
    const title = document.getElementById("el-title").value.trim();
    const desc  = document.getElementById("el-description").value.trim();
    const seats    = parseInt(document.getElementById("el-seats")?.value || "3", 10);
    const closeRaw = document.getElementById("el-nominations-close")?.value;
    const nominations_close_at = (() => { if (!closeRaw) return null; const d = new Date(closeRaw + "T00:00:00"); d.setHours(23, 59, 0, 0); return d.toISOString(); })();

    errEl.classList.add("d-none");
    if (!title) { errEl.textContent = "Title is required."; errEl.classList.remove("d-none"); return; }
    if (!seats || seats < 1) { errEl.textContent = "Seats must be at least 1."; errEl.classList.remove("d-none"); return; }

    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Creating…`;
    try {
        await apiFetch("/elections", {
            method: "POST",
            body: JSON.stringify({ title, description: desc || null, seats, nominations_close_at }),
        });
        bootstrap.Modal.getInstance(document.getElementById("createElectionModal")).hide();
        document.getElementById("el-title").value = "";
        document.getElementById("el-description").value = "";
        document.getElementById("el-seats").value = "3";
        document.getElementById("el-nominations-close").value = "";
        await loadElections();
    } catch (err) {
        errEl.textContent = err.message || "Failed to create election";
        errEl.classList.remove("d-none");
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="bi bi-send me-1"></i>Start Election`;
    }
}
