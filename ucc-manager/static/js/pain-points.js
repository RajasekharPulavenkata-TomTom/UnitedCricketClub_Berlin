import { apiFetch, showToast, escHtml } from "/js/api.js";

let items = [];
let isAdmin = false;
let _activeFilter = "";
let _activeCategory = "";
let _editId = null;

// Module-scope: registers once per session regardless of how many times the page is visited.
document.addEventListener("hidden.bs.modal", (e) => {
    if (e.target.id === "raisePPModal") {
        document.getElementById("pp-raise-form")?.reset();
        document.getElementById("raise-pp-error")?.classList.add("d-none");
    }
});

export async function init() {
    const user = JSON.parse(localStorage.getItem("ucc_user") || "null");
    isAdmin = user?.role === "manager" || user?.role === "developer";
    await load();
    setupFilters();
}

async function load() {
    try {
        items = await apiFetch("/pain-points");
    } catch (e) {
        document.getElementById("pp-container").innerHTML =
            `<div class="alert alert-danger">${escHtml(e.message)}</div>`;
        return;
    }
    renderSummary();
    renderList();
}

function setupFilters() {
    document.querySelectorAll("#pp-filters [data-filter]").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll("#pp-filters [data-filter]").forEach(b => {
                b.className = "btn btn-sm btn-outline-secondary";
            });
            btn.className = "btn btn-sm btn-success active";
            _activeFilter = btn.dataset.filter;
            renderList();
        });
    });
    document.getElementById("pp-category-filter").addEventListener("change", (e) => {
        _activeCategory = e.target.value;
        renderList();
    });
}

function renderSummary() {
    const open      = items.filter(p => p.status === "open").length;
    const discussed = items.filter(p => p.status === "discussed").length;
    const resolved  = items.filter(p => p.status === "resolved").length;
    document.getElementById("pp-summary").innerHTML = `
        <span class="badge bg-secondary fs-6 fw-normal">${items.length} total</span>
        ${open      ? `<span class="badge bg-danger  fs-6 fw-normal">${open} open</span>` : ""}
        ${discussed ? `<span class="badge bg-warning text-dark fs-6 fw-normal">${discussed} discussed</span>` : ""}
        ${resolved  ? `<span class="badge bg-success fs-6 fw-normal">${resolved} resolved</span>` : ""}`;
}

function _visible() {
    return items.filter(p =>
        (!_activeFilter   || p.status   === _activeFilter) &&
        (!_activeCategory || p.category === _activeCategory)
    );
}

function renderList() {
    const filtered = _visible();
    const c = document.getElementById("pp-container");
    if (!filtered.length) {
        const hasFilter = _activeFilter || _activeCategory;
        c.innerHTML = `
            <div class="card"><div class="card-body text-center text-muted py-5">
              <i class="bi bi-exclamation-circle" style="font-size:2.5rem"></i>
              <div class="mt-2">No pain points${hasFilter ? " matching this filter" : " raised yet"}.
                ${!hasFilter ? " Use <strong>Raise a Pain Point</strong> to get started." : ""}
              </div>
            </div></div>`;
        return;
    }
    c.innerHTML = filtered.map(ppCard).join("");
}

const _STATUS_BADGE = {
    open:      `<span class="badge bg-danger">Open</span>`,
    discussed: `<span class="badge bg-warning text-dark">Discussed</span>`,
    resolved:  `<span class="badge bg-success">Resolved</span>`,
};

const _CAT_BADGE = {
    gameplay:      `<span class="badge bg-info text-dark">Gameplay</span>`,
    facilities:    `<span class="badge bg-primary">Facilities</span>`,
    communication: `<span class="badge bg-secondary">Communication</span>`,
    scheduling:    `<span class="badge" style="background:#6f42c1">Scheduling</span>`,
    equipment:     `<span class="badge bg-warning text-dark">Equipment</span>`,
    other:         `<span class="badge bg-light text-dark border">Other</span>`,
};

