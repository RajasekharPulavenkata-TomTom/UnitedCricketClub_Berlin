import { apiFetch, showToast } from "/js/api.js";
import { isAdmin } from "/js/auth.js";

let _sponsors = [];
let _deleteId = null;
const _modal    = () => bootstrap.Modal.getOrCreateInstance(document.getElementById("sponsorModal"));
const _delModal = () => bootstrap.Modal.getOrCreateInstance(document.getElementById("sponsorDeleteModal"));

export async function init() {
    if (isAdmin()) {
        document.getElementById("btn-add-sponsor").classList.remove("d-none");
        document.getElementById("btn-add-sponsor").addEventListener("click", _openAdd);
    }
    document.getElementById("btn-sponsor-save").addEventListener("click", _save);
    document.getElementById("btn-sponsor-delete-confirm").addEventListener("click", _deleteConfirm);

    // Live logo preview
    document.getElementById("sponsor-logo").addEventListener("input", (e) => {
        const url = e.target.value.trim();
        const prev = document.getElementById("sponsor-logo-preview");
        prev.innerHTML = url
            ? `<img src="${_esc(url)}" alt="Logo preview" class="rounded border p-1" style="max-height:60px;max-width:160px;object-fit:contain" onerror="this.style.display='none'">`
            : "";
    });

    await _load();
}

async function _load() {
    try {
        _sponsors = await apiFetch("/sponsors");
        _render();
    } catch (e) {
        document.getElementById("sponsors-list").innerHTML =
            `<div class="alert alert-danger">${e.message}</div>`;
    }
}

function _render() {
    const admin = isAdmin();
    const list  = document.getElementById("sponsors-list");

    if (!_sponsors.length) {
        list.innerHTML = `<div class="card"><div class="card-body text-center text-muted py-5">
            <i class="bi bi-award" style="font-size:2.5rem;opacity:.25"></i>
            <div class="mt-2">No sponsors yet.${admin ? " Click <strong>Add Sponsor</strong> to add one." : ""}</div>
        </div></div>`;
        return;
    }

    list.innerHTML = _sponsors.map(s => {
        const logo = s.logo_url
            ? `<img src="${_esc(s.logo_url)}" alt="${_esc(s.name)} logo" class="sponsor-logo-img mb-2"
                   onerror="this.outerHTML='<div class=\\'text-muted mb-2\\'><i class=\\'bi bi-award\\' style=\\'font-size:2.5rem\\'></i></div>'">`
            : `<div class="text-muted mb-2"><i class="bi bi-award" style="font-size:2.5rem"></i></div>`;
        const nameEl = s.website_url
            ? `<a href="${_esc(s.website_url)}" target="_blank" rel="noopener noreferrer" class="fw-bold fs-5 text-decoration-none">${_esc(s.name)}</a>`
            : `<span class="fw-bold fs-5">${_esc(s.name)}</span>`;
        const sinceHtml  = s.since_year ? `<span class="badge bg-light text-dark border me-1">Since ${s.since_year}</span>` : "";
        const activeHtml = !s.is_active ? `<span class="badge bg-secondary">Inactive</span>` : "";
        const adminBtns  = admin ? `
            <div class="d-flex gap-1 mt-2">
                <button class="btn btn-sm btn-outline-secondary py-0 px-2" onclick="window._sponsorEdit(${s.id})"><i class="bi bi-pencil me-1"></i>Edit</button>
                <button class="btn btn-sm btn-outline-danger py-0 px-2" onclick="window._sponsorDelete(${s.id},'${s.name.replace(/'/g,"\\'")}')" ><i class="bi bi-trash me-1"></i>Remove</button>
            </div>` : "";
        return `
        <div class="card sponsor-card mb-3${!s.is_active ? " opacity-50" : ""}">
          <div class="card-body d-flex align-items-start gap-4 flex-wrap">
            <div class="text-center" style="min-width:120px">
              ${logo}
              <div>${sinceHtml}${activeHtml}</div>
            </div>
            <div class="flex-grow-1">
              <div class="mb-1">${nameEl}</div>
              ${s.description ? `<p class="text-muted mb-2">${_esc(s.description)}</p>` : ""}
              ${s.website_url ? `<div class="small"><i class="bi bi-globe me-1"></i><a href="${_esc(s.website_url)}" target="_blank" rel="noopener noreferrer">${_esc(s.website_url)}</a></div>` : ""}
              ${adminBtns}
            </div>
          </div>
        </div>`;
    }).join("");
}

