import { apiFetch, fmt, showToast, typeBadge } from "/js/api.js";

export async function init() {
    await Promise.all([loadPendingUsers(), loadPendingTransactions()]);
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

async function loadPendingTransactions() {
    const tbody = document.getElementById("pending-tx-tbody");
    try {
        const data = await apiFetch("/transactions?status=pending&limit=500");
        if (!data.length) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-success"><i class="bi bi-check-circle me-2"></i>No pending transactions.</td></tr>`;
            return;
        }
        tbody.innerHTML = data.map((t) => `
          <tr>
            <td>${fmt.date(t.date)}</td>
            <td>${typeBadge(t.type)}</td>
            <td>${t.category ? t.category.name : "—"}</td>
            <td>${t.description || "—"}</td>
            <td class="text-end fw-semibold ${t.type === "income" ? "text-success" : "text-danger"}">
              ${fmt.currency(t.amount)}
            </td>
            <td><span class="text-muted small">ID #${t.created_by_id || "?"}</span></td>
            <td>
              <button class="btn btn-sm btn-success me-1" onclick="window._approveTxA(${t.id})"><i class="bi bi-check-lg me-1"></i>Approve</button>
              <button class="btn btn-sm btn-outline-secondary" onclick="window._rejectTxA(${t.id})"><i class="bi bi-x-lg me-1"></i>Reject</button>
            </td>
          </tr>`).join("");
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-danger text-center">${e.message}</td></tr>`;
    }
}

window._approveTxA = async (id) => {
    try {
        await apiFetch(`/approvals/transactions/${id}/approve`, { method: "POST" });
        showToast("Transaction approved");
        loadPendingTransactions();
    } catch (e) { showToast(e.message, "error"); }
};
window._rejectTxA = async (id) => {
    if (!confirm("Reject this transaction?")) return;
    try {
        await apiFetch(`/approvals/transactions/${id}/reject`, { method: "POST" });
        showToast("Transaction rejected");
        loadPendingTransactions();
    } catch (e) { showToast(e.message, "error"); }
};
