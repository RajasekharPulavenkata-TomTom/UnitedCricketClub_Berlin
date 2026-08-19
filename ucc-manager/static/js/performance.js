import { apiFetch } from "/js/api.js";

let _days = 30;

export async function init() {
    document.querySelectorAll("#perf-window [data-days]").forEach(btn =>
        btn.addEventListener("click", () => {
            _days = parseInt(btn.dataset.days);
            document.querySelectorAll("#perf-window [data-days]").forEach(b =>
                b.classList.toggle("active", b === btn));
            load();
        }));
    await load();
}

async function load() {
    const data = await apiFetch(`/page-views/perf?days=${_days}`);
    document.querySelectorAll(".perf-window-label").forEach(el =>
        el.textContent = `(last ${data.window_days} days)`);
    renderSummary(data.summary, data.window_days);
    renderDaily(data.daily || []);
    renderTrend(data.trend);
    renderTable(data.pages, data.summary, data.window_days);
}

// ── colour helper ────────────────────────────────────────────────────────────

function _msClass(ms) {
    if (!ms) return "";
    if (ms < 500)  return "perf-ms-good";
    if (ms < 1200) return "perf-ms-ok";
    return "perf-ms-slow";
}

function _fmt(ms) {
    if (!ms) return '<span class="text-muted">—</span>';
    return `<span class="fw-semibold ${_msClass(ms)}">${ms.toLocaleString()} ms</span>`;
}

// ── summary cards ────────────────────────────────────────────────────────────

function renderSummary(s, days) {
    const noData = !s.total_navigations;
    const cards = [
        { icon: "bi-activity",       label: `Navigations (${days}d)`, value: s.total_navigations?.toLocaleString() ?? "—", cls: "text-primary" },
        { icon: "bi-people",         label: "Active users",       value: s.active_users ? s.active_users.toLocaleString() : "—", cls: "text-primary" },
        { icon: "bi-stopwatch",      label: "Avg load time",      value: s.avg_ms ? `${s.avg_ms.toLocaleString()} ms` : "—", cls: _msClass(s.avg_ms) || "text-secondary" },
        { icon: "bi-box-arrow-in-right", label: "First page (per visit)", value: s.first_avg_ms ? `${s.first_avg_ms.toLocaleString()} ms` : "—", cls: _msClass(s.first_avg_ms) || "text-secondary" },
        { icon: "bi-arrow-left-right", label: "In-app navigation", value: s.inapp_avg_ms ? `${s.inapp_avg_ms.toLocaleString()} ms` : "—", cls: _msClass(s.inapp_avg_ms) || "text-secondary" },
        { icon: "bi-bar-chart-line", label: "P75 load time",      value: s.p75_ms ? `${s.p75_ms.toLocaleString()} ms` : "—", cls: _msClass(s.p75_ms) || "text-secondary" },
        { icon: "bi-bar-chart-line", label: "P95 load time",      value: s.p95_ms ? `${s.p95_ms.toLocaleString()} ms` : "—", cls: _msClass(s.p95_ms) || "text-secondary" },
        { icon: "bi-exclamation-circle", label: "Slow navs (≥1.2s)", value: noData ? "—" : `${s.slow_pct}%`, cls: s.slow_pct >= 20 ? "perf-ms-slow" : s.slow_pct >= 5 ? "perf-ms-ok" : "perf-ms-good" },
        { icon: "bi-phone",          label: "Mobile avg",         value: s.mobile_avg_ms ? `${s.mobile_avg_ms.toLocaleString()} ms` : "—", cls: _msClass(s.mobile_avg_ms) || "text-secondary" },
        { icon: "bi-display",        label: "Desktop avg",        value: s.desktop_avg_ms ? `${s.desktop_avg_ms.toLocaleString()} ms` : "—", cls: _msClass(s.desktop_avg_ms) || "text-secondary" },
        { icon: "bi-pie-chart",      label: "Mobile traffic",     value: noData ? "—" : `${s.mobile_pct}%`, cls: "text-info" },
    ];
    document.getElementById("perf-summary").innerHTML = cards.map(c => `
        <div class="col-6 col-md-4 col-xl-3">
          <div class="card h-100">
            <div class="card-body py-3 px-3">
              <div class="text-muted small mb-1"><i class="bi ${c.icon} me-1"></i>${c.label}</div>
              <div class="fs-5 fw-bold ${c.cls}">${c.value}</div>
            </div>
          </div>
        </div>`).join("");

    if (noData) {
        document.getElementById("perf-table-wrap").innerHTML = `
            <div class="text-center text-muted py-5">
              <i class="bi bi-hourglass-split" style="font-size:2rem"></i>
              <div class="mt-2">No data yet — metrics are collected as users navigate the app.</div>
            </div>`;
    }
}

// ── daily trend bars ──────────────────────────────────────────────────────────

