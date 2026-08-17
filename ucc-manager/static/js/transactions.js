import { apiFetch, fmt, showToast, typeBadge, escHtml } from "/js/api.js";

let allCategories = [];
let editingId = null;
let modal;

export async function init() {
    modal = new bootstrap.Modal(document.getElementById("txModal"));

    // Fetch categories and first transaction page in parallel — saves one full RTT
    const [cats] = await Promise.all([
        apiFetch("/categories"),
        loadTransactions(),
    ]);
    allCategories = cats;

    populateCategoryFilter();
    populateFormCategories("income");

    document.getElementById("form-type").addEventListener("change", (e) => {
        populateFormCategories(e.target.value);
    });
    document.getElementById("btn-add-tx").addEventListener("click", () => openModal());
    ["filter-type", "filter-cat", "filter-month"].forEach((id) => {
        document.getElementById(id).addEventListener("input", () => loadTransactions());
    });
    // Search is a network round trip per change — debounce typing
    let searchTimer = null;
    document.getElementById("filter-search").addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(loadTransactions, 250);
    });
    document.getElementById("tx-form").addEventListener("submit", onSubmit);
}

function populateCategoryFilter() {
    const sel = document.getElementById("filter-cat");
    sel.innerHTML = `<option value="">All Categories</option>` +
        allCategories.map((c) => `<option value="${c.id}">[${c.type}] ${c.name}</option>`).join("");
}

function populateFormCategories(type) {
    const sel = document.getElementById("form-cat");
    const filtered = allCategories.filter((c) => c.type === type);
    sel.innerHTML = `<option value="">— None —</option>` +
        filtered.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
}

// Sequence stamp: a slow response for an older filter state must never
// overwrite the results of a newer one.
let _loadSeq = 0;

async function loadTransactions() {
    const seq = ++_loadSeq;
    const params = new URLSearchParams();
    const type   = document.getElementById("filter-type").value;
    const cat    = document.getElementById("filter-cat").value;
    const month  = document.getElementById("filter-month").value;
    const search = document.getElementById("filter-search").value;
    if (type)   params.set("type", type);
    if (cat)    params.set("category_id", cat);
    if (month)  params.set("month", month);
    if (search) params.set("search", search);

    const tbody = document.getElementById("tx-tbody");
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-3"><div class="spinner-border spinner-border-sm"></div></td></tr>`;

    try {
        const data = await apiFetch("/transactions?" + params.toString());
        if (seq !== _loadSeq) return; // superseded by a newer filter change
        if (!data.length) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">No transactions found.</td></tr>`;
            return;
        }
        tbody.innerHTML = data.map((t) => `<tr>
          <td>${fmt.date(t.date)}</td>
          <td>${typeBadge(t.type)}</td>
          <td>${t.category ? escHtml(t.category.name) : "<span class='text-muted'>—</span>"}</td>
          <td>${escHtml(t.description || "—")}</td>
          <td class="text-muted small">${escHtml(t.reference || "—")}</td>
          <td class="text-end fw-semibold ${t.type === "income" ? "text-success" : "text-danger"}">
            ${t.type === "expense" ? "-" : "+"}${fmt.currency(t.amount)}
          </td>
          <td class="no-print">
            <button class="btn btn-sm btn-outline-secondary me-1" onclick="window._editTx(${t.id})"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-danger" onclick="window._deleteTx(${t.id})"><i class="bi bi-trash"></i></button>
          </td>
        </tr>`).join("");
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">${e.message}</td></tr>`;
    }
}

function openModal(tx = null) {
    editingId = tx ? tx.id : null;
    document.getElementById("txModalTitle").textContent = tx ? "Edit Transaction" : "Add Transaction";
    const form = document.getElementById("tx-form");
    form.reset();
    if (tx) {
        form.date.value = tx.date;
        form.type.value = tx.type;
        populateFormCategories(tx.type);
        form.category_id.value = tx.category_id || "";
        form.amount.value = tx.amount;
        form.description.value = tx.description || "";
        form.reference.value = tx.reference || "";
    } else {
        form.date.value = new Date().toISOString().slice(0, 10);
        populateFormCategories("income");
    }
    modal.show();
}

async function onSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const body = {
        date: form.date.value,
        type: form.type.value,
        category_id: form.category_id.value ? parseInt(form.category_id.value) : null,
        amount: parseFloat(form.amount.value),
        description: form.description.value || null,
        reference: form.reference.value || null,
    };
    try {
        if (editingId) {
            await apiFetch(`/transactions/${editingId}`, { method: "PUT", body: JSON.stringify(body) });
            showToast("Transaction updated");
        } else {
            await apiFetch("/transactions", { method: "POST", body: JSON.stringify(body) });
            showToast("Transaction added");
        }
        modal.hide();
        loadTransactions();
    } catch (err) {
        showToast(err.message, "error");
    }
}

window._editTx = async (id) => {
    const tx = await apiFetch(`/transactions/${id}`);
    openModal(tx);
};
window._deleteTx = async (id) => {
    if (!confirm("Delete this transaction?")) return;
    try {
        await apiFetch(`/transactions/${id}`, { method: "DELETE" });
        showToast("Transaction deleted");
        loadTransactions();
    } catch (e) { showToast(e.message, "error"); }
};
