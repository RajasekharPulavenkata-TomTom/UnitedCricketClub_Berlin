import { apiFetch, fmt } from "/js/api.js";
import { fetchWeather, wmoInfo, swingInfo } from "/js/weather.js?v=4";

export async function init() {
    const now = new Date();
    const months = [0, 1, 2].map((d) => {
        const m = new Date(now.getFullYear(), now.getMonth() + d, 1);
        return { year: m.getFullYear(), month: m.getMonth() + 1 };
    });

    const [members, equipment, finance, tasks, ...eventPages] = await Promise.all([
        apiFetch("/members"),
        apiFetch("/equipment?active_only=true"),
        apiFetch("/reports/dashboard"),
        apiFetch("/tasks"),
        ...months.map((m) => apiFetch(`/events?year=${m.year}&month=${m.month}`)),
    ]);

    const todayStr = now.toISOString().split("T")[0];
    const upcoming = eventPages.flat()
        .filter((e) => e.date >= todayStr)
        .sort((a, b) => a.date.localeCompare(b.date));

    const activeCount = members.filter((m) => m.is_active).length;

    renderMembers(members);
    renderEquipment(equipment);
    renderFinance(finance);
    renderEvents(upcoming, activeCount);
    renderTasks(tasks);
}

function renderMembers(members) {
    const active = members.filter((m) => m.is_active);
    const total = members.length;

    document.getElementById("home-total-members").textContent = total;
    document.getElementById("home-active-members").textContent = `${active.length} active`;

    const byBall = { Tennis: 0, Leather: 0, Both: 0, "—": 0 };
    active.forEach((m) => { byBall[m.ball_type || "—"]++; });

    const cricheroes = active.filter((m) => m.cricheroes).length;
    const cricclubs  = active.filter((m) => m.cricclubs).length;
    const dcb        = active.filter((m) => m.dcb_id).length;

    document.getElementById("home-member-breakdown").innerHTML = `
      <div class="mb-3">
        <div class="small text-muted fw-semibold mb-2">Ball Type</div>
        ${ballRow("Tennis",  byBall.Tennis,  active.length, "bg-warning text-dark")}
        ${ballRow("Leather", byBall.Leather, active.length, "bg-danger")}
        ${ballRow("Both",    byBall.Both,    active.length, "bg-success")}
        ${byBall["—"] ? ballRow("Not set", byBall["—"], active.length, "bg-secondary") : ""}
      </div>
      <hr class="my-2" />
      <div class="small text-muted fw-semibold mb-2">Registrations</div>
      ${regRow("bi-trophy", "CricHeroes", cricheroes, active.length)}
      ${regRow("bi-building", "CricClubs",  cricclubs,  active.length)}
      ${regRow("bi-card-text", "DCB ID",     dcb,        active.length)}
    `;
}

function ballRow(label, count, total, badgeClass) {
    const pct = total ? Math.round(count / total * 100) : 0;
    return `
      <div class="d-flex align-items-center gap-2 mb-1">
        <span class="badge ${badgeClass}" style="width:70px">${label}</span>
        <div class="progress flex-grow-1" style="height:8px">
          <div class="progress-bar ${badgeClass}" style="width:${pct}%"></div>
        </div>
        <span class="text-muted small" style="width:24px;text-align:right">${count}</span>
      </div>`;
}

function regRow(icon, label, count, total) {
    const pct = total ? Math.round(count / total * 100) : 0;
    return `
      <div class="d-flex align-items-center gap-2 mb-1">
        <i class="bi ${icon} text-muted" style="width:16px"></i>
        <span class="small" style="width:80px">${label}</span>
        <div class="progress flex-grow-1" style="height:8px">
          <div class="progress-bar bg-primary" style="width:${pct}%"></div>
        </div>
        <span class="text-muted small" style="width:42px;text-align:right">${count}/${total}</span>
      </div>`;
}

function renderEquipment(equipment) {
    const totalItems = equipment.reduce((s, e) => s + e.quantity_total, 0);
    const totalAvail = equipment.reduce((s, e) => s + e.quantity_available, 0);

    document.getElementById("home-total-equipment").textContent = totalItems;
    document.getElementById("home-available-equipment").textContent = `${totalAvail} available`;

    const byType = {};
    equipment.forEach((e) => {
        if (!byType[e.type]) byType[e.type] = { total: 0, available: 0 };
        byType[e.type].total     += e.quantity_total;
        byType[e.type].available += e.quantity_available;
    });

    const rows = Object.entries(byType)
        .sort((a, b) => b[1].total - a[1].total)
        .map(([type, { total, available }]) => {
            const out = total - available;
            return `
              <div class="d-flex align-items-center justify-content-between mb-2">
                <span class="text-capitalize small">${type}</span>
                <div class="d-flex gap-1 align-items-center">
                  <span class="badge bg-success">${available} avail</span>
                  ${out > 0 ? `<span class="badge bg-secondary">${out} out</span>` : ""}
                </div>
              </div>`;
        }).join("");

    document.getElementById("home-equipment-breakdown").innerHTML = rows ||
        `<p class="text-muted small">No equipment.</p>`;
}

