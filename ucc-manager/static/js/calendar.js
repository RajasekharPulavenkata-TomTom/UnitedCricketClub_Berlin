import { apiFetch, showToast, escHtml } from "/js/api.js";
import { fetchWeather, fetchWeatherRange, weatherHtml, wmoInfo } from "/js/weather.js?v=4";

let eventModal, detailModal;
let editingId = null;
let detailEventId = null;
let _squadIds = [];
let currentYear, currentMonth;
let currentEvents = [];
let avail = {};
let members = [];
let selectedAvailDate;
let weatherByDate = {};
let currentEvent = null;
let currentEventAvail = {};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

export async function init() {
    eventModal = new bootstrap.Modal(document.getElementById("eventModal"));
    detailModal = new bootstrap.Modal(document.getElementById("eventDetailModal"));

    const now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth() + 1;

    document.getElementById("cal-prev").addEventListener("click", () => navigate(-1));
    document.getElementById("cal-next").addEventListener("click", () => navigate(1));
    document.getElementById("cal-today").addEventListener("click", goToday);
    document.getElementById("btn-add-event").addEventListener("click", () => openEventModal());
    document.getElementById("btn-share-avail").addEventListener("click", () => {
        const url = location.origin + "/avail.html";
        navigator.clipboard.writeText(url).then(() => showToast("Link copied!")).catch(() => showToast(url));
    });
    document.getElementById("event-form").addEventListener("submit", onEventSubmit);
    document.getElementById("det-edit-btn").addEventListener("click", onDetailEdit);
    document.getElementById("det-delete-btn").addEventListener("click", onDetailDelete);

    // Grid click delegation
    document.getElementById("cal-grid").addEventListener("click", (e) => {
        const badge = e.target.closest("[data-eid]");
        if (badge) {
            window._viewEvent(Number(badge.dataset.eid));
            return;
        }
        const cell = e.target.closest("button.cal-cell");
        if (!cell || cell.classList.contains("other-month")) return;

        // Cell has events: clicking background opens the first (or only) event
        const firstBadge = cell.querySelector("[data-eid]");
        if (firstBadge) {
            window._viewEvent(Number(firstBadge.dataset.eid));
            return;
        }

        // No events: open availability dialog
        if (cell.dataset.date) openAvailDialog(cell.dataset.date);
    });

    // Availability dialog wiring
    document.getElementById("av-btn-available").addEventListener("click", () => saveAvailEntry("available"));
    document.getElementById("av-btn-unavailable").addEventListener("click", () => saveAvailEntry("unavailable"));
    document.getElementById("av-dialog-close").addEventListener("click", closeAvailDialog);
    document.getElementById("av-dialog-done").addEventListener("click", closeAvailDialog);
    document.getElementById("av-dialog").addEventListener("click", (e) => {
        if (e.target === document.getElementById("av-dialog")) closeAvailDialog();
    });

    // Load members in background (non-blocking)
    apiFetch("/members").then(raw => {
        members = raw.filter(m => m.is_active).sort((a, b) =>
            (a.jersey_name || a.name).localeCompare(b.jersey_name || b.name)
        );
        const sel = document.getElementById("av-player-select");
        sel.innerHTML = members.map(m =>
            `<option value="${m.id}">${m.jersey_name || m.name}</option>`
        ).join("");
    }).catch(e => showToast("Could not load members: " + e.message, "error"));

    await render();
}

function navigate(delta) {
    currentMonth += delta;
    if (currentMonth > 12) { currentMonth = 1; currentYear++; }
    if (currentMonth < 1) { currentMonth = 12; currentYear--; }
    render();
}

function goToday() {
    const now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth() + 1;
    render();
}

async function render() {
    document.getElementById("cal-title").textContent = `${MONTH_NAMES[currentMonth - 1]} ${currentYear}`;

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
    const limit = new Date(today);
    limit.setDate(today.getDate() + 15);
    const limitStr = `${limit.getFullYear()}-${String(limit.getMonth()+1).padStart(2,"0")}-${String(limit.getDate()).padStart(2,"0")}`;

    const [events, availRows, wxData] = await Promise.all([
        apiFetch(`/events?year=${currentYear}&month=${currentMonth}`),
        apiFetch(`/player-availability?year=${currentYear}&month=${currentMonth}`).catch(() => []),
        fetchWeatherRange(todayStr, limitStr).catch(() => ({})),
    ]);

    currentEvents = events;
    weatherByDate = wxData;
    avail = {};
    for (const r of availRows) {
        if (!avail[r.date]) avail[r.date] = {};
        avail[r.date][r.member_id] = r.status;
    }

    buildGrid();
}

