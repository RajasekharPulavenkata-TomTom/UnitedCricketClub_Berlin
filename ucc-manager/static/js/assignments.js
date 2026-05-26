import { apiFetch, fmt, showToast } from "/js/api.js";

let modal;
const today = new Date().toISOString().slice(0, 10);

export async function init() {
    modal = new bootstrap.Modal(document.getElementById("assignModal"));
    document.getElementById("btn-assign").addEventListener("click", () => openModal());
    document.getElementById("assign-form").addEventListener("submit", onSubmit);
    document.getElementById("filter-active").addEventListener("change", load);
    document.getElementById("filter-member").addEventListener("input", load);
    await load();
}

async function load() {
    const active = document.getElementById("filter-active").checked;
    const member = document.getElementById("filter-member").value;
    const params = new URLSearchParams({ active_only: active });
    if (member) params.set("member_name", member);

    const tbody = document.getElementById("assign-tbody");
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-3"><div class="spinner-border spinner-border-sm"></div></td></tr>`;

    try {
        const data = await apiFetch("/assignments?" + params.toString());
        if (!data.length) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">No assignments found.</td></tr>`;
            return;
        }
        tbody.innerHTML = data.map((a) => {
            const isOverdue = !a.returned_date && a.expected_return_date && a.expected_return_date < today;
            const returnBtn = a.status === "approved" && !a.returned_date
                ? `<button class="btn btn-sm btn-outline-success me-1" onclick="window._returnItem(${a.id})" title="Mark returned"><i class="bi bi-arrow-return-left"></i></button>`
                : "";
            const deleteBtn = `<button class="btn btn-sm btn-outline-danger" onclick="window._deleteAssign(${a.id})"><i class="bi bi-trash"></i></button>`;

            return `<tr class="${isOverdue ? "overdue-row" : ""}">
              <td class="fw-semibold">${a.member_name}</td>
              <td>${a.equipment ? a.equipment.name : a.equipment_id}</td>
              <td class="text-center">${a.quantity_assigned}</td>
              <td>${fmt.date(a.assigned_date)}</td>
              <td>${a.expected_return_date ? fmt.date(a.expected_return_date) + (isOverdue ? ' <span class="badge bg-warning text-dark">Overdue</span>' : "") : "—"}</td>
              <td>${a.returned_date ? fmt.date(a.returned_date) : '<span class="text-muted">—</span>'}</td>
              <td class="no-print">${returnBtn}${deleteBtn}</td>
            </tr>`;
        }).join("");
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-danger text-center">${e.message}</td></tr>`;
    }
}

async function openModal() {
    const [equipment, members] = await Promise.all([
        apiFetch("/equipment?active_only=true"),
        apiFetch("/assignments/members/names"),
    ]);

    const eqSelect = document.getElementById("eq-select");
    const available = equipment.filter((e) => e.quantity_available > 0);
    eqSelect.innerHTML = available.length
        ? available.map((e) => `<option value="${e.id}">${e.name} (${e.type}) — ${e.quantity_available} avail.</option>`).join("")
        : `<option value="">No equipment available</option>`;

    const datalist = document.getElementById("member-datalist");
    datalist.innerHTML = members.map((m) => `<option value="${m}">`).join("");

    document.getElementById("assign-form").reset();
    document.getElementById("assign-form").assigned_date.value = today;
    modal.show();
}

async function onSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const body = {
        equipment_id: parseInt(form.equipment_id.value),
        member_name: form.member_name.value.trim(),
        quantity_assigned: parseInt(form.quantity_assigned.value),
        assigned_date: form.assigned_date.value,
        expected_return_date: form.expected_return_date.value || null,
        notes: form.notes.value || null,
    };
    try {
        await apiFetch("/assignments", { method: "POST", body: JSON.stringify(body) });
        showToast("Equipment assigned");
        modal.hide();
        load();
    } catch (err) {
        showToast(err.message, "error");
    }
}

window._returnItem = async (id) => {
    if (!confirm("Mark this item as returned?")) return;
    try {
        await apiFetch(`/assignments/${id}/return`, { method: "PUT" });
        showToast("Item returned");
        load();
    } catch (e) { showToast(e.message, "error"); }
};
window._deleteAssign = async (id) => {
    if (!confirm("Delete this assignment record?")) return;
    try {
        await apiFetch(`/assignments/${id}`, { method: "DELETE" });
        showToast("Assignment deleted");
        load();
    } catch (e) { showToast(e.message, "error"); }
};
