import { apiFetch } from "/js/api.js";

const PILLAR_BG = { "#1e40af": "#dbeafe", "#c2410c": "#ffedd5", "#166534": "#dcfce7", "#5b21b6": "#ede9fe" };

function getRole() {
    try { return JSON.parse(atob(localStorage.getItem("ucc_token").split(".")[1])).role; }
    catch { return null; }
}
const isAdmin = () => ["manager", "developer"].includes(getRole());
const isRoot  = () => getRole() === "developer";

function fmtDate(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

// ── Star widget ────────────────────────────────────────────────────────────────

function starWidget(pillarIdx, selectedRef) {
    const wrap = document.createElement("div");
    wrap.className = "star-row";

    const stars = [];
    for (let v = 1; v <= 5; v++) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "star-btn";
        btn.dataset.value = v;
        btn.innerHTML = "★";
        btn.setAttribute("aria-label", `${v} star${v > 1 ? "s" : ""}`);

        btn.addEventListener("mouseenter", () => stars.forEach(s => s.classList.toggle("hovered", s.dataset.value <= v)));
        btn.addEventListener("mouseleave", () => stars.forEach(s => s.classList.remove("hovered")));
        btn.addEventListener("click", () => {
            selectedRef[pillarIdx] = v;
            stars.forEach(s => s.classList.toggle("selected", s.dataset.value <= v));
            wrap.closest(".pillar-row")?.classList.add("rated");
        });

        stars.push(btn);
        wrap.appendChild(btn);
    }
    return wrap;
}

// ── Render session card ────────────────────────────────────────────────────────

function renderCard(fs, { compact = false, onAction } = {}) {
    const admin = isAdmin();
    const root  = isRoot();

    const card = document.createElement("div");
    card.className = compact ? "card history-card mb-3" : "card mb-4 shadow-sm";

    const body = document.createElement("div");
    body.className = compact ? "card-body p-3" : "card-body p-4";
    card.appendChild(body);

    const statusBadge = fs.status === "open"
        ? `<span class="badge rounded-pill px-3" style="background:#dbeafe;color:#1e40af">📝 Open</span>`
        : `<span class="badge rounded-pill px-3" style="background:#f1f5f9;color:#475569">🔒 Closed · ${fmtDate(fs.closed_at)}</span>`;

    body.innerHTML = `
      <div class="d-flex align-items-start justify-content-between gap-2 mb-1 flex-wrap">
        <h5 class="mb-0 fw-bold">${fs.title}</h5>
        ${statusBadge}
      </div>
      <p class="text-muted small mb-3">${fs.submission_count} submission${fs.submission_count !== 1 ? "s" : ""}${fs.status === "open" ? " so far" : ""}</p>`;

    if (fs.status === "open" && !fs.has_submitted) {
        renderRatingForm(body, fs, onAction);
    } else if (fs.status === "open" && fs.has_submitted) {
        const info = document.createElement("div");
        info.className = "alert alert-success py-2 small mb-3";
        info.innerHTML = `<i class="bi bi-check-circle-fill me-1"></i>Your feedback has been recorded. Results will be revealed once the session closes.`;
        body.appendChild(info);
    } else {
        renderResults(body, fs);
    }

    // Admin / root actions
    if ((admin && fs.status === "open") || root) {
        const bar = document.createElement("div");
        bar.className = "mt-3 border-top pt-3 d-flex gap-2 flex-wrap";
        if (admin && fs.status === "open") {
            const closeBtn = document.createElement("button");
            closeBtn.className = "btn btn-sm btn-outline-danger";
            closeBtn.innerHTML = `<i class="bi bi-lock me-1"></i>Close & Reveal Results`;
            closeBtn.addEventListener("click", async () => {
                if (!confirm("Close this feedback session? Results will be revealed to all members.")) return;
                closeBtn.disabled = true;
                try {
                    const updated = await apiFetch(`/feedback-sessions/${fs.id}/close`, { method: "PATCH" });
                    onAction && onAction(updated);
                } catch (err) {
                    closeBtn.disabled = false;
                    showErr(body, err.message || "Failed to close session");
                }
            });
            bar.appendChild(closeBtn);
        }
        if (root) {
            const delBtn = document.createElement("button");
            delBtn.className = "btn btn-sm btn-danger";
            delBtn.innerHTML = `<i class="bi bi-trash me-1"></i>Delete`;
            delBtn.addEventListener("click", async () => {
                if (!confirm(`Permanently delete "${fs.title}"?`)) return;
                try {
                    await apiFetch(`/feedback-sessions/${fs.id}`, { method: "DELETE" });
                    onAction && onAction(null);
                } catch (err) { showErr(body, err.message || "Failed to delete"); }
            });
            bar.appendChild(delBtn);
        }
        body.appendChild(bar);
    }

    return card;
}

