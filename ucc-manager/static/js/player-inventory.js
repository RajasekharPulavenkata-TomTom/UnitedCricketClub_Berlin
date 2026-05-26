import { apiFetch, fmt, statusBadge } from "/js/api.js";

const TYPE_ICONS = {
    bat: "bi-rulers",
    ball: "bi-circle",
    helmet: "bi-shield-fill",
    pads: "bi-layers-fill",
    gloves: "bi-hand-index-fill",
    stumps: "bi-align-bottom",
    jersey: "bi-person-fill",
    bag: "bi-bag-fill",
    other: "bi-box",
};

let allPlayers = [];
let detailModal;
const today = new Date().toISOString().slice(0, 10);

export async function init() {
    detailModal = new bootstrap.Modal(document.getElementById("playerModal"));
    document.getElementById("filter-player").addEventListener("input", render);
    await load();
}

async function load() {
    try {
        allPlayers = await apiFetch("/assignments/by-member");
        render();
    } catch (e) {
        document.getElementById("player-grid").innerHTML =
            `<div class="col-12"><div class="alert alert-danger">${e.message}</div></div>`;
    }
}

function render() {
    const q = document.getElementById("filter-player").value.toLowerCase();
    const filtered = q
        ? allPlayers.filter((p) => p.member_name.toLowerCase().includes(q))
        : allPlayers;

    const countEl = document.getElementById("player-count");
    countEl.textContent = filtered.length
        ? `${filtered.length} player${filtered.length !== 1 ? "s" : ""} with active equipment`
        : "";

    const grid = document.getElementById("player-grid");
    if (!filtered.length) {
        grid.innerHTML = `<div class="col-12 text-center py-5 text-muted">No active equipment found.</div>`;
        return;
    }

    grid.innerHTML = filtered.map((p) => {
        const itemRows = p.items.map((item) => {
            const icon = TYPE_ICONS[item.equipment_type] || TYPE_ICONS.other;
            const overdue = item.expected_return_date && item.expected_return_date < today;
            return `
              <li class="list-group-item d-flex align-items-center gap-2 py-2">
                <i class="bi ${icon} text-secondary"></i>
                <span class="flex-grow-1">${item.equipment_name}</span>
                <span class="badge bg-success rounded-pill">${item.quantity}</span>
                ${overdue ? `<span class="badge bg-warning text-dark">Overdue</span>` : ""}
              </li>`;
        }).join("");

        const total = p.items.reduce((s, i) => s + i.quantity, 0);
        const encodedName = encodeURIComponent(p.member_name);
        return `
          <div class="col-sm-6 col-lg-4">
            <div class="card h-100 shadow-sm">
              <div class="card-header d-flex align-items-center gap-2">
                <i class="bi bi-person-circle fs-5 text-success"></i>
                <span class="fw-semibold flex-grow-1">${p.member_name}</span>
                <span class="badge bg-secondary">${total} item${total !== 1 ? "s" : ""}</span>
              </div>
              <ul class="list-group list-group-flush">${itemRows}</ul>
              <div class="card-footer p-2 text-end">
                <button class="btn btn-sm btn-outline-success" onclick="window._openPlayerDetail('${encodedName}')">
                  <i class="bi bi-clock-history me-1"></i>Full History
                </button>
              </div>
            </div>
          </div>`;
    }).join("");
}

window._openPlayerDetail = async (encodedName) => {
    const name = decodeURIComponent(encodedName);
    document.getElementById("modal-player-name").textContent = name;
    document.getElementById("modal-tbody").innerHTML =
        `<tr><td colspan="6" class="text-center py-4"><div class="spinner-border spinner-border-sm text-success"></div></td></tr>`;
    document.getElementById("modal-summary").textContent = "";
    detailModal.show();

    try {
        const params = new URLSearchParams({ member_name: name, active_only: false });
        const assignments = await apiFetch("/assignments?" + params.toString());

        if (!assignments.length) {
            document.getElementById("modal-tbody").innerHTML =
                `<tr><td colspan="6" class="text-center py-4 text-muted">No assignments found.</td></tr>`;
            return;
        }

        const activeCount = assignments.filter((a) => a.status === "approved" && !a.returned_date).length;
        const totalItems = assignments
            .filter((a) => a.status === "approved" && !a.returned_date)
            .reduce((s, a) => s + a.quantity_assigned, 0);
        document.getElementById("modal-summary").textContent =
            `${activeCount} active assignment${activeCount !== 1 ? "s" : ""} · ${totalItems} item${totalItems !== 1 ? "s" : ""} currently held`;

        document.getElementById("modal-tbody").innerHTML = assignments.map((a) => {
            const isOverdue = !a.returned_date && a.status === "approved" && a.expected_return_date && a.expected_return_date < today;
            return `<tr class="${isOverdue ? "table-warning" : ""}">
              <td>${a.equipment ? a.equipment.name : a.equipment_id}</td>
              <td class="text-center">${a.quantity_assigned}</td>
              <td>${fmt.date(a.assigned_date)}</td>
              <td>${a.expected_return_date ? fmt.date(a.expected_return_date) + (isOverdue ? ' <span class="badge bg-warning text-dark">Overdue</span>' : "") : "—"}</td>
              <td>${a.returned_date ? fmt.date(a.returned_date) : '<span class="text-muted">—</span>'}</td>
              <td>${statusBadge(a.status)}</td>
            </tr>`;
        }).join("");
    } catch (e) {
        document.getElementById("modal-tbody").innerHTML =
            `<tr><td colspan="6" class="text-danger text-center">${e.message}</td></tr>`;
    }
};
