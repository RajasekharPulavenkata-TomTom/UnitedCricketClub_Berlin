import { apiFetch, fmt } from "/js/api.js";

let chart = null;

function _ensureChartJs() {
    if (window.Chart) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js";
        s.onload = resolve;
        s.onerror = () => reject(new Error("Failed to load Chart.js"));
        document.head.appendChild(s);
    });
}

export async function init() {
  const yearSel = document.getElementById("year-select");
  const currentYear = new Date().getFullYear();
  for (let y = currentYear; y >= currentYear - 5; y--) {
    yearSel.insertAdjacentHTML("beforeend", `<option value="${y}">${y}</option>`);
  }
  yearSel.addEventListener("change", () => loadReports(parseInt(yearSel.value)));
  loadReports(currentYear);
}

async function loadReports(year) {
  const [[monthly, cats]] = await Promise.all([
    Promise.all([
      apiFetch(`/reports/monthly?year=${year}`),
      apiFetch(`/reports/by-category`),
    ]),
    _ensureChartJs(),
  ]);

  renderChart(monthly);
  renderMonthlyTable(monthly);
  renderCategoryTable(cats);
}

function renderChart(monthly) {
  if (chart) chart.destroy();
  const labels = monthly.map((m) => fmt.monthName(m.month));
  const income = monthly.map((m) => m.income);
  const expense = monthly.map((m) => m.expense);

  chart = new Chart(document.getElementById("monthly-chart"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Income", data: income, backgroundColor: "rgba(25,135,84,0.75)", borderRadius: 4 },
        { label: "Expense", data: expense, backgroundColor: "rgba(220,53,69,0.75)", borderRadius: 4 },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "top" } },
      scales: {
        y: { ticks: { callback: (v) => "€" + v.toFixed(0) } },
      },
    },
  });
}

function renderMonthlyTable(monthly) {
  const tbody = document.getElementById("monthly-tbody");
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  tbody.innerHTML = monthly.map((m, i) => `
    <tr>
      <td>${MONTHS[i]}</td>
      <td class="text-end text-success">${fmt.currency(m.income)}</td>
      <td class="text-end text-danger">${fmt.currency(m.expense)}</td>
      <td class="text-end fw-semibold ${m.net >= 0 ? "text-success" : "text-danger"}">${fmt.currency(m.net)}</td>
      <td class="text-end fw-semibold text-primary">${fmt.currency(m.running_balance)}</td>
    </tr>`).join("");
}

function renderCategoryTable(cats) {
  const tbody = document.getElementById("cat-tbody");
  if (!cats.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">No data.</td></tr>`;
    return;
  }
  const sorted = [...cats].sort((a, b) => b.total - a.total);
  tbody.innerHTML = sorted.map((c) => `
    <tr>
      <td>${c.category_name}</td>
      <td><span class="badge ${c.type === "income" ? "bg-success" : "bg-danger"}">${c.type}</span></td>
      <td class="text-end fw-semibold">${fmt.currency(c.total)}</td>
      <td class="text-end text-muted">${c.count}</td>
    </tr>`).join("");
}
