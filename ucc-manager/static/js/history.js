import { apiFetch, escHtml } from "/js/api.js";

const ACTION_STYLE = {
    added:    { bg: "#d1e7dd", color: "#0a3622", icon: "bi-plus-lg" },
    created:  { bg: "#d1e7dd", color: "#0a3622", icon: "bi-plus-lg" },
    updated:  { bg: "#cfe2ff", color: "#084298", icon: "bi-pencil" },
    deleted:  { bg: "#f8d7da", color: "#842029", icon: "bi-trash" },
    archived: { bg: "#fff3cd", color: "#664d03", icon: "bi-archive" },
    returned: { bg: "#e2d9f3", color: "#432874", icon: "bi-arrow-return-left" },
};

const ENTITY_ICON = {
    member:      "bi-person",
    event:       "bi-calendar3",
    transaction: "bi-cash-coin",
    equipment:   "bi-bag",
};

let allItems = [];

export async function init() {
    allItems = await apiFetch("/history?limit=500");
    setupFilters();
    render("");
}

function setupFilters() {
    document.querySelectorAll("#history-filters button").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll("#history-filters button").forEach(b => {
                b.className = "btn btn-sm btn-outline-secondary";
                if (b.dataset.filter === "") b.className = "btn btn-sm btn-outline-success";
            });
            btn.className = btn.dataset.filter === ""
                ? "btn btn-sm btn-success active"
                : "btn btn-sm btn-success active";
            render(btn.dataset.filter);
        });
    });
}

function render(filter) {
    const items = filter ? allItems.filter(i => i.entity_type === filter) : allItems;
    const el = document.getElementById("history-list");

    if (!items.length) {
        el.innerHTML = `<p class="text-muted text-center py-4 mb-0">No activity recorded yet.</p>`;
        return;
    }

    el.innerHTML = items.map(item => {
        const style = ACTION_STYLE[item.action] || ACTION_STYLE.updated;
        const entityIcon = ENTITY_ICON[item.entity_type] || "bi-circle";
        const when = formatAge(item.created_at);
        return `
        <div class="history-item">
          <div class="history-icon" style="background:${style.bg};color:${style.color}">
            <i class="bi ${style.icon}"></i>
          </div>
          <div class="flex-grow-1">
            <div>${escHtml(item.description)}</div>
            <div class="history-meta mt-1">
              <i class="bi ${entityIcon} me-1"></i>${item.entity_type}
              &nbsp;·&nbsp;${when}
              ${item.user_name ? `&nbsp;·&nbsp;<i class="bi bi-person-fill me-1"></i>${escHtml(item.user_name)}` : ""}
            </div>
          </div>
          <span class="badge mt-1" style="background:${style.bg};color:${style.color}">${item.action}</span>
        </div>`;
    }).join("");
}

function formatAge(isoStr) {
    const diff = Date.now() - new Date(isoStr).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);
    if (mins < 1)    return "just now";
    if (mins < 60)   return `${mins}m ago`;
    if (hours < 24)  return `${hours}h ago`;
    if (days < 7)    return `${days}d ago`;
    return new Date(isoStr).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
