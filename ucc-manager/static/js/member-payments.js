import { apiFetch, showToast, escHtml } from "/js/api.js";
import { isAdmin } from "/js/auth.js";

const FEES = ["anmeldung", "dezember", "quarterly", "yearly"];
let data = null;          // last GET response
let currentYear = null;

export async function init() {
    currentYear = new Date().getFullYear();

    const yearSel = document.getElementById("year-select");
    // Offer a small window of years around the current one.
    for (let y = currentYear + 1; y >= 2025; y--) {
        yearSel.insertAdjacentHTML("beforeend", `<option value="${y}">${y}</option>`);
    }
    yearSel.value = String(currentYear);
    yearSel.addEventListener("change", () => { currentYear = parseInt(yearSel.value); load(); });

    document.getElementById("filter-search").addEventListener("input", render);
    document.getElementById("edit-hint").textContent =
        isAdmin() ? "Tick a box to save instantly." : "Read-only — admins can edit.";

    await load();
}

async function load() {
    const tbody = document.getElementById("payments-tbody");
    tbody.innerHTML = `<tr><td colspan="11" class="text-center py-3"><div class="spinner-border spinner-border-sm"></div></td></tr>`;
    try {
        data = await apiFetch(`/member-payments?year=${currentYear}`);
        render();
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="11" class="text-danger text-center">${escHtml(e.message)}</td></tr>`;
    }
}

// `target` decides which endpoint the toggle writes to:
//   "payment" → /member-payments/{id} (fee/SEPA booleans on the yearly row)
//   "member"  → /members/{id}         (static member fields like id_card_received)
function checkboxCell(m, field, target = "payment") {
    const checked = m[field] ? "checked" : "";
    if (isAdmin()) {
        return `<td class="text-center"><input type="checkbox" ${checked}
            onchange="window._toggleCell(${m.member_id}, '${field}', this.checked, '${target}')" /></td>`;
    }
    return `<td class="text-center">${m[field]
        ? '<i class="bi bi-check-lg text-success"></i>'
        : '<span class="text-muted">—</span>'}</td>`;
}

function render() {
    if (!data) return;
    const search = document.getElementById("filter-search").value.toLowerCase();
    const tbody = document.getElementById("payments-tbody");
    const tfoot = document.getElementById("payments-tfoot");

    let rows = data.members;
    if (search) rows = rows.filter((m) =>
        m.name.toLowerCase().includes(search) ||
        (m.membership_no || "").toLowerCase().includes(search) ||
        (m.dcb_id || "").toLowerCase().includes(search)
    );

    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="11" class="text-center py-4 text-muted">No members found.</td></tr>`;
        tfoot.innerHTML = "";
        return;
    }

    tbody.innerHTML = rows.map((m, i) => `
        <tr>
          <td class="text-muted">${i + 1}</td>
          <td class="fw-semibold">${escHtml(m.name)}</td>
          <td><code class="small">${escHtml(m.membership_no || "—")}</code></td>
          <td><code class="small">${escHtml(m.dcb_id || "—")}</code></td>
          ${checkboxCell(m, "anmeldung")}
          ${checkboxCell(m, "dezember")}
          ${checkboxCell(m, "quarterly")}
          ${checkboxCell(m, "yearly")}
          ${checkboxCell(m, "sepa")}
          ${checkboxCell(m, "id_card_received", "member")}
          <td class="small">${escHtml(m.spielerpass || "—")}</td>
        </tr>`).join("");

    // Totals footer — always reflects the full (unfiltered) year totals from the server.
    const t = data.totals;
    const euro = (n) => "€" + n.toLocaleString("en-IE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    tfoot.innerHTML = `
        <tr>
          <td colspan="4" class="text-end">Paid counts →</td>
          <td class="text-center">${t.counts.anmeldung}</td>
          <td class="text-center">${t.counts.dezember}</td>
          <td class="text-center">${t.counts.quarterly}</td>
          <td class="text-center">${t.counts.yearly}</td>
          <td class="text-center">${t.sepa}</td>
          <td colspan="2"></td>
        </tr>
        <tr>
          <td colspan="8" class="text-end">Total Amount Paid to ACB →</td>
          <td colspan="3" class="text-success">${euro(t.total_paid)}</td>
        </tr>`;
}

window._toggleCell = async (memberId, field, value, target) => {
    const url = target === "member"
        ? `/members/${memberId}`
        : `/member-payments/${memberId}?year=${currentYear}`;
    try {
        await apiFetch(url, { method: "PUT", body: JSON.stringify({ [field]: value }) });
        // Update local state + totals without a full reload.
        const m = data.members.find((r) => r.member_id === memberId);
        if (m) m[field] = value;
        recomputeTotals();
        render();
    } catch (e) {
        showToast(e.message, "error");
        load(); // revert on failure
    }
};

function recomputeTotals() {
    const t = data.totals;
    for (const f of FEES) t.counts[f] = data.members.filter((m) => m[f]).length;
    t.sepa = data.members.filter((m) => m.sepa).length;
    t.total_paid = FEES.reduce((sum, f) => sum + t.counts[f] * (t.amounts[f] || 0), 0);
}