// ── Rating form (open, not yet submitted) ─────────────────────────────────────

function renderRatingForm(body, fs, onAction) {
    const notice = document.createElement("div");
    notice.className = "anon-notice mb-3";
    notice.innerHTML = `<i class="bi bi-shield-lock-fill"></i><span>Your ratings are <strong>completely anonymous</strong>. No one can see what you scored.</span>`;
    body.appendChild(notice);

    const selectedRatings = {};  // pillarIdx (0-based) → star value
    const rows = [];

    fs.pillars.forEach((p, i) => {
        const bg = PILLAR_BG[p.color] || "#f8f9fa";
        const row = document.createElement("div");
        row.className = "pillar-row mb-2";
        row.innerHTML = `
          <div class="pillar-icon-sm" style="background:${bg};color:${p.color}">
            <i class="bi ${p.icon}"></i>
          </div>
          <div class="flex-grow-1 fw-semibold" style="font-size:.93rem">${p.label}</div>`;
        row.appendChild(starWidget(i, selectedRatings));
        body.appendChild(row);
        rows.push(row);
    });

    const submitBtn = document.createElement("button");
    submitBtn.className = "btn btn-primary mt-3";
    submitBtn.innerHTML = `<i class="bi bi-send me-1"></i>Submit Feedback`;
    submitBtn.addEventListener("click", async () => {
        const ratings = fs.pillars.map((_, i) => selectedRatings[i]);
        if (ratings.some(r => !r)) { showErr(body, "Please rate all four pillars before submitting."); return; }

        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Submitting…`;
        try {
            const updated = await apiFetch(`/feedback-sessions/${fs.id}/submit`, {
                method: "POST",
                body: JSON.stringify({ ratings }),
            });
            onAction && onAction(updated);
        } catch (err) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i class="bi bi-send me-1"></i>Submit Feedback`;
            showErr(body, err.message || "Failed to submit");
        }
    });
    body.appendChild(submitBtn);
}

// ── Results (closed session) ──────────────────────────────────────────────────

function renderResults(body, fs) {
    fs.pillars.forEach(p => {
        const bg  = PILLAR_BG[p.color] || "#f8f9fa";
        const avg = p.avg ?? 0;
        const pct = (avg / 5) * 100;

        const section = document.createElement("div");
        section.className = "mb-4";
        section.innerHTML = `
          <div class="d-flex align-items-center gap-2 mb-2">
            <div class="pillar-icon-sm" style="background:${bg};color:${p.color}">
              <i class="bi ${p.icon}"></i>
            </div>
            <span class="fw-semibold" style="font-size:.93rem">${p.label}</span>
            <span class="ms-auto fw-bold" style="color:${p.color};font-size:1.05rem">${avg}/5</span>
          </div>
          <!-- Overall bar -->
          <div class="dist-bar-bg mb-2" style="height:10px">
            <div class="dist-bar" style="width:${pct}%;background:${p.color}"></div>
          </div>
          <!-- Star distribution -->
          ${p.dist ? [5,4,3,2,1].map(star => {
              const count = p.dist[star] ?? 0;
              const total = Object.values(p.dist).reduce((a,b) => a+b, 0);
              const barPct = total ? Math.round(count / total * 100) : 0;
              return `<div class="d-flex align-items-center gap-2 mb-1" style="font-size:.78rem">
                <span style="width:14px;text-align:right;color:#92400e">★</span>
                <span style="width:10px;color:#6b7280">${star}</span>
                <div class="dist-bar-bg"><div class="dist-bar" style="width:${barPct}%"></div></div>
                <span style="width:28px;color:#6b7280">${count}</span>
              </div>`;
          }).join("") : ""}`;

        body.appendChild(section);
    });
}

