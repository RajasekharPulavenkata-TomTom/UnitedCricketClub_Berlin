import { apiFetch, fmt } from "/js/api.js";
import { fetchWeather, wmoInfo, swingInfo } from "/js/weather.js?v=4";

export async function init() {
    const now = new Date();
    const months = [0, 1, 2].map((d) => {
        const m = new Date(now.getFullYear(), now.getMonth() + d, 1);
        return { year: m.getFullYear(), month: m.getMonth() + 1 };
    });

    const [members, equipment, finance, tasks, matchResults, pageStats, auditLog, ...eventPages] = await Promise.all([
        apiFetch("/members"),
        apiFetch("/equipment?active_only=true"),
        apiFetch("/reports/dashboard"),
        apiFetch("/tasks"),
        apiFetch(`/scoreboard?year=${now.getFullYear()}`),
        apiFetch("/page-views/stats"),
        apiFetch("/history?limit=8"),
        ...months.map((m) => apiFetch(`/events?year=${m.year}&month=${m.month}`)),
    ]);

    const todayStr = now.toISOString().split("T")[0];
    const upcoming = eventPages.flat()
        .filter((e) => e.date >= todayStr)
        .sort((a, b) => a.date.localeCompare(b.date));

    const activeCount = members.filter((m) => m.is_active).length;

    renderFoundingDay();
    renderMembers(members);
    renderEquipment(equipment);
    renderFinance(finance);
    renderSeasonRecord(matchResults);
    renderRecentResults(matchResults);
    renderNextEvent(upcoming, activeCount);
    renderSchedule(upcoming, activeCount);
    renderTasks(tasks);
    renderPageStats(pageStats);
    renderRecentActivity(auditLog);
}

function renderFoundingDay() {
    const el = document.getElementById("home-founding-day");
    if (!el) return;
    const now = new Date();
    const year = now.getFullYear();
    const founding = new Date(year, 5, 30); // June 30 (month is 0-indexed)
    const diffDays = Math.round((founding - now) / 86400000);

    if (diffDays === 0) {
        el.innerHTML = `
        <div class="alert mb-4 p-4 text-center" style="background:linear-gradient(135deg,#ffd700,#ffb300);border:none;border-radius:14px">
          <div style="font-size:2.5rem">🎂🏏🎉</div>
          <h4 class="fw-bold mt-2 mb-1" style="color:#5a3a00">Happy Founding Day, UCC!</h4>
          <p class="mb-0" style="color:#7a5200">United Cricket Club was founded on this day. Here's to many more seasons of great cricket!</p>
        </div>`;
    } else if (diffDays > 0 && diffDays <= 30) {
        el.innerHTML = `
        <div class="alert mb-4 d-flex align-items-center gap-3 py-3" style="background:#fff8e1;border:1px solid #ffe082;border-radius:12px">
          <span style="font-size:1.8rem">🏏</span>
          <div>
            <div class="fw-semibold" style="color:#5a3a00">UCC Founding Day in <strong>${diffDays} day${diffDays > 1 ? "s" : ""}</strong></div>
            <div class="text-muted small">United Cricket Club was founded on 30 June. Get ready to celebrate!</div>
          </div>
        </div>`;
    }
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
}

function renderSeasonRecord(results) {
    const year = new Date().getFullYear();
    const season = results.filter(r => r.date && r.date.startsWith(String(year)));
    const won    = season.filter(r => r.result === "won").length;
    const lost   = season.filter(r => r.result === "lost").length;
    const tied   = season.filter(r => r.result === "tied").length;
    const played = season.filter(r => r.result).length;

    document.getElementById("home-season-record").textContent = played ? `${won}W ${lost}L${tied ? ` ${tied}T` : ""}` : "—";
    document.getElementById("home-season-sub").textContent = played ? `${played} matches this season` : "No results yet";
}


