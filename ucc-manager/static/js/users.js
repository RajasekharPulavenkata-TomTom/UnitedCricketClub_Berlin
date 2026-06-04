import { apiFetch, showToast, escHtml } from "/js/api.js";
import { roleBadge } from "/js/auth.js";

let modal, pwModal;
let editingId = null;
let allUsers = [];

export async function init() {
    modal = new bootstrap.Modal(document.getElementById("userModal"));
    pwModal = new bootstrap.Modal(document.getElementById("pwModal"));

    document.getElementById("btn-add-user").addEventListener("click", () => openModal());
    document.getElementById("user-form").addEventListener("submit", onSubmit);
    document.getElementById("pw-form").addEventListener("submit", onPasswordReset);

    await Promise.all([loadPending(), load()]);
}

async function loadPending() {
    const section = document.getElementById("pending-reg-section");
    const tbody = document.getElementById("pending-reg-tbody");
    const countBadge = document.getElementById("pending-reg-count");
    try {
        const users = await apiFetch("/auth/users/pending");
        if (users.length === 0) {
            section.classList.add("d-none");
            return;
        }
        section.classList.remove("d-none");
        countBadge.textContent = users.length;
        tbody.innerHTML = users.map((u) => `
          <tr>
            <td class="fw-semibold">${escHtml(u.username)}</td>
            <td>${u.full_name ? escHtml(u.full_name) : "<span class='text-muted'>—</span>"}</td>
            <td class="text-muted small">${new Date(u.created_at).toLocaleDateString("en-GB")}</td>
            <td>
              <button class="btn btn-sm btn-success me-1" onclick="window._approveUser(${u.id})"><i class="bi bi-check-lg me-1"></i>Approve</button>
              <button class="btn btn-sm btn-danger" onclick="window._rejectUser(${u.id})"><i class="bi bi-x-lg me-1"></i>Reject</button>
            </td>
          </tr>`).join("");
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-danger text-center">${e.message}</td></tr>`;
    }
}

async function load() {
    const tbody = document.getElementById("users-tbody");
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-3"><div class="spinner-border spinner-border-sm"></div></td></tr>`;
    try {
        allUsers = await apiFetch("/auth/users");
        tbody.innerHTML = allUsers.map((u) => `
          <tr class="${!u.is_active ? "table-secondary" : ""}">
            <td class="fw-semibold">${escHtml(u.username)}</td>
            <td>${u.full_name ? escHtml(u.full_name) : "<span class='text-muted'>—</span>"}</td>
            <td>${roleBadge(u.role)}</td>
            <td>${statusBadge(u)}</td>
            <td class="text-muted small">${new Date(u.created_at).toLocaleDateString("en-GB")}</td>
            <td>
              <button class="btn btn-sm btn-outline-secondary me-1" onclick="window._editUser(${u.id})"><i class="bi bi-pencil"></i></button>
              <button class="btn btn-sm btn-outline-warning me-1" onclick="window._resetPw(${u.id})" title="Reset password"><i class="bi bi-key"></i></button>
              <button class="btn btn-sm ${u.is_active ? "btn-outline-danger" : "btn-outline-success"}" onclick="window._toggleUser(${u.id}, ${u.is_active})" title="${u.is_active ? "Deactivate" : "Reactivate"}">
                <i class="bi bi-${u.is_active ? "slash-circle" : "check-circle"}"></i>
              </button>
            </td>
          </tr>`).join("");
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-danger text-center">${e.message}</td></tr>`;
    }
}

function statusBadge(u) {
    if (!u.is_active) return '<span class="badge bg-secondary">Inactive</span>';
    if (u.status === "pending") return '<span class="badge bg-warning text-dark">Pending</span>';
    if (u.status === "rejected") return '<span class="badge bg-danger">Rejected</span>';
    return '<span class="badge bg-success">Active</span>';
}

function openModal(user = null) {
    editingId = user ? user.id : null;
    document.getElementById("userModalTitle").textContent = user ? "Edit User" : "Add User";
    const form = document.getElementById("user-form");
    form.reset();
    const pwField = document.getElementById("password-field");
    if (user) {
        form.username.value = user.username;
        form.username.readOnly = true;
        form.full_name.value = user.full_name || "";
        form.role.value = user.role;
        pwField.style.display = "none";
        form.password.required = false;
    } else {
        form.username.readOnly = false;
        pwField.style.display = "";
        form.password.required = true;
    }
    modal.show();
}

async function onSubmit(e) {
    e.preventDefault();
    const form = e.target;
    try {
        if (editingId) {
            await apiFetch(`/auth/users/${editingId}`, {
                method: "PUT",
                body: JSON.stringify({ full_name: form.full_name.value || null, role: form.role.value }),
            });
            showToast("User updated");
        } else {
            await apiFetch("/auth/users", {
                method: "POST",
                body: JSON.stringify({
                    username: form.username.value.trim(),
                    full_name: form.full_name.value || null,
                    role: form.role.value,
                    password: form.password.value,
                }),
            });
            showToast("User created");
        }
        modal.hide();
        load();
    } catch (err) {
        showToast(err.message, "error");
    }
}

async function onPasswordReset(e) {
    e.preventDefault();
    const form = e.target;
    const userId = parseInt(form.user_id.value);
    try {
        await apiFetch(`/auth/users/${userId}/password`, {
            method: "PUT",
            body: JSON.stringify({ new_password: form.new_password.value }),
        });
        showToast("Password reset");
        pwModal.hide();
    } catch (err) {
        showToast(err.message, "error");
    }
}

window._editUser = (id) => { const u = allUsers.find(u => u.id === id); if (u) openModal(u); };

window._resetPw = (id) => {
    document.getElementById("pw-form").reset();
    document.querySelector("#pw-form [name=user_id]").value = id;
    pwModal.show();
};

window._toggleUser = async (id, currentlyActive) => {
    const action = currentlyActive ? "Deactivate" : "Reactivate";
    if (!confirm(`${action} this user?`)) return;
    try {
        await apiFetch(`/auth/users/${id}`, {
            method: "PUT",
            body: JSON.stringify({ is_active: !currentlyActive }),
        });
        showToast(`User ${action.toLowerCase()}d`);
        load();
    } catch (e) { showToast(e.message, "error"); }
};

window._approveUser = async (id) => {
    try {
        await apiFetch(`/auth/users/${id}/approve`, { method: "PUT" });
        showToast("User approved");
        await Promise.all([loadPending(), load()]);
        // update nav badge
        const badge = document.getElementById("reg-badge");
        if (badge) {
            const pending = await apiFetch("/auth/users/pending").catch(() => []);
            badge.textContent = pending.length;
            badge.style.display = pending.length > 0 ? "" : "none";
        }
    } catch (e) { showToast(e.message, "error"); }
};

window._rejectUser = async (id) => {
    if (!confirm("Reject this registration request?")) return;
    try {
        await apiFetch(`/auth/users/${id}/reject`, { method: "PUT" });
        showToast("Registration rejected");
        await Promise.all([loadPending(), load()]);
        const badge = document.getElementById("reg-badge");
        if (badge) {
            const pending = await apiFetch("/auth/users/pending").catch(() => []);
            badge.textContent = pending.length;
            badge.style.display = pending.length > 0 ? "" : "none";
        }
    } catch (e) { showToast(e.message, "error"); }
};
