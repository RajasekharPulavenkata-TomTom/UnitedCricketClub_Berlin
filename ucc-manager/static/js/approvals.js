import { apiFetch, fmt, showToast } from "/js/api.js";

export async function init() {
    await loadPendingUsers();
}

async function loadPendingUsers() {
    const tbody = document.getElementById("pending-users-tbody");
    try {
        const data = await apiFetch("/auth/users/pending");
        if (!data.length) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-success"><i class="bi bi-check-circle me-2"></i>No pending registrations.</td></tr>`;
            return;
        }
        tbody.innerHTML = data.map((u) => `
          <tr>
            <td class="fw-semibold">${u.username}</td>
            <td>${u.full_name || "—"}</td>
            <td class="text-muted small">${fmt.date(u.created_at.slice(0, 10))}</td>
            <td>
              <button class="btn btn-sm btn-success me-1" onclick="window._approveUser(${u.id})"><i class="bi bi-check-lg me-1"></i>Approve</button>
              <button class="btn btn-sm btn-outline-danger" onclick="window._rejectUser(${u.id})"><i class="bi bi-x-lg me-1"></i>Reject</button>
            </td>
          </tr>`).join("");
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-danger text-center">${e.message}</td></tr>`;
    }
}

window._approveUser = async (id) => {
    try {
        await apiFetch(`/auth/users/${id}/approve`, { method: "PUT" });
        showToast("User approved");
        loadPendingUsers();
    } catch (e) { showToast(e.message, "error"); }
};
window._rejectUser = async (id) => {
    if (!confirm("Reject this registration?")) return;
    try {
        await apiFetch(`/auth/users/${id}/reject`, { method: "PUT" });
        showToast("Registration rejected");
        loadPendingUsers();
    } catch (e) { showToast(e.message, "error"); }
};