// ── Shared ────────────────────────────────────────────────────────────────────

function showErr(container, msg) {
    let el = container.querySelector(".inline-err");
    if (!el) { el = document.createElement("div"); el.className = "alert alert-danger py-2 small mt-2 mb-0 inline-err"; container.appendChild(el); }
    el.textContent = msg;
    setTimeout(() => el.remove(), 4000);
}

// ── Init ──────────────────────────────────────────────────────────────────────

export async function init() {
    if (isAdmin()) {
        document.getElementById("btn-create-fb").classList.remove("d-none");
        document.getElementById("btn-fb-submit").addEventListener("click", submitCreate);
        loadElectionsForModal();
    }
    await loadSessions();
}

async function loadSessions() {
    const loadEl   = document.getElementById("fb-loading");
    const emptyEl  = document.getElementById("fb-empty");
    const activeW  = document.getElementById("fb-active-wrap");
    const historyW = document.getElementById("fb-history-wrap");

    loadEl.classList.remove("d-none");
    activeW.innerHTML  = "";
    historyW.innerHTML = "";
    emptyEl.classList.add("d-none");

    let sessions;
    try {
        sessions = await apiFetch("/feedback-sessions");
    } catch (err) {
        loadEl.classList.add("d-none");
        activeW.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
        return;
    }
    loadEl.classList.add("d-none");

    if (!sessions.length) { emptyEl.classList.remove("d-none"); return; }

    const active = sessions.find(s => s.status === "open");
    const past   = sessions.filter(s => s.status === "closed");
    const refresh = () => loadSessions();

    if (active) {
        activeW.innerHTML = `
          <div class="fb-hero">
            <div style="font-size:2.5rem">📝</div>
            <h2>${active.title}</h2>
            <p>Rate each management pillar 1–5 stars. Your response is anonymous and results are hidden until the window closes.</p>
          </div>`;
        activeW.appendChild(renderCard(active, { onAction: refresh }));
    }

    if (past.length) {
        const h = document.createElement("h5");
        h.className = "fw-semibold text-muted mt-4 mb-3";
        h.innerHTML = `<i class="bi bi-clock-history me-2"></i>Past Feedback Sessions`;
        historyW.appendChild(h);
        past.forEach(s => historyW.appendChild(renderCard(s, { compact: true, onAction: refresh })));
    }

    if (!active && !past.length) emptyEl.classList.remove("d-none");
}

async function loadElectionsForModal() {
    try {
        const elections = await apiFetch("/elections");
        const closed = elections.filter(e => e.status === "closed");
        const sel = document.getElementById("fb-election-id");
        closed.forEach(e => {
            const opt = document.createElement("option");
            opt.value = e.id;
            opt.textContent = e.title;
            sel.appendChild(opt);
        });
    } catch { /* non-critical */ }
}

async function submitCreate() {
    const btn   = document.getElementById("btn-fb-submit");
    const errEl = document.getElementById("create-fb-error");
    const title = document.getElementById("fb-title").value.trim();
    const elId  = document.getElementById("fb-election-id").value;

    errEl.classList.add("d-none");
    if (!title) { errEl.textContent = "Title is required."; errEl.classList.remove("d-none"); return; }

    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Creating…`;
    try {
        await apiFetch("/feedback-sessions", {
            method: "POST",
            body: JSON.stringify({ title, election_id: elId ? parseInt(elId) : null }),
        });
        bootstrap.Modal.getInstance(document.getElementById("createFbModal")).hide();
        document.getElementById("fb-title").value = "";
        document.getElementById("fb-election-id").value = "";
        await loadSessions();
    } catch (err) {
        errEl.textContent = err.message || "Failed to create session";
        errEl.classList.remove("d-none");
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="bi bi-send me-1"></i>Open Session`;
    }
}
