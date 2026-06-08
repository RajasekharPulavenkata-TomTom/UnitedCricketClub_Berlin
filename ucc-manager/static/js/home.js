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
    renderNextEvent(upcoming, activeCount);
    renderSchedule(upcoming, activeCount);
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

function _homeAwayBadge(e) {
    if (e.home_away === "home")
        return `<span class="badge bg-warning text-dark"><i class="bi bi-house-fill me-1"></i>Home</span>`;
    if (e.home_away === "away")
        return `<span class="badge bg-secondary"><i class="bi bi-airplane-engines-fill me-1"></i>Away</span>`;
    return "";
}

function _countDown(dateStr) {
    const diffDays = Math.round((new Date(dateStr + "T12:00:00") - Date.now()) / 86400000);
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    return `In ${diffDays} days`;
}

function renderNextEvent(events, activeCount) {
    const el = document.getElementById("home-next-event");
    if (!events.length) {
        el.innerHTML = `<div class="card p-4 text-center text-muted">
            <i class="bi bi-calendar-x" style="font-size:2rem;opacity:.3"></i>
            <div class="mt-2">No upcoming events scheduled.</div>
        </div>`;
        return;
    }

    const e = events[0];
    const total    = e.available_count + e.unavailable_count + e.maybe_count;
    const noReply  = Math.max(0, activeCount - total);
    const isMatch  = e.type === "match";
    const typeIcon = isMatch ? "bi-cricket" : (e.type === "training" ? "bi-bullseye" : "bi-calendar-event");

    el.innerHTML = `
    <div class="next-event-card p-4 mb-2" onclick="location.hash='calendar'" style="cursor:pointer">
      <div class="next-event-label mb-2"><i class="bi bi-broadcast me-1"></i>${_countDown(e.date)} &mdash; Next Event</div>
      <div class="d-flex align-items-start justify-content-between flex-wrap gap-3">
        <div>
          <h3 class="mb-1 fw-bold" style="color:#fff">${e.title}</h3>
          <div class="d-flex flex-wrap gap-2 align-items-center mb-3">
            <span class="badge ${isMatch ? "bg-warning text-dark" : "bg-success"} px-2 py-1">
              <i class="bi ${typeIcon} me-1"></i>${e.type.charAt(0).toUpperCase() + e.type.slice(1)}
            </span>
            ${_homeAwayBadge(e)}
            ${e.match_type ? `<span class="badge bg-light text-dark">${e.match_type}</span>` : ""}
          </div>
          <div class="d-flex flex-wrap gap-3" style="opacity:.9;font-size:.9rem">
            <span><i class="bi bi-calendar3 me-1"></i>${fmt.date(e.date)}</span>
            ${e.match_time     ? `<span><i class="bi bi-stopwatch me-1"></i>${e.match_time.substring(0,5)}</span>`     : ""}
            ${e.reporting_time ? `<span><i class="bi bi-clock me-1"></i>Report ${e.reporting_time.substring(0,5)}</span>` : ""}
            ${e.location       ? `<span><i class="bi bi-geo-alt me-1"></i>${e.location}</span>`                         : ""}
          </div>
          <div id="home-wx-next" class="mt-2" style="opacity:.85;font-size:.85rem"></div>
        </div>
        <div class="d-flex flex-wrap gap-2">
          <div class="avail-pill" style="background:rgba(255,255,255,.15)">
            <i class="bi bi-check-circle-fill text-success"></i> ${e.available_count} Available
          </div>
          <div class="avail-pill" style="background:rgba(255,255,255,.15)">
            <i class="bi bi-x-circle-fill text-danger"></i> ${e.unavailable_count} Out
          </div>
          <div class="avail-pill" style="background:rgba(255,255,255,.15)">
            <i class="bi bi-question-circle-fill text-warning"></i> ${e.maybe_count} Maybe
          </div>
          ${noReply ? `<div class="avail-pill" style="background:rgba(255,255,255,.1);opacity:.7">
            <i class="bi bi-hourglass-split"></i> ${noReply} No reply
          </div>` : ""}
        </div>
      </div>
    </div>`;

    // Weather for next event
    const diffDays = Math.round((new Date(e.date + "T12:00:00") - Date.now()) / 86400000);
    const wxEl = document.getElementById("home-wx-next");
    if (wxEl) {
        if (diffDays > 15) {
            wxEl.innerHTML = `<i class="bi bi-cloud-slash me-1"></i>Forecast available closer to event`;
        } else {
            fetchWeather(e.date).then((w) => {
                if (!w || !wxEl) return;
                const { icon, color, label } = wmoInfo(w.code);
                const swing = swingInfo(w);
                wxEl.innerHTML = `<i class="bi ${icon} me-1" style="color:${color}" title="${label}"></i>${w.maxT}°C / ${w.minT}°C`
                    + `&nbsp;&nbsp;<span class="badge ${swing.badgeClass}" title="${swing.reason}"><i class="bi bi-wind me-1"></i>${swing.level} swing</span>`;
            });
        }
    }
}