function buildGrid() {
    const container = document.getElementById("cal-grid");
    const eventsByDate = {};
    for (const e of currentEvents) {
        if (!eventsByDate[e.date]) eventsByDate[e.date] = [];
        eventsByDate[e.date].push(e);
    }

    const firstDay = new Date(currentYear, currentMonth - 1, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const daysInPrev = new Date(currentYear, currentMonth - 1, 0).getDate();
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    let html = `<div class="cal-grid">`;
    for (const d of DAY_NAMES) {
        html += `<div class="cal-day-header">${d}</div>`;
    }

    const cells = [];
    for (let i = firstDay - 1; i >= 0; i--) cells.push({ day: daysInPrev - i, otherMonth: true });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, otherMonth: false });
    const remaining = 7 - (cells.length % 7);
    if (remaining < 7) for (let d = 1; d <= remaining; d++) cells.push({ day: d, otherMonth: true });

    for (const cell of cells) {
        const dateStr = cell.otherMonth ? "" :
            `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(cell.day).padStart(2, "0")}`;
        const isToday = dateStr === todayStr;
        const cellEvents = dateStr ? (eventsByDate[dateStr] || []) : [];
        const dayAvail = dateStr ? (avail[dateStr] || {}) : {};
        const markedMembers = members.filter(m => dayAvail[m.id]);

        if (cell.otherMonth) {
            html += `<div class="cal-cell other-month"><div class="cal-date">${cell.day}</div></div>`;
        } else {
            const cls = ["cal-cell", isToday ? "today" : ""].filter(Boolean).join(" ");
            const eventBadges = cellEvents.map(ev => {
                const rt = ev.reporting_time ? `<span class="report-time-badge">⏰ ${ev.reporting_time.substring(0, 5)}</span>` : "";
                return `<span class="event-badge ${ev.type}" data-eid="${ev.id}" title="${escHtml(ev.title)}">${escHtml(ev.title)}</span>${rt}`;
            }).join("");
            const pips = markedMembers.slice(0, 3)
                .map(m => `<span class="av-name ${dayAvail[m.id]}">${escHtml(m.jersey_name || m.name)}</span>`)
                .join("");
            const more = markedMembers.length > 3
                ? `<span class="av-name" style="background:#6c757d">+${markedMembers.length - 3} more</span>`
                : "";
            const w = weatherByDate[dateStr];
            const wx = w ? (() => {
                const { icon, color, label } = wmoInfo(w.code);
                return `<div class="cal-weather"><i class="bi ${icon}" style="color:${color}"></i> ${label}<br><span class="wx-temp">${w.maxT}° / ${w.minT}°</span></div>`;
            })() : "";
            html += `<button type="button" class="${cls}" data-date="${dateStr}">
              <div class="cal-date">${cell.day}</div>${wx}${eventBadges}${pips}${more}
            </button>`;
        }
    }

    html += `</div>`;
    container.innerHTML = html;
}

// ── Availability dialog ──────────────────────────────────────────────────────

function openAvailDialog(dateStr) {
    selectedAvailDate = dateStr;
    const [y, m, d] = dateStr.split("-").map(Number);
    const label = new Date(y, m - 1, d)
        .toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    document.getElementById("av-dialog-title").textContent = label;
    renderAvailList();
    document.getElementById("av-dialog").showModal();
}

function closeAvailDialog() {
    document.getElementById("av-dialog").close();
}

function renderAvailList() {
    const dayAvail = avail[selectedAvailDate] || {};
    const entries = members.filter(m => dayAvail[m.id]);
    const list = document.getElementById("av-entry-list");

    if (entries.length === 0) {
        list.innerHTML = `<div class="av-empty"><i class="bi bi-info-circle me-1"></i>No availability marked yet.</div>`;
        return;
    }

    list.innerHTML = entries.map(m => {
        const s = dayAvail[m.id];
        const badge = s === "available"
            ? `<span class="badge bg-success">Available</span>`
            : `<span class="badge bg-danger">Unavailable</span>`;
        return `
        <div class="av-entry-row">
          <span class="fw-medium">${escHtml(m.jersey_name || m.name)}</span>
          <div class="d-flex align-items-center gap-2">
            ${badge}
            <button class="btn btn-outline-secondary btn-sm av-remove-btn" data-id="${m.id}">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </div>`;
    }).join("");

    list.querySelectorAll(".av-remove-btn").forEach(btn => {
        btn.addEventListener("click", () => removeAvailEntry(Number(btn.dataset.id)));
    });
}

