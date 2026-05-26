import { apiFetch, showToast } from "/js/api.js";
import { isAdmin } from "/js/auth.js";

export async function init() {
  await loadCategories();
  if (isAdmin()) {
    document.getElementById("income-cat-form").addEventListener("submit", onAdd);
    document.getElementById("expense-cat-form").addEventListener("submit", onAdd);
  } else {
    document.getElementById("income-cat-form").style.display = "none";
    document.getElementById("expense-cat-form").style.display = "none";
  }
}

async function loadCategories() {
  const cats = await apiFetch("/categories");
  renderList("income-list", cats.filter((c) => c.type === "income"), "success");
  renderList("expense-list", cats.filter((c) => c.type === "expense"), "danger");
}

function renderList(listId, cats, color) {
  const ul = document.getElementById(listId);
  if (!cats.length) {
    ul.innerHTML = `<li class="list-group-item text-muted">No categories yet.</li>`;
    return;
  }
  ul.innerHTML = cats.map((c) => `
    <li class="list-group-item d-flex justify-content-between align-items-center">
      <div>
        <span class="fw-semibold">${c.name}</span>
        ${c.description ? `<div class="text-muted small">${c.description}</div>` : ""}
      </div>
      <button class="btn btn-sm btn-outline-danger" onclick="window._deleteCat(${c.id})">
        <i class="bi bi-trash"></i>
      </button>
    </li>`).join("");
}

async function onAdd(e) {
  e.preventDefault();
  const form = e.target;
  try {
    await apiFetch("/categories", {
      method: "POST",
      body: JSON.stringify({ name: form.name.value.trim(), type: form.type.value }),
    });
    form.name.value = "";
    showToast("Category added");
    loadCategories();
  } catch (err) {
    showToast(err.message, "error");
  }
}

window._deleteCat = async (id) => {
  if (!confirm("Delete this category? This will fail if transactions use it.")) return;
  try {
    await apiFetch(`/categories/${id}`, { method: "DELETE" });
    showToast("Category deleted");
    loadCategories();
  } catch (e) {
    showToast(e.message, "error");
  }
};
