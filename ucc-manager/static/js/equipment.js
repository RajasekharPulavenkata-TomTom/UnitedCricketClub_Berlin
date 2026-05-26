import { apiFetch, fmt, showToast, conditionBadge } from "/js/api.js";

let modal, detailModal;
let editingId = null;

export async function init() {
    modal = new bootstrap.Modal(document.getElementById("eqModal"));
    detailModal = new bootstrap.Modal(document.getElementById("eqDetailModal"));

    document.getElementById("btn-add-eq").addEventListener("click", () => openModal());

    document.getElementById("eq-form").addEventListener("submit", onSubmit);
    ["filter-type", "filter-cond", "filter-search", "filter-active"].forEach((id) => {
        document.getElementById(id).addEventListener("input", load);
    });

    await load();
}

async function load() {
    const params = new URLSearchParams();
    const type = document.getElementById("filter-type").value;
    const cond = document.getElementById("filter-cond").value;
    const search = document.getElementById("filter-search").value;
    const active = document.getElementById("filter-active").checked;
    if (type) params.set("type", type);
    if (cond) params.set("condition", cond);
    if (search) params.set("search", search);
    params.set("active_only", active);

    const tbody = document.getElementById("eq-tbody");
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-3"><div class="spinner-border spinner-border-sm"></div></td></tr>`;

    try {
        const data = await apiFetch("/equipment?" + params.toString());
        if (!data.length) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">No equipment found.</td></tr>`;
            return;
        }
        tbody.innerHTML = data.map((item) => {
            const actions = `<button class="btn btn-sm btn-outline-secondary me-1" onclick="window._editEq(${item.id})"><i class="bi bi-pencil"></i></button>
                   <button class="btn btn-sm btn-outline-danger" onclick="window._retireEq(${item.id})" title="Retire"><i class="bi bi-archive"></i></button>`;
            return `<tr style="cursor:pointer" onclick="window._viewEq(${item.id})">
              <td class="fw-semibold">${item.name}</td>
              <td class="text-capitalize">${item.type}</td>
              <td>${conditionBadge(item.condition)}</td>
              <td class="text-center">${item.quantity_total}</td>
              <td class="text-center">
                <span class="badge ${item.quantity_available > 0 ? "bg-success" : "bg-secondary"}">${item.quantity_available}</span>
              </td>
              <td class="text-muted small">${item.notes || "—"}</td>
              <td class="no-print" onclick="event.stopPropagation()">${actions}</td>
            </tr>`;
        }).join("");
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-danger text-center">${e.message}</td></tr>`;
    }
}

function openModal(item = null) {
    editingId = item ? item.id : null;
    document.getElementById("eqModalTitle").textContent = item ? "Edit Equipment" : "Add Equipment";
    const form = document.getElementById("eq-form");
    form.reset();
    if (item) {
        form.name.value = item.name;
        form.type.value = item.type;
        form.quantity_total.value = item.quantity_total;
        form.condition.value = item.condition;
        form.supplier.value = item.supplier || "";
        form.serial_number.value = item.serial_number || "";
        form.notes.value = item.notes || "";
    }
    modal.show();
}

async function onSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const body = {
        name: form.name.value,
        type: form.type.value,
        quantity_total: parseInt(form.quantity_total.value),
        condition: form.condition.value,
        supplier: form.supplier.value || null,
        serial_number: form.serial_number.value || null,
        notes: form.notes.value || null,
    };
    try {
        if (editingId) {
            await apiFetch(`/equipment/${editingId}`, { method: "PUT", body: JSON.stringify(body) });
            showToast("Equipment updated");
        } else {
            await apiFetch("/equipment", { method: "POST", body: JSON.stringify(body) });
            showToast("Equipment added");
        }
        modal.hide();
        load();
    } catch (err) {
        showToast(err.message, "error");
    }
}

window._editEq = async (id) => {
    const item = await apiFetch(`/equipment/${id}`);
    openModal(item);
};
window._retireEq = async (id) => {
    if (!confirm("Retire (soft-delete) this item?")) return;
    try {
        await apiFetch(`/equipment/${id}`, { method: "DELETE" });
        showToast("Equipment retired");
        load();
    } catch (e) { showToast(e.message, "error"); }
};
window._viewEq = async (id) => {
    const item = await apiFetch(`/equipment/${id}`);
    document.getElementById("eqDetailTitle").textContent = item.name;
    const activeAssignments = item.assignments.filter((a) => !a.returned_date && a.status === "approved");
    document.getElementById("eq-detail-body").innerHTML = `
    <div class="row g-3 mb-4">
      <div class="col-md-6">
        <table class="table table-sm">
          <tr><th>Type</th><td class="text-capitalize">${item.type}</td></tr>
          <tr><th>Condition</th><td>${conditionBadge(item.condition)}</td></tr>
          <tr><th>Total Qty</th><td>${item.quantity_total}</td></tr>
          <tr><th>Available</th><td>${item.quantity_available}</td></tr>
          ${item.supplier ? `<tr><th>Supplier</th><td>${item.supplier}</td></tr>` : ""}
          ${item.serial_number ? `<tr><th>Serial #</th><td>${item.serial_number}</td></tr>` : ""}
        </table>
      </div>
      <div class="col-md-6">
        <h6 class="fw-semibold">Currently Out (${activeAssignments.length})</h6>
        ${activeAssignments.length ? activeAssignments.map((a) => `
          <div class="border rounded p-2 mb-1 small">
            <strong>${a.member_name}</strong> — ${a.quantity_assigned} unit(s) since ${fmt.date(a.assigned_date)}
            ${a.expected_return_date ? `<span class="text-muted ms-1">(due ${fmt.date(a.expected_return_date)})</span>` : ""}
          </div>`).join("") : `<p class="text-muted small">None checked out.</p>`}
      </div>
    </div>
    <h6 class="fw-semibold">Maintenance Log (${item.maintenance_notes.length})</h6>
    ${item.maintenance_notes.length ? `<div class="table-responsive"><table class="table table-sm"><thead class="table-light"><tr><th>Date</th><th>Description</th><th>Cost</th><th>Done By</th></tr></thead><tbody>
      ${item.maintenance_notes.map((n) => `<tr><td>${fmt.date(n.date)}</td><td>${n.description}</td><td>${n.cost ? fmt.currency(n.cost) : "—"}</td><td>${n.done_by || "—"}</td></tr>`).join("")}
    </tbody></table></div>` : `<p class="text-muted small">No maintenance records.</p>`}`;
    detailModal.show();
};