async function saveAvailEntry(status) {
    const memberId = Number(document.getElementById("av-player-select").value);
    if (!memberId) { showToast("Select a player first", "error"); return; }
    try {
        await apiFetch("/player-availability", {
            method: "PUT",
            body: JSON.stringify({ member_id: memberId, date: selectedAvailDate, status }),
        });
        if (!avail[selectedAvailDate]) avail[selectedAvailDate] = {};
        avail[selectedAvailDate][memberId] = status;
        renderAvailList();
        buildGrid();
    } catch (e) {
        showToast(e.message, "error");
    }
}

async function removeAvailEntry(memberId) {
    try {
        await apiFetch(`/player-availability?member_id=${memberId}&date=${selectedAvailDate}`, { method: "DELETE" });
        if (avail[selectedAvailDate]) delete avail[selectedAvailDate][memberId];
        renderAvailList();
        buildGrid();
    } catch (e) {
        showToast(e.message, "error");
    }
}
// ── Event modal ──────────────────────────────────────────────────────────────

function fv(form, name) { return form.querySelector(`[name="${name}"]`).value; }
function setFv(form, name, value) { form.querySelector(`[name="${name}"]`).value = value; }

function openEventModal(item = null, prefillDate = null) {
    editingId = item ? item.id : null;
    document.getElementById("eventModalTitle").textContent = item ? "Edit Event" : "Add Event";
    const form = document.getElementById("event-form");
    form.reset();

    const fill = () => {
        if (item) {
            setFv(form, "title",          item.title);
            setFv(form, "date",           item.date);
            setFv(form, "type",           item.type);
            setFv(form, "location",       item.location || "");
            setFv(form, "notes",          item.notes || "");
            setFv(form, "reporting_time", item.reporting_time ? item.reporting_time.substring(0, 5) : "");
        } else if (prefillDate) {
            setFv(form, "date", prefillDate);
        }
    };

    eventModal._element.addEventListener("shown.bs.modal", fill, { once: true });
    eventModal.show();
}

async function onEventSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const body = {
        title:          fv(form, "title")          || null,
        date:           fv(form, "date")            || null,
        type:           fv(form, "type")            || null,
        location:       fv(form, "location")        || null,
        notes:          fv(form, "notes")           || null,
        reporting_time: fv(form, "reporting_time")  || null,
    };
    const savedId = editingId;
    try {
        if (savedId) {
            await apiFetch(`/events/${savedId}`, { method: "PUT", body: JSON.stringify(body) });
            showToast("Event updated");
        } else {
            await apiFetch("/events", { method: "POST", body: JSON.stringify(body) });
            showToast("Event added");
        }
        editingId = null;
        eventModal.hide();
        await render();
        if (savedId) window._viewEvent(savedId);
    } catch (err) {
        showToast(err.message, "error");
    }
}

// ── Event detail modal ───────────────────────────────────────────────────────