function renderDaily(daily) {
    const card = document.getElementById("perf-daily-card");
    if (daily.length < 2) { card.style.display = "none"; return; } // one day isn't a trend
    card.style.display = "";
    const max = Math.max(...daily.map(d => d.avg_ms ?? 0), 1);
    const barCls = (ms) => ms < 500 ? "bg-success" : ms < 1200 ? "bg-warning" : "bg-danger";
    const short = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    // label roughly every 7th bar plus the last — enough orientation without collisions
    const labelStep = Math.max(1, Math.floor(daily.length / 4));
    document.getElementById("perf-daily").innerHTML = daily.map((d, i) => {
        const h = d.avg_ms ? Math.max(Math.round(d.avg_ms / max * 92), 2) : 2;
        const showLabel = i % labelStep === 0 || i === daily.length - 1;
        return `
        <div class="pd-col" title="${short(d.date)} — avg ${d.avg_ms?.toLocaleString() ?? "—"} ms (${d.count} nav${d.count !== 1 ? "s" : ""})">
          <div class="pd-bar ${d.avg_ms ? barCls(d.avg_ms) : "bg-secondary"}" style="height:${h}%"></div>
          <div class="pd-label">${showLabel ? short(d.date) : ""}</div>
        </div>`;
    }).join("");
}

// ── week-over-week trend ──────────────────────────────────────────────────────

function renderTrend(t) {
    const card = document.getElementById("perf-trend-card");
    if (!t.this_week_avg && !t.last_week_avg) { card.style.display = "none"; return; }
    card.style.display = "";
    let badge = "";
    if (t.improvement_pct !== null) {
        if (t.improvement_pct > 0) {
            badge = `<span class="badge bg-success"><i class="bi bi-arrow-down me-1"></i>${t.improvement_pct}% faster this week</span>`;
        } else if (t.improvement_pct < 0) {
            badge = `<span class="badge bg-danger"><i class="bi bi-arrow-up me-1"></i>${Math.abs(t.improvement_pct)}% slower this week</span>`;
        } else {
            badge = `<span class="badge bg-secondary">No change</span>`;
        }
    }
    document.getElementById("perf-trend").innerHTML = `
        <div class="d-flex align-items-center gap-2">
          <i class="bi bi-calendar-week text-muted"></i>
          <span class="text-muted small">This week:</span>
          <span class="fw-semibold ${_msClass(t.this_week_avg)}">${t.this_week_avg ? t.this_week_avg.toLocaleString() + " ms" : "—"}</span>
        </div>
        <div class="d-flex align-items-center gap-2">
          <i class="bi bi-calendar2 text-muted"></i>
          <span class="text-muted small">Previous week:</span>
          <span class="fw-semibold ${_msClass(t.last_week_avg)}">${t.last_week_avg ? t.last_week_avg.toLocaleString() + " ms" : "—"}</span>
        </div>
        ${badge}`;
}

// ── per-page table ────────────────────────────────────────────────────────────

function renderTable(pages, summary, days) {
    if (!pages.length) return;
    const maxMs = Math.max(...pages.map(p => p.p75_ms ?? 0), 1);

    const rows = pages.map(p => {
        const barW = p.p75_ms ? Math.round(p.p75_ms / maxMs * 100) : 0;
        const barCol = p.p75_ms < 500 ? "bg-success" : p.p75_ms < 1200 ? "bg-warning" : "bg-danger";
        return `
        <tr>
          <td class="fw-semibold">${p.page}</td>
          <td class="text-end">${p.visits.toLocaleString()}</td>
          <td class="text-end">${_fmt(p.avg_ms)}</td>
          <td style="min-width:120px">
            ${_fmt(p.p75_ms)}
            <div class="perf-bar-bg"><div class="perf-bar ${barCol}" style="width:${barW}%"></div></div>
          </td>
          <td class="text-end">${_fmt(p.mobile_avg_ms)}</td>
          <td class="text-end">${_fmt(p.desktop_avg_ms)}</td>
        </tr>`;
    }).join("");

    document.getElementById("perf-table-wrap").innerHTML = `
        <div class="table-responsive">
          <table class="table table-sm table-hover mb-0 align-middle">
            <thead class="table-light">
              <tr>
                <th>Page</th>
                <th class="text-end">Visits</th>
                <th class="text-end">Avg</th>
                <th>P75 <span class="text-muted fw-normal small">(75th %ile)</span></th>
                <th class="text-end"><i class="bi bi-phone me-1 text-muted"></i>Mobile avg</th>
                <th class="text-end"><i class="bi bi-display me-1 text-muted"></i>Desktop avg</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="px-3 py-2 text-muted small border-top">
          <i class="bi bi-info-circle me-1"></i>
          Load time = router start → page data fully loaded.
          Thresholds: <span class="perf-ms-good fw-semibold">good &lt; 500 ms</span> ·
          <span class="perf-ms-ok fw-semibold">ok &lt; 1200 ms</span> ·
          <span class="perf-ms-slow fw-semibold">slow ≥ 1200 ms</span>.
          Data from the last ${days} days (${summary.total_navigations.toLocaleString()} navigations recorded).
        </div>`;
}