function _openAdd() {
    document.getElementById("sponsor-modal-title").innerHTML = '<i class="bi bi-award me-2"></i>Add Sponsor';
    document.getElementById("sponsor-form").reset();
    document.getElementById("sponsor-id").value = "";
    document.getElementById("sponsor-logo-preview").innerHTML = "";
    document.getElementById("sponsor-active").checked = true;
    document.getElementById("sponsor-modal-error").classList.add("d-none");
    _modal().show();
}

window._sponsorEdit = function(id) {
    const s = _sponsors.find(x => x.id === id);
    if (!s) return;
    document.getElementById("sponsor-modal-title").innerHTML = '<i class="bi bi-pencil me-2"></i>Edit Sponsor';
    document.getElementById("sponsor-id").value          = s.id;
    document.getElementById("sponsor-name").value        = s.name;
    document.getElementById("sponsor-logo").value        = s.logo_url || "";
    document.getElementById("sponsor-website").value     = s.website_url || "";
    document.getElementById("sponsor-description").value = s.description || "";
    document.getElementById("sponsor-since").value       = s.since_year || "";
    document.getElementById("sponsor-order").value       = s.display_order ?? 0;
    document.getElementById("sponsor-active").checked    = s.is_active;
    const url = s.logo_url || "";
    document.getElementById("sponsor-logo-preview").innerHTML = url
        ? `<img src="${_esc(url)}" alt="Logo" class="rounded border p-1" style="max-height:60px;max-width:160px;object-fit:contain">`
        : "";
    document.getElementById("sponsor-modal-error").classList.add("d-none");
    _modal().show();
};

window._sponsorDelete = function(id, name) {
    _deleteId = id;
    document.getElementById("sponsor-delete-name").textContent = name;
    _delModal().show();
};

async function _save() {
    const id   = document.getElementById("sponsor-id").value;
    const name = document.getElementById("sponsor-name").value.trim();
    if (!name) {
        _showErr("Sponsor name is required.");
        return;
    }
    const body = {
        name,
        logo_url:      document.getElementById("sponsor-logo").value.trim() || null,
        website_url:   document.getElementById("sponsor-website").value.trim() || null,
        description:   document.getElementById("sponsor-description").value.trim() || null,
        since_year:    parseInt(document.getElementById("sponsor-since").value) || null,
        display_order: parseInt(document.getElementById("sponsor-order").value) || 0,
        is_active:     document.getElementById("sponsor-active").checked,
    };
    const btn = document.getElementById("btn-sponsor-save");
    btn.disabled = true;
    try {
        if (id) {
            await apiFetch(`/sponsors/${id}`, { method: "PUT", body: JSON.stringify(body) });
        } else {
            await apiFetch("/sponsors", { method: "POST", body: JSON.stringify(body) });
        }
        _modal().hide();
        await _load();
        // Refresh footer
        if (window._refreshSponsorsFooter) window._refreshSponsorsFooter();
        showToast(id ? "Sponsor updated" : "Sponsor added");
    } catch (e) {
        _showErr(e.message);
    } finally {
        btn.disabled = false;
    }
}

async function _deleteConfirm() {
    if (!_deleteId) return;
    const btn = document.getElementById("btn-sponsor-delete-confirm");
    btn.disabled = true;
    try {
        await apiFetch(`/sponsors/${_deleteId}`, { method: "DELETE" });
        _delModal().hide();
        _deleteId = null;
        await _load();
        if (window._refreshSponsorsFooter) window._refreshSponsorsFooter();
        showToast("Sponsor removed");
    } catch (e) {
        alert("Failed: " + e.message);
    } finally {
        btn.disabled = false;
    }
}

function _showErr(msg) {
    const el = document.getElementById("sponsor-modal-error");
    el.textContent = msg;
    el.classList.remove("d-none");
}

function _esc(s) {
    return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