function renderEvents(events, activeCount) {
    const el = document.getElementById("home-events");
    if (!events.length) {
        el.innerHTML = `<p class="text-muted small text-center py-3 mb-0">No upcoming events.</p>`;
        return;
    }

    const typeColor = { match: "bg-primary", training: "bg-success", other: "bg-secondary" };

    el.innerHTML = `<div class="table-responsive"><table class="table table-hover mb-0">
      <thead class="table-light">
        <tr>
          <th>Date</th><th>Event</th><th class="text-center">Available</th>
          <th class="text-center">Unavailable</th><th class="text-center">Maybe</th><th class="text-center">No Reply</th>
        </tr>
      </thead>
      <tbody>
        ${events.map((e) => {
            const total = e.available_count + e.unavailable_count + e.maybe_count;
            const noReply = activeCount - total;
            return `<tr style="cursor:pointer" onclick="location.hash='calendar'">
              <td class="text-nowrap">${fmt.date(e.date)}</td>
              <td>
                <span class="badge ${typeColor[e.type] || "bg-secondary"} me-2">${e.type}</span>
                <span class="fw-medium">${e.title}</span>
                ${e.notes ? `<small class="text-muted ms-2">${e.notes}</small>` : ""}
                <div id="home-wx-${e.id}" class="text-muted small mt-1"></div>
              </td>
              <td class="text-center"><span class="badge bg-success">${e.available_count}</span></td>
              <td class="text-center"><span class="badge bg-danger">${e.unavailable_count}</span></td>
              <td class="text-center"><span class="badge bg-warning text-dark">${e.maybe_count}</span></td>
              <td class="text-center"><span class="badge bg-light text-muted border">${noReply < 0 ? 0 : noReply}</span></td>
            </tr>`;
        }).join("")}
      </tbody>
    </table></div>`;

    events.forEach((e) => {
        fetchWeather(e.date).then((w) => {
            const cell = document.getElementById(`home-wx-${e.id}`);
            if (!cell || !w) return;
            const { icon, color, label } = wmoInfo(w.code);
            const swing = swingInfo(w);
            cell.innerHTML = `<i class="bi ${icon} me-1" style="color:${color}" title="${label}"></i>${w.maxT}°C / ${w.minT}°C` +
                `&nbsp;&nbsp;<span class="badge ${swing.badgeClass}" title="${swing.reason}"><i class="bi bi-wind me-1"></i>${swing.level} swing</span>`;
        });
    });
}

function renderTasks(tasks) {
    const open = tasks.filter(t => t.status !== "done");
    const inProgress = tasks.filter(t => t.status === "in_progress").length;
    const todo = tasks.filter(t => t.status === "todo").length;

    document.getElementById("home-open-tasks").textContent = open.length;
    document.getElementById("home-tasks-sub").textContent =
        `${inProgress} in progress · ${todo} to do`;

    const el = document.getElementById("home-tasks-list");
    if (!open.length) {
        el.innerHTML = `<p class="text-muted small text-center py-3 mb-0">No open tasks.</p>`;
        return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const statusColor = { todo: "#ffe5d0", in_progress: "#cfe2ff" };
    const statusLabel = { todo: "To Do", in_progress: "In Progress" };

    const preview = open.slice(0, 6);
    el.innerHTML = `<ul class="list-group list-group-flush">
        ${preview.map(t => {
            const overdue = t.due_date && t.due_date < today;
            const bg = overdue ? "#fff3cd" : (statusColor[t.status] || "");
            return `
            <li class="list-group-item px-3 py-2" style="background:${bg}">
              <div class="d-flex justify-content-between align-items-start">
                <div class="small fw-semibold text-truncate me-2" style="max-width:140px">${t.title}</div>
                <span class="badge ${t.status === "in_progress" ? "bg-primary" : "bg-warning text-dark"} text-nowrap">
                  ${statusLabel[t.status]}
                </span>
              </div>
              <div class="text-muted" style="font-size:.75rem">
                ${t.assigned_to ? t.assigned_to.name : "Unassigned"}
                ${t.due_date ? ` · <span class="${overdue ? "text-danger fw-semibold" : ""}">${fmt.date(t.due_date)}</span>` : ""}
              </div>
            </li>`;
        }).join("")}
    </ul>`;
}

function renderFinance(data) {
    const bal = document.getElementById("home-balance");
    bal.textContent = fmt.currency(data.balance);
    bal.className   = `fs-2 fw-bold ${data.balance >= 0 ? "text-success" : "text-danger"}`;
    document.getElementById("home-balance-sub").textContent =
        `${fmt.currency(data.total_income)} in · ${fmt.currency(data.total_expense)} out`;

    const txList = (data.recent_transactions || []).slice(0, 6);
    if (!txList.length) {
        document.getElementById("home-recent-tx").innerHTML =
            `<p class="text-muted small text-center py-3">No transactions yet.</p>`;
        return;
    }
    document.getElementById("home-recent-tx").innerHTML = `
      <ul class="list-group list-group-flush">
        ${txList.map((t) => `
          <li class="list-group-item d-flex justify-content-between align-items-start px-3 py-2">
            <div>
              <div class="small fw-semibold">${t.description || "—"}</div>
              <div class="text-muted" style="font-size:.75rem">${fmt.date(t.date)}</div>
            </div>
            <span class="fw-semibold ${t.type === "income" ? "text-success" : "text-danger"}">
              ${t.type === "expense" ? "-" : "+"}${fmt.currency(t.amount)}
            </span>
          </li>`).join("")}
      </ul>`;
}