window._viewEvent = async (id) => {
    detailEventId = id;
    let ev, eventAvail, squadRows = [];
    try {
        [ev, eventAvail] = await Promise.all([
            apiFetch(`/events?year=${currentYear}&month=${currentMonth}`).then(list => list.find(e => e.id === id)),
            apiFetch(`/events/${id}/availability`),
        ]);
        if (ev?.type === "match") {
            squadRows = await apiFetch(`/events/${id}/squad`).catch(() => []);
        }
    } catch (err) {
        showToast("Could not load event: " + err.message, "error");
        return;
    }
    if (!ev) return;
    currentEvent = ev;

    document.getElementById("det-title").textContent = ev.title;
    const typeBadge = `<span class="badge ${ev.type === "match" ? "bg-primary" : ev.type === "training" ? "bg-success" : "bg-secondary"} me-2">${ev.type}</span>`;
    document.getElementById("det-meta").innerHTML = `${typeBadge}${ev.date}${ev.location ? ` &bull; ${escHtml(ev.location)}` : ""}`;

    const rtEl = document.getElementById("det-reporting-time");
    if (ev.reporting_time) {
        document.getElementById("det-report-time-val").textContent = ev.reporting_time.substring(0, 5);
        rtEl.style.display = "";
    } else {
        rtEl.style.display = "none";
    }

    fetchWeather(ev.date).then(w => {
        const el = document.getElementById("det-weather");
        if (el) el.innerHTML = weatherHtml(w);
    });

    const total = eventAvail.length;
    const aCount = eventAvail.filter(a => a.status === "available").length;
    const uCount = eventAvail.filter(a => a.status === "unavailable").length;
    const mCount = eventAvail.filter(a => a.status === "maybe").length;
    const nCount = total - aCount - uCount - mCount;

    document.getElementById("det-counts").innerHTML = `
        <div class="col-3"><div class="card text-center border-success"><div class="card-body py-2"><div class="fs-4 fw-bold text-success">${aCount}</div><div class="small text-muted">Available</div></div></div></div>
        <div class="col-3"><div class="card text-center border-danger"><div class="card-body py-2"><div class="fs-4 fw-bold text-danger">${uCount}</div><div class="small text-muted">Unavailable</div></div></div></div>
        <div class="col-3"><div class="card text-center border-warning"><div class="card-body py-2"><div class="fs-4 fw-bold text-warning">${mCount}</div><div class="small text-muted">Maybe</div></div></div></div>
        <div class="col-3"><div class="card text-center border-secondary"><div class="card-body py-2"><div class="fs-4 fw-bold text-secondary">${nCount}</div><div class="small text-muted">Unknown</div></div></div></div>
    `;

    document.getElementById("det-avail-list").innerHTML = eventAvail.map(a => `
        <div class="avail-row">
            <span class="fw-medium">${a.member_name}</span>
            <div class="btn-group btn-group-sm" role="group">
                <button class="btn ${a.status === "available" ? "btn-success" : "btn-outline-success"}" onclick="window._setAvail(${id}, ${a.member_id}, 'available')">
                    <i class="bi bi-check-circle"></i>
                </button>
                <button class="btn ${a.status === "maybe" ? "btn-warning" : "btn-outline-warning"}" onclick="window._setAvail(${id}, ${a.member_id}, 'maybe')">
                    <i class="bi bi-question-circle"></i>
                </button>
                <button class="btn ${a.status === "unavailable" ? "btn-danger" : "btn-outline-danger"}" onclick="window._setAvail(${id}, ${a.member_id}, 'unavailable')">
                    <i class="bi bi-x-circle"></i>
                </button>
                ${a.status !== "unknown" ? `<button class="btn btn-outline-secondary" onclick="window._clearAvail(${id}, ${a.member_id})" title="Reset"><i class="bi bi-dash-circle"></i></button>` : ""}
            </div>
        </div>
    `).join("");

    currentEventAvail = Object.fromEntries(eventAvail.map(a => [a.member_id, a.status]));

    const squadSection = document.getElementById("det-squad-section");
    if (squadSection) {
        if (ev.type === "match") {
            _squadIds = squadRows.map(s => s.member_id);
            squadSection.classList.remove("d-none");
            try { _renderSquad(); } catch (e) { console.error("Squad render error:", e); }
        } else {
            squadSection.classList.add("d-none");
            _squadIds = [];
        }
    }

    detailModal.show();
};

window._setAvail = async (eventId, memberId, status) => {
    await apiFetch(`/events/${eventId}/availability/${memberId}`, {
        method: "PUT",
        body: JSON.stringify({ status }),
    });
    window._viewEvent(eventId);
};

window._clearAvail = async (eventId, memberId) => {
    await apiFetch(`/events/${eventId}/availability/${memberId}`, { method: "DELETE" });
    window._viewEvent(eventId);
};

window._bulkSetAvail = async (status) => {
    const eventAvail = await apiFetch(`/events/${detailEventId}/availability`);
    await Promise.all(eventAvail.map(a =>
        apiFetch(`/events/${detailEventId}/availability/${a.member_id}`, {
            method: "PUT",
            body: JSON.stringify({ status }),
        })
    ));
    await render();
    window._viewEvent(detailEventId);
};

window._bulkResetAvail = async () => {
    const eventAvail = await apiFetch(`/events/${detailEventId}/availability`);
    await Promise.all(
        eventAvail.filter(a => a.status !== "unknown").map(a =>
            apiFetch(`/events/${detailEventId}/availability/${a.member_id}`, { method: "DELETE" })
        )
    );
    await render();
    window._viewEvent(detailEventId);
};

// ── Match Squad (up to 15) ────────────────────────────────────────────────────

const SQUAD_MAX = 15;

