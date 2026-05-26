import { apiFetch, fmt, showToast, typeBadge } from "/js/api.js";

export async function init() {
    // Tab switching
    document.querySelectorAll("#approvalTabs button").forEach((btn) => {
        btn.addEventListener("click", () => {
            document.querySelectorAll("#approvalTabs button").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            const tab = btn.dataset.tab;
            document.getElementById("tab-transactions").style.display = tab === "transactions" ? "" : "none";
            document.getElementById("tab-assignments").style.display = tab === "assignments" ? "" : "none";
        });
    });

    await Promise.all([loadPendingTransactions(), loadPendingAssignments()]);
}

async function loadPendingTransactions() {
    const tbody = document.getElementById("pending-tx-tbody");
    try {
        const data = await apiFetch("/transactions?status=pending&limit=500");
        const badge = document.getElementById("tx-count-badge");
        if (data.length) { badge.textContent = data.length; badge.style.display = ""; }
        else badge.style.display = "none";

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

async function loadPendingAssignments() {
    const tbody = document.getElementById("pending-assign-tbody");
    try {
        const data = await apiFetch("/assignments?status=pending&limit=500");
        const badge = document.getElementById("assign-count-badge");
        if (data.length) { badge.textContent = data.length; badge.style.display = ""; }
        else badge.style.display = "none";

        if (!data.length) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-success"><i class="bi bi-check-circle me-2"></i>No pending assignment requests.</td></tr>`;
            return;
        }
        tbody.innerHTML = data.map((a) => `
          <tr>
            <td class="fw-semibold">${a.member_name}</td>
            <td>${a.equipment ? a.equipment.name : a.equipment_id}</td>
            <td class="text-center">${a.quantity_assigned}</td>
            <td>${fmt.date(a.assigned_date)}</td>
            <td>${a.expected_return_date ? fmt.date(a.expected_return_date) : "—"}</td>
            <td><span class="text-muted small">ID #${a.created_by_id || "?"}</span></td>
            <td>
              <button class="btn btn-sm btn-success me-1" onclick="window._approveAssignA(${a.id})"><i class="bi bi-check-lg me-1"></i>Approve</button>
              <button class="btn btn-sm btn-outline-secondary" onclick="window._rejectAssignA(${a.id})"><i class="bi bi-x-lg me-1"></i>Reject</button>
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
window._approveAssignA = async (id) => {
    try {
        await apiFetch(`/approvals/assignments/${id}/approve`, { method: "POST" });
        showToast("Assignment approved — inventory updated");
        loadPendingAssignments();
    } catch (e) { showToast(e.message, "error"); }
};
window._rejectAssignA = async (id) => {
    if (!confirm("Reject this request?")) return;
    try {
        await apiFetch(`/approvals/assignments/${id}/reject`, { method: "POST" });
        showToast("Assignment request rejected");
        loadPendingAssignments();
    } catch (e) { showToast(e.message, "error"); }
};