function renderSchedule(events, activeCount) {
    const el = document.getElementById("home-schedule");
    const rest = events.slice(1, 8); // skip the first (shown as hero), show up to 7 more
    if (!rest.length) {
        el.innerHTML = `<p class="text-muted small text-center py-2 mb-0">No further events scheduled.</p>`;
        return;
    }

    const typeRowClass = { match: "event-row-match", training: "event-row-training", other: "event-row-other" };
    const typeEmoji    = { match: "🏏", training: "🎯", other: "📅" };

    el.innerHTML = `<div class="d-flex flex-column gap-2">
        ${rest.map(e => {
            const total   = e.available_count + e.unavailable_count + e.maybe_count;
            const noReply = Math.max(0, activeCount - total);
            return `
            <div class="event-row ${typeRowClass[e.type] || "event-row-other"}" onclick="location.hash='calendar'">
              <div class="d-flex align-items-start justify-content-between flex-wrap gap-2">
                <div>
                  <div class="d-flex align-items-center gap-2 flex-wrap">
                    <span class="fw-semibold">${typeEmoji[e.type] || "📅"} ${e.title}</span>
                    ${_homeAwayBadge(e)}
                    ${e.match_type ? `<span class="badge bg-light text-dark border" style="font-size:.65rem">${e.match_type}</span>` : ""}
                  </div>
                  <div class="text-muted small mt-1 d-flex flex-wrap gap-2">
                    <span><i class="bi bi-calendar3 me-1"></i>${fmt.date(e.date)}</span>
                    ${e.match_time     ? `<span><i class="bi bi-stopwatch me-1"></i>${e.match_time.substring(0,5)}</span>`       : ""}
                    ${e.reporting_time ? `<span><i class="bi bi-clock me-1"></i>Report ${e.reporting_time.substring(0,5)}</span>` : ""}
                    ${e.location       ? `<span><i class="bi bi-geo-alt me-1"></i>${e.location}</span>`                          : ""}
                  </div>
                  <div id="home-wx-${e.id}" class="text-muted small mt-1"></div>
                </div>
                <div class="d-flex gap-1 flex-wrap align-items-center" style="font-size:.78rem">
                  <span class="badge bg-success">${e.available_count} ✓</span>
                  <span class="badge bg-danger">${e.unavailable_count} ✗</span>
                  <span class="badge bg-warning text-dark">${e.maybe_count} ?</span>
                  ${noReply ? `<span class="badge bg-light text-muted border">${noReply} —</span>` : ""}
                </div>
              </div>
            </div>`;
        }).join("")}
    </div>`;

    const todayMs = Date.now();
    rest.forEach(e => {
        const diffDays = Math.round((new Date(e.date + "T12:00:00") - todayMs) / 86400000);
        const cell = document.getElementById(`home-wx-${e.id}`);
        if (!cell || diffDays > 15) return;
        fetchWeather(e.date).then(w => {
            if (!w) return;
            const live = document.getElementById(`home-wx-${e.id}`);
            if (!live) return;
            const { icon, color } = wmoInfo(w.code);
            const swing = swingInfo(w);
            live.innerHTML = `<i class="bi ${icon} me-1" style="color:${color}"></i>${w.maxT}°C / ${w.minT}°C`
                + `&nbsp;<span class="badge ${swing.badgeClass}"><i class="bi bi-wind me-1"></i>${swing.level} swing</span>`;
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