function _renderSquad() {
    const countEl = document.getElementById("det-squad-count");
    const list    = document.getElementById("det-squad-list");
    const n = _squadIds.length;
    countEl.textContent = n;
    countEl.className = `badge ms-1 ${n > SQUAD_MAX ? "bg-danger" : n >= 11 ? "bg-success" : n > 0 ? "bg-primary" : "bg-secondary"}`;

    function avBadge(id) {
        const s = currentEventAvail[id];
        if (s === "available")   return `<span class="badge bg-success"   style="font-size:.6rem">Avail</span>`;
        if (s === "unavailable") return `<span class="badge bg-danger"    style="font-size:.6rem">Unavail</span>`;
        return "";
    }

    let html = "";

    _squadIds.forEach((id, idx) => {
        const m = members.find(m => m.id === id);
        if (!m) return;
        html += `
        <div class="squad-row in-squad">
          <span class="squad-num">${idx + 1}</span>
          <span class="flex-grow-1 fw-medium small">${escHtml(m.jersey_name || m.name)}</span>
          ${avBadge(id)}
          <div class="btn-group btn-group-sm no-print">
            <button class="btn btn-outline-secondary py-0 px-1" ${idx === 0 ? "disabled" : ""}
                onclick="window._squadMove(${id},-1)" title="Move up"><i class="bi bi-chevron-up"></i></button>
            <button class="btn btn-outline-secondary py-0 px-1" ${idx === _squadIds.length - 1 ? "disabled" : ""}
                onclick="window._squadMove(${id},1)" title="Move down"><i class="bi bi-chevron-down"></i></button>
            <button class="btn btn-outline-danger py-0 px-1"
                onclick="window._squadRemove(${id})" title="Remove"><i class="bi bi-x"></i></button>
          </div>
        </div>`;
    });

    if (_squadIds.length > 0) {
        html += `<div class="text-muted small py-2 ps-2 mb-1" style="border-bottom:2px dashed #dee2e6">Add players below</div>`;
    }

    const notSelected = members.filter(m => !_squadIds.includes(m.id));
    const avFirst = notSelected.filter(m => currentEventAvail[m.id] === "available");
    const rest    = notSelected.filter(m => currentEventAvail[m.id] !== "available");

    [...avFirst, ...rest].forEach(m => {
        const canAdd = _squadIds.length < SQUAD_MAX;
        html += `
        <div class="squad-row">
          <span class="squad-num text-muted" style="color:#adb5bd!important">—</span>
          <span class="flex-grow-1 small">${escHtml(m.jersey_name || m.name)}</span>
          ${avBadge(m.id)}
          <button class="btn btn-sm btn-outline-primary py-0 px-2 no-print" ${canAdd ? "" : "disabled"}
              onclick="window._squadAdd(${m.id})" title="Add to squad"><i class="bi bi-plus-lg"></i></button>
        </div>`;
    });

    list.innerHTML = html || `<p class="text-muted small mb-0">No active members found.</p>`;
}

let _squadSaveTimer = null;
function _squadAutoSave() {
    clearTimeout(_squadSaveTimer);
    _squadSaveTimer = setTimeout(window._squadSave, 600);
}

window._squadAdd = (id) => {
    if (_squadIds.length >= SQUAD_MAX) { showToast(`Squad limit is ${SQUAD_MAX} players`, "error"); return; }
    if (!_squadIds.includes(id)) _squadIds.push(id);
    _renderSquad();
    _squadAutoSave();
};
window._squadRemove = (id) => {
    _squadIds = _squadIds.filter(x => x !== id);
    _renderSquad();
    _squadAutoSave();
};
window._squadMove = (id, dir) => {
    const i = _squadIds.indexOf(id);
    if (i < 0) return;
    const j = i + dir;
    if (j < 0 || j >= _squadIds.length) return;
    [_squadIds[i], _squadIds[j]] = [_squadIds[j], _squadIds[i]];
    _renderSquad();
    _squadAutoSave();
};
window._squadSave = async () => {
    clearTimeout(_squadSaveTimer);
    try {
        await apiFetch(`/events/${detailEventId}/squad`, {
            method: "PUT",
            body: JSON.stringify({ squad: _squadIds.map((mid, i) => ({ member_id: mid, batting_order: i + 1 })) }),
        });
        showToast(`Squad saved (${_squadIds.length} player${_squadIds.length !== 1 ? "s" : ""})`);
    } catch (e) {
        showToast(e.message, "error");
    }
};

async function onDetailEdit() {
    const events = await apiFetch(`/events?year=${currentYear}&month=${currentMonth}`);
    const ev = events.find(e => e.id === detailEventId);
    if (!ev) return;
    detailModal._element.addEventListener("hidden.bs.modal", () => openEventModal(ev), { once: true });
    detailModal.hide();
}

async function onDetailDelete() {
    if (!confirm("Delete this event?")) return;
    try {
        await apiFetch(`/events/${detailEventId}`, { method: "DELETE" });
        showToast("Event deleted");
        detailModal.hide();
        await render();
    } catch (e) {
        showToast(e.message, "error");
    }
}