function renderRecentResults(results) {
    const el = document.getElementById("home-match-results");
    if (!el) return;

    const recent = [...results]
        .filter(r => r.result)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 5);

    if (!recent.length) {
        el.innerHTML = `<p class="text-muted small text-center py-3 mb-0">No results recorded.</p>`;
        return;
    }

    const badgeClass = { won: "result-badge-won", lost: "result-badge-lost", tied: "result-badge-tied", "no-result": "result-badge-nr" };
    const badgeLabel = { won: "Won", lost: "Lost", tied: "Tied", "no-result": "N/R" };

    el.innerHTML = `<ul class="list-group list-group-flush">
        ${recent.map(r => `
          <li class="list-group-item d-flex justify-content-between align-items-start px-3 py-2">
            <div>
              <div class="small fw-semibold">${r.opponent}</div>
              <div class="text-muted" style="font-size:.75rem">
                ${fmt.date(r.date)}${r.match_type ? ` · ${r.match_type}` : ""}
                ${r.margin ? ` · ${r.margin}` : ""}
              </div>
            </div>
            <span class="badge ${badgeClass[r.result] || "result-badge-nr"}" style="font-size:.75rem">
              ${badgeLabel[r.result] || r.result}
            </span>
          </li>`).join("")}
    </ul>`;
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
      <div class="cricket-ball-anim" aria-hidden="true">
        <svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="cball-grad" cx="38%" cy="35%" r="60%">
              <stop offset="0%" stop-color="#e83a20"/>
              <stop offset="100%" stop-color="#8b1500"/>
            </radialGradient>
          </defs>
          <circle cx="50" cy="50" r="46" fill="url(#cball-grad)"/>
          <path d="M22,28 C10,50 10,50 22,72" fill="none" stroke="rgba(255,255,255,0.75)" stroke-width="2.5" stroke-linecap="round"/>
          <path d="M78,28 C90,50 90,50 78,72" fill="none" stroke="rgba(255,255,255,0.75)" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="15" y1="40" x2="22" y2="38" stroke="rgba(255,255,255,0.65)" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="13" y1="50" x2="21" y2="50" stroke="rgba(255,255,255,0.65)" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="15" y1="60" x2="22" y2="62" stroke="rgba(255,255,255,0.65)" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="85" y1="40" x2="78" y2="38" stroke="rgba(255,255,255,0.65)" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="87" y1="50" x2="79" y2="50" stroke="rgba(255,255,255,0.65)" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="85" y1="60" x2="78" y2="62" stroke="rgba(255,255,255,0.65)" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
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

const _PAGE_LABEL = {
    home:                   "Home",
    dashboard:              "Finance Dashboard",
    transactions:           "Transactions",
    categories:             "Categories",
    reports:                "Reports",
    equipment:              "Equipment",
    maintenance:            "Maintenance",
    members:                "Members",
    tasks:                  "Tasks",
    "club-fees":            "Club Fees",
    reporting:              "Match Reporting",
    "practice-reporting":   "Practice Reporting",
    "field-editor":         "Field Editor",
    "match-results":        "Match Results",
    "external-tournaments": "External Tournaments",
    "internal-tournaments": "Internal Tournaments",
    calendar:               "Calendar",
    rules:                  "Rules",
    history:                "Club History",
    quiz:                   "Cricket Quiz",
    polls:                  "Polls",
    "pain-points":          "Pain Points",
    violations:             "Violations",
    approvals:              "Approvals",
    "user-management":      "User Management",
    sponsors:               "Sponsors",
};

function renderPageStats(stats) {
    const el = document.getElementById("home-page-stats");
    if (!el) return;
    if (!stats.length) {
        el.innerHTML = `<p class="text-muted small text-center py-2">No page views recorded yet.</p>`;
        return;
    }
    const max = stats[0].count;
    el.innerHTML = `<div class="d-flex flex-column gap-2">
        ${stats.map(s => {
            const label = _PAGE_LABEL[s.page] || s.page;
            const barPct = max ? Math.round(s.count / max * 100) : 0;
            return `
            <div>
              <div class="d-flex justify-content-between align-items-center mb-1">
                <span class="small">${label}</span>
                <span class="text-muted small">${s.count} visit${s.count !== 1 ? "s" : ""}</span>
              </div>
              <div class="progress" style="height:8px">
                <div class="progress-bar bg-primary" style="width:${barPct}%"></div>
              </div>
            </div>`;
        }).join("")}
    </div>`;
}

function _ago(isoStr) {
    const diff = Date.now() - new Date(isoStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}

function renderRecentActivity(logs) {
    const el = document.getElementById("home-activity");
    if (!el) return;
    if (!logs.length) {
        el.innerHTML = `<p class="text-muted small text-center py-3 mb-0">No activity recorded yet.</p>`;
        return;
    }
    const iconClass = {
        create: "bi-plus-circle-fill text-success",
        update: "bi-pencil-fill text-primary",
        delete: "bi-trash-fill text-danger",
    };
    el.innerHTML = `<ul class="list-group list-group-flush">
        ${logs.map(l => `
          <li class="list-group-item px-3 py-2">
            <div class="d-flex align-items-start gap-2">
              <i class="bi ${iconClass[l.action] || "bi-circle-fill text-secondary"} mt-1" style="flex-shrink:0"></i>
              <div class="flex-grow-1 overflow-hidden">
                <div class="small text-truncate">${l.description || `${l.action} ${l.entity_type}`}</div>
                <div class="text-muted d-flex gap-2" style="font-size:.72rem">
                  <span>${l.user_name || "System"}</span>
                  <span>·</span>
                  <span>${_ago(l.created_at)}</span>
                </div>
              </div>
            </div>
          </li>`).join("")}
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
