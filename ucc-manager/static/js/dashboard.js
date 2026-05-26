import { apiFetch, fmt, typeBadge } from "/js/api.js";

export async function init() {
  const data = await apiFetch("/reports/dashboard");

  document.getElementById("stat-income").textContent = fmt.currency(data.total_income);
  document.getElementById("stat-expense").textContent = fmt.currency(data.total_expense);
  const bal = document.getElementById("stat-balance");
  bal.textContent = fmt.currency(data.balance);
  bal.className = `fs-3 fw-bold ${data.balance >= 0 ? "text-success" : "text-danger"}`;
  document.getElementById("stat-count").textContent = data.transaction_count;

  const tbody = document.getElementById("recent-tbody");
  if (!data.recent_transactions.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-3">No transactions yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = data.recent_transactions.map((t) => `
    <tr>
      <td>${fmt.date(t.date)}</td>
      <td>${typeBadge(t.type)}</td>
      <td>${t.category ? t.category.name : "<span class='text-muted'>—</span>"}</td>
      <td>${t.description || "<span class='text-muted'>—</span>"}</td>
      <td class="text-end fw-semibold ${t.type === "income" ? "text-success" : "text-danger"}">
        ${t.type === "expense" ? "-" : "+"}${fmt.currency(t.amount)}
      </td>
    </tr>`).join("");
}
