import { apiFetch, fmt, showToast } from "/js/api.js";

let modal;
let allEquipment = [];
let editingId = null;

export async function init() {
  modal = new bootstrap.Modal(document.getElementById("maintModal"));

  allEquipment = await apiFetch("/equipment?active_only=false");
  populateEqFilter();

  document.getElementById("eq-filter").addEventListener("change", load);
  document.getElementById("btn-add-note").addEventListener("click", openModal);
  document.getElementById("maint-form").addEventListener("submit", onSubmit);

  await load();
}

function populateEqFilter() {
  const sel = document.getElementById("eq-filter");
  sel.innerHTML = `<option value="">All Equipment</option>` +
    allEquipment.map((e) => `<option value="${e.id}">${e.name} (${e.type})</option>`).join("");
}

async function load() {
  const eqId = document.getElementById("eq-filter").value;
  const params = new URLSearchParams();
  if (eqId) params.set("equipment_id", eqId);

  const tbody = document.getElementById("maint-tbody");
  tbody.innerHTML = `<tr><td colspan="6" class="text-center py-3"><div class="spinner-border spinner-border-sm"></div></td></tr>`;

  try {
    const data = await apiFetch("/maintenance?" + params.toString());
    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">No maintenance records found.</td></tr>`;
      return;
    }
    const eqMap = Object.fromEntries(allEquipment.map((e) => [e.id, e.name]));
    tbody.innerHTML = data.map((n) => `
      <tr>
        <td>${fmt.date(n.date)}</td>
        <td>${eqMap[n.equipment_id] || n.equipment_id}</td>
        <td>${n.description}</td>
        <td class="text-end">${n.cost ? fmt.currency(n.cost) : "—"}</td>
        <td>${n.done_by || "—"}</td>
        <td class="no-print">
          <button class="btn btn-sm btn-outline-secondary me-1" onclick="window._editNote(${n.id})"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-outline-danger" onclick="window._deleteNote(${n.id})"><i class="bi bi-trash"></i></button>
        </td>
      </tr>`).join("");
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-danger text-center">${e.message}</td></tr>`;
  }
}

function openModal(note = null) {
  editingId = note ? note.id : null;
  document.getElementById("maintModalTitle").textContent = note ? "Edit Note" : "Add Maintenance Note";
  const form = document.getElementById("maint-form");
  form.reset();

  const sel = document.getElementById("maint-eq-select");
  sel.innerHTML = allEquipment.map((e) => `<option value="${e.id}">${e.name} (${e.type})</option>`).join("");

  const preselect = document.getElementById("eq-filter").value;
  if (preselect) sel.value = preselect;

  if (note) {
    sel.value = note.equipment_id;
    form.date.value = note.date;
    form.description.value = note.description;
    form.cost.value = note.cost || "";
    form.done_by.value = note.done_by || "";
  } else {
    form.date.value = new Date().toISOString().slice(0, 10);
  }
  modal.show();
}

async function onSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const body = {
    equipment_id: parseInt(form.equipment_id.value),
    date: form.date.value,
    description: form.description.value,
    cost: form.cost.value ? parseFloat(form.cost.value) : null,
    done_by: form.done_by.value || null,
  };
  try {
    if (editingId) {
      await apiFetch(`/maintenance/${editingId}`, { method: "PUT", body: JSON.stringify(body) });
      showToast("Note updated");
    } else {
      await apiFetch("/maintenance", { method: "POST", body: JSON.stringify(body) });
      showToast("Note added");
    }
    modal.hide();
    load();
  } catch (err) {
    showToast(err.message, "error");
  }
}

window._editNote = async (id) => {
  const notes = await apiFetch("/maintenance");
  const note = notes.find((n) => n.id === id);
  if (note) openModal(note);
};

window._deleteNote = async (id) => {
  if (!confirm("Delete this maintenance note?")) return;
  try {
    await apiFetch(`/maintenance/${id}`, { method: "DELETE" });
    showToast("Note deleted");
    load();
  } catch (e) {
    showToast(e.message, "error");
  }
};
