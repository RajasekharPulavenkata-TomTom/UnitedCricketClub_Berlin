import { apiFetch, showToast, escHtml } from "/js/api.js";
import { isAdmin } from "/js/auth.js";

let modal;
let editingId = null;
let allMembers = [];

export async function init() {
    modal = new bootstrap.Modal(document.getElementById("memberModal"));

    document.getElementById("btn-add-member").addEventListener("click", () => openModal());
    document.getElementById("member-form").addEventListener("submit", onSubmit);
    document.getElementById("filter-search").addEventListener("input", render);
    document.getElementById("filter-active").addEventListener("change", render);
    document.getElementById("filter-ball-type").addEventListener("change", render);

    await load();
}

async function load() {
    const tbody = document.getElementById("members-tbody");
    tbody.innerHTML = `<tr><td colspan="12" class="text-center py-3"><div class="spinner-border spinner-border-sm"></div></td></tr>`;
    try {
        allMembers = await apiFetch("/members");
        render();
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="12" class="text-danger text-center">${e.message}</td></tr>`;
    }
}

function render() {
    const search = document.getElementById("filter-search").value.toLowerCase();
    const activeOnly = document.getElementById("filter-active").checked;
    const ballType = document.getElementById("filter-ball-type").value;
    const tbody = document.getElementById("members-tbody");

    let filtered = allMembers;
    if (search) filtered = filtered.filter((m) =>
        m.name.toLowerCase().includes(search) ||
        (m.jersey_name || "").toLowerCase().includes(search) ||
        (m.email || "").toLowerCase().includes(search) ||
        (m.phone || "").includes(search)
    );
    if (activeOnly) filtered = filtered.filter((m) => m.is_active);
    if (ballType) filtered = filtered.filter((m) => m.ball_type === ballType);

    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="12" class="text-center py-4 text-muted">No members found.</td></tr>`;
        return;
    }

    const roleColors = {
        "Bat": "bg-primary", "Ball": "bg-danger", "All Rounder": "bg-success",
        "Bat/WK": "bg-info text-dark", "Bowler": "bg-warning text-dark",
    };
    const ballColors = { "Tennis": "bg-warning text-dark", "Leather": "bg-danger", "Both": "bg-success" };

    tbody.innerHTML = filtered.map((m, i) => `
        <tr>
          <td class="text-muted">${i + 1}</td>
          <td>
            <div class="fw-semibold">${escHtml(m.name)}</div>
          </td>
          <td class="small">${m.email ? `<a href="mailto:${escHtml(m.email)}">${escHtml(m.email)}</a>` : "—"}</td>
          <td class="small text-nowrap">${escHtml(m.phone || "—")}</td>
          <td>
            ${m.jersey_name ? `<span class="fw-semibold">${escHtml(m.jersey_name)}</span>` : ""}
            ${m.jersey_number ? `<span class="badge bg-secondary ms-1">#${escHtml(m.jersey_number)}</span>` : ""}
            ${!m.jersey_name && !m.jersey_number ? "—" : ""}
          </td>
          <td>${m.role ? `<span class="badge ${roleColors[m.role] || "bg-secondary"}">${escHtml(m.role)}</span>` : "—"}</td>
          <td>${m.ball_type ? `<span class="badge ${ballColors[m.ball_type] || "bg-secondary"}">${escHtml(m.ball_type)}</span>` : "—"}</td>
          <td><code class="small">${escHtml(m.dcb_id || "—")}</code></td>
          <td class="text-center" onclick="event.stopPropagation()">
            <input type="checkbox" ${m.cricheroes ? "checked" : ""} onchange="window._toggleField(${m.id}, 'cricheroes', this.checked)" />
          </td>
          <td class="text-center" onclick="event.stopPropagation()">
            <input type="checkbox" ${m.cricclubs ? "checked" : ""} onchange="window._toggleField(${m.id}, 'cricclubs', this.checked)" />
          </td>
          <td>${m.is_active
            ? `<span class="badge bg-success">Active</span>`
            : `<span class="badge bg-secondary">Inactive</span>`}</td>
          <td class="no-print">
            <button class="btn btn-sm btn-outline-secondary me-1" onclick="window._editMember(${m.id})">
              <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-sm btn-outline-${m.is_active ? "danger" : "success"} me-1" onclick="window._toggleMember(${m.id}, ${m.is_active})" title="${m.is_active ? "Deactivate" : "Activate"}">
              <i class="bi bi-person-${m.is_active ? "dash" : "check"}"></i>
            </button>
            ${isAdmin() ? `<button class="btn btn-sm btn-outline-danger" onclick="window._deleteMember(${m.id}, '${escHtml(m.name)}')" title="Permanently delete player"><i class="bi bi-trash"></i></button>` : ""}
          </td>
        </tr>`).join("");
}

function openModal(member = null) {
    editingId = member ? member.id : null;
    document.getElementById("memberModalTitle").textContent = member ? "Edit Member" : "Add Member";
    const form = document.getElementById("member-form");
    form.reset();
    if (member) {
        form.name.value = member.name;
        form.email.value = member.email ?? "";
        form.phone.value = member.phone ?? "";
        form.jersey_name.value = member.jersey_name ?? "";
        form.jersey_number.value = member.jersey_number ?? "";
        form.role.value = member.role ?? "";
        form.ball_type.value = member.ball_type ?? "";
        form.dcb_id.value = member.dcb_id ?? "";
        form.cricheroes.checked = member.cricheroes ?? false;
        form.cricclubs.checked = member.cricclubs ?? false;
        form.notes.value = member.notes ?? "";
    }
    modal.show();
}

async function onSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const body = {
        name: form.name.value.trim(),
        email: form.email.value.trim() || null,
        phone: form.phone.value.trim() || null,
        jersey_name: form.jersey_name.value.trim() || null,
        jersey_number: form.jersey_number.value ? parseInt(form.jersey_number.value) : null,
        role: form.role.value || null,
        ball_type: form.ball_type.value || null,
        dcb_id: form.dcb_id.value.trim() || null,
        cricheroes: form.cricheroes.checked,
        cricclubs: form.cricclubs.checked,
        notes: form.notes.value.trim() || null,
    };
    try {
        if (editingId) {
            await apiFetch(`/members/${editingId}`, { method: "PUT", body: JSON.stringify(body) });
            showToast("Member updated");
        } else {
            await apiFetch("/members", { method: "POST", body: JSON.stringify(body) });
            showToast("Member added");
        }
        modal.hide();
        load();
    } catch (err) {
        showToast(err.message, "error");
    }
}

window._editMember = (id) => {
    const member = allMembers.find((m) => m.id === id);
    if (member) openModal(member);
};

window._toggleField = async (id, field, value) => {
    try {
        await apiFetch(`/members/${id}`, { method: "PUT", body: JSON.stringify({ [field]: value }) });
        const m = allMembers.find((m) => m.id === id);
        if (m) m[field] = value;
    } catch (e) {
        showToast(e.message, "error");
        load(); // revert checkbox on failure
    }
};

window._toggleMember = async (id, isActive) => {
    const action = isActive ? "Deactivate" : "Activate";
    if (!confirm(`${action} this member?`)) return;
    try {
        await apiFetch(`/members/${id}`, { method: "PUT", body: JSON.stringify({ is_active: !isActive }) });
        showToast(`Member ${action.toLowerCase()}d`);
        load();
    } catch (e) {
        showToast(e.message, "error");
    }
};

window._deleteMember = async (id, name) => {
    if (!confirm(`Permanently delete "${name}"?\n\nThis will remove all their availability, reporting, fee, and squad records. This cannot be undone.`)) return;
    try {
        await apiFetch(`/members/${id}/purge`, { method: "DELETE" });
        showToast(`"${name}" permanently deleted`);
        load();
    } catch (e) {
        showToast(e.message, "error");
    }
};
