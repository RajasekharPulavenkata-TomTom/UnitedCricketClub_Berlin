const BASE = "/api";

// ── In-session GET cache ───────────────────────────────────────────────────────
// Eliminates duplicate fetches when navigating back to a page within a session.
// TTL: 60 s.  Mutations automatically evict matching cache entries.
const _cache = new Map();          // cacheKey → { data, ts }
const _CACHE_TTL = 60_000;
const _CACHE_SKIP = new Set(["/auth/me"]); // always fetch fresh

function _cacheEvict(path) {
    // e.g. mutation on /members/5 evicts everything under /api/members
    const resource = "/" + path.split("?")[0].split("/").filter(Boolean)[0];
    const prefix = BASE + resource;
    for (const key of _cache.keys()) {
        if (key.startsWith(prefix)) _cache.delete(key);
    }
}

export async function apiFetch(path, options = {}) {
    const method = (options.method || "GET").toUpperCase();
    const cacheKey = BASE + path;

    if (method === "GET" && !_CACHE_SKIP.has(path)) {
        const hit = _cache.get(cacheKey);
        if (hit && (Date.now() - hit.ts) < _CACHE_TTL) return hit.data;
    } else if (method !== "GET") {
        _cacheEvict(path);
    }

    const headers = { "Content-Type": "application/json" };
    const token = localStorage.getItem("ucc_token");
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(BASE + path, { headers, ...options });
    if (res.status === 401) {
        localStorage.removeItem("ucc_token");
        localStorage.removeItem("ucc_user");
        window.dispatchEvent(new CustomEvent("ucc:logout"));
        throw new Error("Session expired. Please log in again.");
    }
    let data;
    try {
        data = res.status === 204 ? null : await res.json();
    } catch {
        throw new Error(`Server error (${res.status})`);
    }
    if (!res.ok) {
        const detail = data?.detail;
        const msg = typeof detail === "string" ? detail
            : Array.isArray(detail) ? detail.map(d => {
                const loc = Array.isArray(d.loc) ? d.loc.filter(x => x !== "body").join(".") : "";
                return loc ? `${loc}: ${d.msg}` : d.msg;
              }).join("; ")
            : JSON.stringify(detail) || `Server error (${res.status})`;
        throw new Error(msg);
    }
    if (method === "GET" && data !== null && !_CACHE_SKIP.has(path)) {
        _cache.set(cacheKey, { data, ts: Date.now() });
    }
    return data;
}

export const fmt = {
    currency: (v) => "€" + parseFloat(v || 0).toFixed(2),
    date: (d) => d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB") : "—",
    monthName: (m) => new Date(2000, parseInt(m) - 1).toLocaleString("en-GB", { month: "short" }),
};

export function showToast(msg, type = "success") {
    const id = "toast-" + Date.now();
    const bg = type === "success" ? "bg-success" : "bg-danger";
    document.body.insertAdjacentHTML("beforeend", `
    <div id="${id}" class="toast align-items-center text-white ${bg} border-0 position-fixed bottom-0 end-0 m-3" role="alert" style="z-index:9999">
      <div class="d-flex">
        <div class="toast-body">${escHtml(msg)}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>
    </div>`);
    const el = document.getElementById(id);
    new bootstrap.Toast(el, { delay: 3500 }).show();
    el.addEventListener("hidden.bs.toast", () => el.remove());
}

export function conditionBadge(c) {
    const map = { Good: "badge-Good", Fair: "badge-Fair", Poor: "badge-Poor" };
    return `<span class="badge ${map[c] || "bg-secondary"}">${c}</span>`;
}

export function typeBadge(t) {
    return t === "income"
        ? `<span class="badge bg-success">Income</span>`
        : `<span class="badge bg-danger">Expense</span>`;
}

export function statusBadge(s) {
    const map = { approved: "bg-success", pending: "bg-warning text-dark", rejected: "bg-secondary" };
    return `<span class="badge ${map[s] || "bg-secondary"}">${s}</span>`;
}

export function escHtml(s) {
    return String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
