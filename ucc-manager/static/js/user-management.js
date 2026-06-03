import { apiFetch, fmt, showToast } from "/js/api.js";

let addModal, editModal, pwdModal;
let allUsers = [];

export async function init() {
    addModal  = new bootstrap.Modal(document.getElementById("umAddModal"));
    editModal = new bootstrap.Modal(document.getElementById("umEditModal"));
    pwdModal  = new bootstrap.Modal(document.getElementById("umPwdModal"));

    document.getElementById("btn-add-user").addEventListener("click", () => {
        document.getElementById("um-add-form").reset();
        document.getElementById("um-add-error").classList.add("d-none");
        addModal.show();
    });

    document.getElementById("um-add-form").addEventListener("submit", onAdd);
    document.getElementById("um-edit-form").addEventListener("submit", onEdit);
    document.getElementById("um-pwd-form").addEventListener("submit", onResetPwd);
    document.getElementById("um-search").addEventListener("input", render);
    document.getElementById("um-filter-status").addEventListener("change", render);

    await load();
}

async function load() {
    const tbody = document.getElementById("um-tbody");
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-3"><div class="spinner-border spinner-border-sm"></div></td></tr>`;
    try {
        allUsers = await apiFetch("/auth/users");
        render();
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-danger text-center">${e.message}</td></tr>`;
    }
}

function render() {
    const search = document.getElementById("um-search").value.toLowerCase();
    const statusFilter = document.getElementById("um-filter-status").value;
    const tbody = document.getElementById("um-tbody");

    let list = allUsers;
    if (search) list = list.filter(u => u.username.toLowerCase().includes(search) || (u.full_name || "").toLowerCase().includes(search));
    if (statusFilter) list = list.filter(u => u.status === statusFilter);

    if (!list.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">No users found.</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(u => {
        const roleBadge = { root: "bg-danger", admin: "bg-warning text-dark", user: "bg-secondary" };
        const statusBadge = { active: "bg-success", pending: "bg-warning text-dark", rejected: "bg-secondary" };
        const actions = u.status === "pending"
            ? `<button class="btn btn-sm btn-success me-1" onclick="window._umApprove(${u.id})" title="Approve"><i class="bi bi-check-lg"></i></button>
               <button class="btn btn-sm btn-outline-danger me-1" onclick="window._umReject(${u.id})" title="Reject"><i class="bi bi-x-lg"></i></button>`
            : `<button class="btn btn-sm btn-outline-${u.is_active ? "danger" : "success"} me-1" onclick="window._umToggle(${u.id}, ${u.is_active})" title="${u.is_active ? "Deactivate" : "Activate"}">
                 <i class="bi bi-person-${u.is_active ? "dash" : "check"}"></i>
               </button>`;
        return `<tr>
          <td class="fw-semibold">${u.username}</td>
          <td>${u.full_name || "—"}</td>
          <td><span class="badge ${roleBadge[u.role] || "bg-secondary"}">${u.role}</span></td>
          <td><span class="badge ${statusBadge[u.status] || "bg-secondary"}">${u.status}</span></td>
          <td class="text-muted small">${fmt.date(u.created_at.slice(0, 10))}</td>
          <td class="no-print">
            <button class="btn btn-sm btn-outline-secondary me-1" onclick="window._umEdit(${u.id})" title="Edit"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-secondary me-1" onclick="window._umResetPwd(${u.id})" title="Reset Password"><i class="bi bi-key"></i></button>
            ${actions}
          </td>
        </tr>`;
    }).join("");
}

async function onAdd(e) {
    e.preventDefault();
    const form = e.target;
    const errEl = document.getElementById("um-add-error");
    errEl.classList.add("d-none");
    try {
        await apiFetch("/auth/users", {
            method: "POST",
            body: JSON.stringify({
                username: form.username.value.trim(),
                full_name: form.full_name.value.trim() || null,
                password: form.password.value,
                role: form.role.value,
            }),
        });
        showToast("User created");
        addModal.hide();
        load();
    } catch (e) {
        errEl.textContent = e.message;
        errEl.classList.remove("d-none");
    }
}

async function onEdit(e) {
    e.preventDefault();
    const form = e.target;
    const id = parseInt(form.id.value);
    const errEl = document.getElementById("um-edit-error");
    errEl.classList.add("d-none");
    try {
        await apiFetch(`/auth/users/${id}`, {
            method: "PUT",
            body: JSON.stringify({
                full_name: form.full_name.value.trim() || null,
                role: form.role.value,
            }),
        });
        showToast("User updated");
        editModal.hide();
        load();
    } catch (e) {
        errEl.textContent = e.message;
        errEl.classList.remove("d-none");
    }
}

async function onResetPwd(e) {
    e.preventDefault();
    const form = e.target;
    const id = parseInt(form.id.value);
    const errEl = document.getElementById("um-pwd-error");
    errEl.classList.add("d-none");
    try {
        await apiFetch(`/auth/users/${id}/password`, {
            method: "PUT",
            body: JSON.stringify({ new_password: form.new_password.value }),
        });
        showToast("Password reset");
        pwdModal.hide();
    } catch (e) {
        errEl.textContent = e.message;
        errEl.classList.remove("d-none");
    }
}

window._umEdit = (id) => {
    const u = allUsers.find(u => u.id === id);
    if (!u) return;
    const form = document.getElementById("um-edit-form");
    form.id.value = u.id;
    form.full_name.value = u.full_name || "";
    form.role.value = u.role;
    document.getElementById("um-edit-error").classList.add("d-none");
    editModal.show();
};

window._umResetPwd = (id) => {
    const u = allUsers.find(u => u.id === id);
    if (!u) return;
    const form = document.getElementById("um-pwd-form");
    form.id.value = u.id;
    form.new_password.value = "";
    document.getElementById("um-pwd-username").textContent = u.username;
    document.getElementById("um-pwd-error").classList.add("d-none");
    pwdModal.show();
};

window._umApprove = async (id) => {
    try {
        await apiFetch(`/auth/users/${id}/approve`, { method: "PUT" });
        showToast("User approved");
        load();
    } catch (e) { showToast(e.message, "error"); }
};

window._umReject = async (id) => {
    if (!confirm("Reject this registration?")) return;
    try {
        await apiFetch(`/auth/users/${id}/reject`, { method: "PUT" });
        showToast("Registration rejected");
        load();
    } catch (e) { showToast(e.message, "error"); }
};

window._umToggle = async (id, isActive) => {
    const action = isActive ? "Deactivate" : "Activate";
    if (!confirm(`${action} this user?`)) return;
    try {
        await apiFetch(`/auth/users/${id}`, { method: isActive ? "DELETE" : "PUT", body: isActive ? undefined : JSON.stringify({ is_active: true }) });
        showToast(`User ${action.toLowerCase()}d`);
        load();
    } catch (e) { showToast(e.message, "error"); }
};
