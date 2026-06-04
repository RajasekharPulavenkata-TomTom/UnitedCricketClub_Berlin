import { apiFetch, showToast, fmt, escHtml } from "/js/api.js";

let taskModal, bulkModal;
let editingId = null;
let allTasks = [];
let allMembers = [];
let allEvents = [];

export async function init() {
    taskModal = new bootstrap.Modal(document.getElementById("taskModal"));
    bulkModal = new bootstrap.Modal(document.getElementById("bulkModal"));

    document.getElementById("btn-add-task").addEventListener("click", () => openModal());
    document.getElementById("btn-bulk-assign").addEventListener("click", () => openBulkModal());
    document.getElementById("task-form").addEventListener("submit", onSubmit);
    document.getElementById("bulk-form").addEventListener("submit", onBulkSubmit);
    document.getElementById("filter-search").addEventListener("input", render);
    document.getElementById("filter-status").addEventListener("change", render);
    document.getElementById("filter-priority").addEventListener("change", render);
    document.getElementById("filter-member").addEventListener("change", render);
    document.getElementById("bulk-select-all").addEventListener("click", () => {
        document.querySelectorAll("#bulk-member-list input[type=checkbox]").forEach(cb => {
            cb.checked = cb.dataset.active === "true";
        });
    });
    document.getElementById("bulk-clear-all").addEventListener("click", () => {
        document.querySelectorAll("#bulk-member-list input[type=checkbox]").forEach(cb => cb.checked = false);
    });

    await loadAll();
}

async function loadAll() {
    try {
        [allTasks, allMembers, allEvents] = await Promise.all([
            apiFetch("/tasks"),
            apiFetch("/members"),
            apiFetch("/events"),
        ]);
        populateFilterMembers();
        render();
    } catch (e) {
        document.getElementById("tasks-tbody").innerHTML =
            `<tr><td colspan="8" class="text-danger text-center">${e.message}</td></tr>`;
    }
}

function populateFilterMembers() {
    const sel = document.getElementById("filter-member");
    const current = sel.value;
    sel.innerHTML = `<option value="">All Members</option>` +
        allMembers.map(m => `<option value="${m.id}">${m.name}</option>`).join("");
    sel.value = current;
}

function populateMemberSelect(selectEl, selectedId) {
    selectEl.innerHTML = `<option value="">— unassigned —</option>` +
        allMembers.filter(m => m.is_active).map(m =>
            `<option value="${m.id}" ${m.id === selectedId ? "selected" : ""}>${m.name}</option>`
        ).join("");
}

function populateEventSelect(selectEl, selectedId) {
    const sorted = [...allEvents].sort((a, b) => b.date.localeCompare(a.date));
    selectEl.innerHTML = `<option value="">— none —</option>` +
        sorted.map(e =>
            `<option value="${e.id}" ${e.id === selectedId ? "selected" : ""}>${fmt.date(e.date)} – ${e.title}</option>`
        ).join("");
}

function statusBadge(s) {
    const map = { todo: "bg-secondary", in_progress: "bg-warning text-dark", done: "bg-success" };
    const label = { todo: "To Do", in_progress: "In Progress", done: "Done" };
    return `<span class="badge ${map[s] || "bg-secondary"}">${label[s] || s}</span>`;
}

function priorityBadge(p) {
    const map = { low: "bg-secondary", medium: "bg-info text-dark", high: "bg-danger" };
    const label = { low: "Low", medium: "Medium", high: "High" };
    return `<span class="badge ${map[p] || "bg-secondary"}">${label[p] || p}</span>`;
}

function isOverdue(task) {
    return task.due_date && task.status !== "done" && task.due_date < new Date().toISOString().slice(0, 10);
}

function render() {
    const search = document.getElementById("filter-search").value.toLowerCase();
    const status = document.getElementById("filter-status").value;
    const priority = document.getElementById("filter-priority").value;
    const memberId = document.getElementById("filter-member").value;
    const tbody = document.getElementById("tasks-tbody");

    let filtered = allTasks;
    if (search) filtered = filtered.filter(t => t.title.toLowerCase().includes(search));
    if (status) filtered = filtered.filter(t => t.status === status);
    if (priority) filtered = filtered.filter(t => t.priority === priority);
    if (memberId) filtered = filtered.filter(t => String(t.assigned_to_id) === memberId);

    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">No tasks found.</td></tr>`;
        return;
    }

    const rowClass = { todo: "task-row-todo", in_progress: "task-row-progress", done: "task-row-done" };

    tbody.innerHTML = filtered.map((t, i) => `
        <tr class="${isOverdue(t) ? "overdue-row" : (rowClass[t.status] || "")}">
          <td class="text-muted">${i + 1}</td>
          <td>
            <div class="fw-semibold">${escHtml(t.title)}</div>
            ${t.description ? `<div class="text-muted small">${escHtml(t.description)}</div>` : ""}
          </td>
          <td>${t.assigned_to ? escHtml(t.assigned_to.name) : '<span class="text-muted">—</span>'}</td>
          <td>${priorityBadge(t.priority)}</td>
          <td>
            <select class="form-select form-select-sm w-auto d-inline-block" onchange="window._changeStatus(${t.id}, this.value)">
              <option value="todo" ${t.status === "todo" ? "selected" : ""}>To Do</option>
              <option value="in_progress" ${t.status === "in_progress" ? "selected" : ""}>In Progress</option>
              <option value="done" ${t.status === "done" ? "selected" : ""}>Done</option>
            </select>
          </td>
          <td>
            ${t.due_date
                ? `<span class="${isOverdue(t) ? "text-danger fw-semibold" : ""}">${fmt.date(t.due_date)}</span>`
                : "—"}
          </td>
          <td>${t.event ? `<span class="small">${fmt.date(t.event.date)} – ${escHtml(t.event.title)}</span>` : "—"}</td>
          <td class="no-print">
            <button class="btn btn-sm btn-outline-secondary me-1" onclick="window._editTask(${t.id})">
              <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger" onclick="window._deleteTask(${t.id})">
              <i class="bi bi-trash"></i>
            </button>
          </td>
        </tr>`).join("");
}