function ppCard(p) {
    const submitter = p.submitted_by
        ? escHtml(p.submitted_by) + (p.is_mine && p.is_anonymous ? ' <span class="badge bg-light text-muted border" style="font-size:.65rem">anonymous</span>' : "")
        : "Anonymous";

    const catBadge    = _CAT_BADGE[p.category]  || "";
    const statusBadge = _STATUS_BADGE[p.status] || `<span class="badge bg-secondary">${escHtml(p.status)}</span>`;

    let noteHtml = "";
    if (p.resolution_note) {
        const noteClass = p.status === "resolved"
            ? "bg-success bg-opacity-10 text-success border border-success border-opacity-25"
            : "bg-info bg-opacity-10 text-primary border border-primary border-opacity-25";
        noteHtml = `<div class="mt-2 p-2 rounded small ${noteClass}">
            <i class="bi bi-chat-square-text-fill me-1"></i>${escHtml(p.resolution_note)}
        </div>`;
    }

    const when = _age(p.created_at);
    const resolvedWhen = p.resolved_at && p.status === "resolved"
        ? `&nbsp;·&nbsp;<i class="bi bi-check-circle me-1"></i>Resolved ${_age(p.resolved_at)}`
        : "";

    const editBtn = isAdmin
        ? `<button class="btn btn-sm btn-outline-secondary" onclick="window._ppEdit(${p.id})" title="Update status"><i class="bi bi-pencil"></i></button>`
        : "";
    const deleteBtn = (isAdmin || (p.is_mine && p.status === "open"))
        ? `<button class="btn btn-sm btn-outline-danger" onclick="window._ppDelete(${p.id})" title="Delete"><i class="bi bi-trash"></i></button>`
        : "";

    return `
    <div class="card pp-card mb-3" id="pp-card-${p.id}">
        <div class="card-body">
            <div class="d-flex align-items-start gap-2 flex-wrap">
                <div class="flex-grow-1 min-width-0">
                    <div class="d-flex flex-wrap gap-2 align-items-center mb-1">
                        ${statusBadge}
                        ${catBadge}
                    </div>
                    <h6 class="mb-1 mt-1">${escHtml(p.title)}</h6>
                    ${p.description ? `<p class="text-muted small mb-1">${escHtml(p.description)}</p>` : ""}
                    <div class="text-muted small mt-1">
                        <i class="bi bi-person me-1"></i>${submitter}
                        &nbsp;·&nbsp;<i class="bi bi-clock me-1"></i>${when}
                        ${resolvedWhen}
                    </div>
                    ${noteHtml}
                </div>
                <div class="d-flex gap-1 flex-shrink-0 no-print">${editBtn}${deleteBtn}</div>
            </div>
        </div>
    </div>`;
}

function _age(isoStr) {
    if (!isoStr) return "—";
    const diff  = Date.now() - new Date(isoStr).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);
    if (mins < 1)   return "just now";
    if (mins < 60)  return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7)   return `${days}d ago`;
    return new Date(isoStr).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// ── Raise ──────────────────────────────────────────────────────────────────────

window._ppSubmit = async () => {
    const title        = (document.getElementById("pp-title").value || "").trim();
    const description  = (document.getElementById("pp-description").value || "").trim() || null;
    const category     = document.getElementById("pp-category").value || null;
    const is_anonymous = document.getElementById("pp-anonymous").checked;
    const errEl        = document.getElementById("raise-pp-error");
    errEl.classList.add("d-none");

    if (!title) {
        errEl.textContent = "Title is required.";
        errEl.classList.remove("d-none");
        return;
    }

    try {
        const created = await apiFetch("/pain-points", {
            method: "POST",
            body: JSON.stringify({ title, description, category, is_anonymous }),
        });
        items.unshift(created);
        bootstrap.Modal.getInstance(document.getElementById("raisePPModal"))?.hide();
        renderSummary();
        renderList();
        showToast("Pain point submitted");
    } catch (e) {
        errEl.textContent = e.message;
        errEl.classList.remove("d-none");
    }
};

// ── Admin: edit ────────────────────────────────────────────────────────────────

window._ppEdit = (id) => {
    const pp = items.find(p => p.id === id);
    if (!pp) return;
    _editId = id;
    document.getElementById("pp-edit-status").value = pp.status;
    document.getElementById("pp-edit-resolution").value = pp.resolution_note || "";
    document.getElementById("edit-pp-error").classList.add("d-none");
    new bootstrap.Modal(document.getElementById("editPPModal")).show();
};

window._ppUpdate = async () => {
    const status          = document.getElementById("pp-edit-status").value;
    const resolution_note = (document.getElementById("pp-edit-resolution").value || "").trim() || null;
    const errEl           = document.getElementById("edit-pp-error");
    errEl.classList.add("d-none");

    try {
        const updated = await apiFetch(`/pain-points/${_editId}`, {
            method: "PATCH",
            body: JSON.stringify({ status, resolution_note }),
        });
        const idx = items.findIndex(p => p.id === _editId);
        if (idx !== -1) items[idx] = updated;
        bootstrap.Modal.getInstance(document.getElementById("editPPModal"))?.hide();
        renderSummary();
        renderList();
        showToast("Pain point updated");
    } catch (e) {
        errEl.textContent = e.message;
        errEl.classList.remove("d-none");
    }
};

// ── Delete ─────────────────────────────────────────────────────────────────────

window._ppDelete = async (id) => {
    if (!confirm("Delete this pain point permanently?")) return;
    try {
        await apiFetch(`/pain-points/${id}`, { method: "DELETE" });
        items = items.filter(p => p.id !== id);
        document.getElementById(`pp-card-${id}`)?.remove();
        renderSummary();
        if (!_visible().length) renderList();
        showToast("Pain point deleted");
    } catch (e) {
        showToast(e.message, "error");
    }
};