function openModal(task = null) {
    editingId = task ? task.id : null;
    document.getElementById("taskModalTitle").textContent = task ? "Edit Task" : "Add Task";
    const form = document.getElementById("task-form");
    form.reset();

    populateMemberSelect(document.getElementById("task-member-select"), task?.assigned_to_id ?? null);
    populateEventSelect(document.getElementById("task-event-select"), task?.event_id ?? null);

    if (task) {
        form.title.value = task.title;
        form.description.value = task.description ?? "";
        form.priority.value = task.priority;
        form.status.value = task.status;
        form.due_date.value = task.due_date ?? "";
    }
    taskModal.show();
}

function openBulkModal() {
    document.getElementById("bulk-form").reset();
    populateEventSelect(document.getElementById("bulk-event-select"), null);

    const list = document.getElementById("bulk-member-list");
    list.innerHTML = allMembers.map(m => `
        <div class="form-check">
          <input class="form-check-input" type="checkbox" id="bm-${m.id}" value="${m.id}" data-active="${m.is_active}" />
          <label class="form-check-label" for="bm-${m.id}">
            ${escHtml(m.name)} ${!m.is_active ? '<span class="badge bg-secondary ms-1">Inactive</span>' : ""}
          </label>
        </div>`).join("");
    bulkModal.show();
}

async function onSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const body = {
        title: form.title.value.trim(),
        description: form.description.value.trim() || null,
        priority: form.priority.value,
        status: form.status.value,
        due_date: form.due_date.value || null,
        assigned_to_id: form.assigned_to_id.value ? parseInt(form.assigned_to_id.value) : null,
        event_id: form.event_id.value ? parseInt(form.event_id.value) : null,
    };
    try {
        if (editingId) {
            await apiFetch(`/tasks/${editingId}`, { method: "PUT", body: JSON.stringify(body) });
            showToast("Task updated");
        } else {
            await apiFetch("/tasks", { method: "POST", body: JSON.stringify(body) });
            showToast("Task created");
        }
        taskModal.hide();
        await loadAll();
    } catch (err) {
        showToast(err.message, "error");
    }
}

async function onBulkSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const memberIds = [...document.querySelectorAll("#bulk-member-list input[type=checkbox]:checked")]
        .map(cb => parseInt(cb.value));
    if (!memberIds.length) {
        showToast("Select at least one member", "error");
        return;
    }
    const params = new URLSearchParams({ title: form.title.value.trim() });
    memberIds.forEach(id => params.append("member_ids", id));
    if (form.description.value.trim()) params.set("description", form.description.value.trim());
    params.set("priority", form.priority.value);
    if (form.due_date.value) params.set("due_date", form.due_date.value);
    if (form.event_id.value) params.set("event_id", form.event_id.value);
    try {
        await apiFetch(`/tasks/bulk-assign?${params}`, { method: "POST" });
        showToast(`Task assigned to ${memberIds.length} member(s)`);
        bulkModal.hide();
        await loadAll();
    } catch (err) {
        showToast(err.message, "error");
    }
}

window._editTask = (id) => {
    const task = allTasks.find(t => t.id === id);
    if (task) openModal(task);
};

window._deleteTask = async (id) => {
    const task = allTasks.find(t => t.id === id);
    if (!confirm(`Delete task "${task?.title}"?`)) return;
    try {
        await apiFetch(`/tasks/${id}`, { method: "DELETE" });
        showToast("Task deleted");
        await loadAll();
    } catch (e) {
        showToast(e.message, "error");
    }
};

window._changeStatus = async (id, status) => {
    try {
        await apiFetch(`/tasks/${id}/status?status=${status}`, { method: "PATCH" });
        const task = allTasks.find(t => t.id === id);
        if (task) task.status = status;
        render();
    } catch (e) {
        showToast(e.message, "error");
        await loadAll();
    }
};
