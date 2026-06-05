import { apiFetch, showToast, escHtml } from "/js/api.js";

// ── State ─────────────────────────────────────────────────────────────────────
let allMembers    = [];
let allEvents     = [];
let allFormations = [];
let placedPlayers = [];      // [{member_id, jersey_name, x, y}]
let currentFormationId = null;
let currentUserId      = null;
let dirty = false;

// Drag state
let dragState = null;  // {idx, offsetX, offsetY, hasMoved}

const SVG_W = 600, SVG_H = 600;
const PLAYER_R = 20;

// Predefined placement positions (clockwise from WK) for sequential add
const PRESET = [
    {x: 300, y: 445},  // wicketkeeper
    {x: 345, y: 418},  // 1st slip
    {x: 378, y: 400},  // 2nd slip
    {x: 195, y: 300},  // mid-on
    {x: 405, y: 300},  // mid-off
    {x: 175, y: 210},  // square leg
    {x: 420, y: 195},  // cover
    {x: 150, y: 370},  // fine leg
    {x: 300, y: 148},  // long-on
    {x: 450, y: 370},  // third man
    {x: 455, y: 145},  // deep extra cover
];

const ROLE_COLOR = {
    "Wicketkeeper": "#e91e63",
    "Batsman":      "#1e88e5",
    "Bowler":       "#fb8c00",
    "All-rounder":  "#43a047",
};

// ── Init ──────────────────────────────────────────────────────────────────────

export async function init() {
    // Show page content (hidden until loaded)
    document.getElementById("fe-print-area").style.display = "";

    const me = await apiFetch("/auth/me").catch(() => null);
    currentUserId = me?.id ?? null;

    setupSVGDrag();
    setupControls();

    const [members, events, formations] = await Promise.all([
        apiFetch("/members"),
        apiFetch("/events"),
        apiFetch("/field-formations"),
    ]);

    allMembers = members.filter(m => m.is_active)
        .sort((a, b) => (a.jersey_name || a.name).localeCompare(b.jersey_name || b.name));

    allEvents = events.sort((a, b) => b.date.localeCompare(a.date));
    populateEventSelects();
    onEventChange();

    allFormations = formations;
    renderFormationList();
    renderPlayerList();
}

// ── Event listeners ───────────────────────────────────────────────────────────

function setupControls() {
    document.getElementById("btn-fe-new").addEventListener("click", () => {
        if (dirty && !confirm("Discard unsaved changes?")) return;
        clearEditor();
    });

    document.getElementById("btn-fe-save").addEventListener("click", openSaveModal);
    document.getElementById("btn-fe-export").addEventListener("click", exportPNG);
    document.getElementById("btn-fe-print").addEventListener("click", printFormation);
    document.getElementById("btn-fe-load-squad").addEventListener("click", loadSquad);

    document.getElementById("fe-event").addEventListener("change", onEventChange);

    document.getElementById("fe-player-search").addEventListener("input", renderPlayerList);
    document.getElementById("btn-ai-suggest").addEventListener("click", runAISuggestion);

    document.getElementById("btn-fe-save-confirm").addEventListener("click", saveFormation);
}

function populateEventSelects() {
    const opts = `<option value="">— No match —</option>` +
        allEvents.map(e => `<option value="${e.id}">${escHtml(e.title)} (${e.date})</option>`).join("");
    document.getElementById("fe-event").innerHTML = opts;
    document.getElementById("fe-save-event").innerHTML = opts;
}

// ── Player list ───────────────────────────────────────────────────────────────

function renderPlayerList() {
    const search  = (document.getElementById("fe-player-search").value || "").toLowerCase();
    const placedIds = new Set(placedPlayers.map(p => p.member_id).filter(Boolean));
    const container = document.getElementById("fe-player-list");

    const visible = allMembers.filter(m => {
        if (!search) return true;
        return (m.jersey_name || m.name || "").toLowerCase().includes(search);
    });

    if (!visible.length) {
        container.innerHTML = `<div class="text-muted small text-center py-2">No players found</div>`;
        return;
    }

    container.innerHTML = visible.map(m => {
        const placed = placedIds.has(m.id);
        const label  = m.jersey_name || m.name;
        const roleLabel = m.role ? `<span class="text-muted" style="font-size:0.7rem">${escHtml(m.role)}</span>` : "";
        return `<div class="fe-player-item ${placed ? "placed" : "unplaced"}" onclick="window._feToggle(${m.id})">
          <span class="d-flex flex-column lh-1">
            <span class="fw-semibold">${escHtml(label)}</span>
            ${roleLabel}
          </span>
          <i class="bi ${placed ? "bi-check-circle-fill text-success" : "bi-plus-circle text-muted"}"></i>
        </div>`;
    }).join("");

    // Count badge
    document.getElementById("fe-count-badge").textContent = `${placedPlayers.length} / 11`;
    document.getElementById("fe-count-badge").className =
        `badge ${placedPlayers.length === 11 ? "bg-success" : placedPlayers.length > 11 ? "bg-danger" : "bg-secondary"}`;
}

// ── Formation list ────────────────────────────────────────────────────────────

function renderFormationList() {
    const container = document.getElementById("fe-formations-list");
    document.getElementById("fe-formations-count").textContent = allFormations.length;

    if (!allFormations.length) {
        container.innerHTML = `<div class="text-center text-muted small py-3">No formations saved yet</div>`;
        return;
    }

    container.innerHTML = allFormations.map(f => {
        const isActive  = f.id === currentFormationId;
        const canDelete = f.created_by_id === currentUserId;
        const evLabel   = f.event_title ? `<div class="text-muted" style="font-size:0.7rem"><i class="bi bi-calendar3 me-1"></i>${escHtml(f.event_title)}</div>` : "";
        const count     = (f.positions || []).length;
        return `<div class="fe-formation-item ${isActive ? "active-formation" : ""}" onclick="window._feLoad(${f.id})">
          <div class="d-flex justify-content-between align-items-start">
            <div class="flex-grow-1 me-2">
              <div class="fw-semibold small">${escHtml(f.name)}</div>
              ${evLabel}
              <div class="text-muted" style="font-size:0.7rem">${count} player${count !== 1 ? "s" : ""}</div>
            </div>
            ${canDelete ? `<button class="btn btn-sm btn-outline-danger py-0 px-1" style="font-size:0.7rem" onclick="event.stopPropagation();window._feDelete(${f.id})" title="Delete"><i class="bi bi-trash3"></i></button>` : ""}
          </div>
        </div>`;
    }).join("");
}

// ── SVG field rendering ───────────────────────────────────────────────────────

function memberColor(memberId) {
    if (!memberId) return "#1a3a8b";  // UCC blue for AI-placed fielders
    const m = allMembers.find(m => m.id === memberId);
    return ROLE_COLOR[m?.role] || "#546e7a";
}

function renderField() {
    const group = document.getElementById("fe-players-group");
    group.innerHTML = placedPlayers.map((p, i) => {
        const color  = memberColor(p.member_id);
        const label  = (p.jersey_name || "?").toUpperCase().slice(0, 7);
        return `<g class="fe-fielder" data-fe-idx="${i}">
          <circle cx="${p.x}" cy="${p.y}" r="${PLAYER_R}" fill="${color}" stroke="white" stroke-width="2.5" opacity="0.92"/>
          <text x="${p.x}" y="${p.y + 4}" text-anchor="middle"
                font-size="8" font-weight="bold" fill="white" font-family="sans-serif"
                pointer-events="none">${escHtml(label)}</text>
        </g>`;
    }).join("");

    // Re-attach drag listeners after innerHTML replace
    group.querySelectorAll(".fe-fielder").forEach(el => {
        el.addEventListener("pointerdown", onPointerDown, {passive: false});
    });

    renderPlayerList();
}

// ── Drag & drop ───────────────────────────────────────────────────────────────

function getSVGPoint(e) {
    const svg  = document.getElementById("fe-svg");
    const rect = svg.getBoundingClientRect();
    const vb   = svg.viewBox.baseVal;
    return {
        x: ((e.clientX - rect.left)  / rect.width)  * vb.width,
        y: ((e.clientY - rect.top)   / rect.height) * vb.height,
    };
}

function onPointerDown(e) {
    const el  = e.currentTarget;
    const idx = parseInt(el.dataset.feIdx);
    const pt  = getSVGPoint(e);
    const p   = placedPlayers[idx];
    dragState = {
        idx,
        offsetX:  pt.x - p.x,
        offsetY:  pt.y - p.y,
        hasMoved: false,
        startX:   e.clientX,
        startY:   e.clientY,
    };
    el.setPointerCapture(e.pointerId);
    e.preventDefault();
}

function setupSVGDrag() {
    const svg = document.getElementById("fe-svg");

    svg.addEventListener("pointermove", (e) => {
        if (!dragState) return;
        const dx = Math.abs(e.clientX - dragState.startX);
        const dy = Math.abs(e.clientY - dragState.startY);
        if (dx > 4 || dy > 4) dragState.hasMoved = true;
        if (!dragState.hasMoved) return;

        const pt = getSVGPoint(e);
        const p  = placedPlayers[dragState.idx];
        p.x = Math.round(Math.max(PLAYER_R, Math.min(SVG_W - PLAYER_R, pt.x - dragState.offsetX)));
        p.y = Math.round(Math.max(PLAYER_R, Math.min(SVG_H - PLAYER_R, pt.y - dragState.offsetY)));

        // Update just this element (avoid full re-render during drag)
        const group = document.getElementById("fe-players-group");
        const el    = group.querySelector(`[data-fe-idx="${dragState.idx}"]`);
        if (el) {
            el.querySelector("circle").setAttribute("cx", p.x);
            el.querySelector("circle").setAttribute("cy", p.y);
            const t = el.querySelector("text");
            t.setAttribute("x", p.x);
            t.setAttribute("y", p.y + 4);
        }
        dirty = true;
    });

    svg.addEventListener("pointerup", () => { dragState = null; });
    svg.addEventListener("pointercancel", () => { dragState = null; });
}

// ── Event change / Load Squad ─────────────────────────────────────────────────

function onEventChange() {
    const eventId = parseInt(document.getElementById("fe-event").value) || null;
    const btn = document.getElementById("btn-fe-load-squad");
    // Enable the button only for match events that have squad data potentially available
    const ev = allEvents.find(e => e.id === eventId);
    btn.disabled = !(ev && ev.type === "match");
}

async function loadSquad() {
    const eventId = parseInt(document.getElementById("fe-event").value) || null;
    if (!eventId) return;
    try {
        const squadRows = await apiFetch(`/events/${eventId}/squad`);
        if (!squadRows.length) {
            showToast("No squad saved for this match yet — set it in the Calendar", "error");
            return;
        }
        if (placedPlayers.length && !confirm(`Replace the ${placedPlayers.length} player(s) on the field with the match squad?`)) return;

        placedPlayers = [];
        squadRows.forEach((s, i) => {
            const member = allMembers.find(m => m.id === s.member_id);
            const preset = PRESET[i % PRESET.length];
            placedPlayers.push({
                member_id:   s.member_id,
                jersey_name: s.name || (member ? (member.jersey_name || member.name) : `#${s.member_id}`),
                x: preset.x,
                y: preset.y,
            });
        });
        dirty = true;
        renderField();
        showToast(`Loaded ${squadRows.length} player${squadRows.length !== 1 ? "s" : ""} from match squad`);
    } catch (err) {
        showToast(err.message, "error");
    }
}

// ── Toggle player on/off field ────────────────────────────────────────────────

window._feToggle = (memberId) => {
    const idx = placedPlayers.findIndex(p => p.member_id === memberId);
    if (idx !== -1) {
        placedPlayers.splice(idx, 1);
    } else {
        const member = allMembers.find(m => m.id === memberId);
        if (!member) return;
        const preset = PRESET[placedPlayers.length % PRESET.length];
        placedPlayers.push({
            member_id:   member.id,
            jersey_name: member.jersey_name || member.name,
            x: preset.x,
            y: preset.y,
        });
    }
    dirty = true;
    renderField();
};

// ── Formation CRUD ────────────────────────────────────────────────────────────

function clearEditor() {
    placedPlayers = [];
    currentFormationId = null;
    dirty = false;
    document.getElementById("fe-name").value = "";
    document.getElementById("fe-event").value = "";
    renderField();
    renderFormationList();
}

function openSaveModal() {
    const nameEl = document.getElementById("fe-save-name");
    nameEl.value = document.getElementById("fe-name").value;
    document.getElementById("fe-save-event").value = document.getElementById("fe-event").value;
    document.getElementById("fe-save-notes").value = "";
    document.getElementById("fe-save-error").classList.add("d-none");
    new bootstrap.Modal(document.getElementById("feSaveModal")).show();
}

async function saveFormation() {
    const name  = document.getElementById("fe-save-name").value.trim();
    const errEl = document.getElementById("fe-save-error");
    errEl.classList.add("d-none");

    if (!name) {
        errEl.textContent = "Formation name is required.";
        errEl.classList.remove("d-none");
        return;
    }
    if (!placedPlayers.length) {
        errEl.textContent = "Place at least one player on the field before saving.";
        errEl.classList.remove("d-none");
        return;
    }

    const event_id = parseInt(document.getElementById("fe-save-event").value) || null;
    const notes    = document.getElementById("fe-save-notes").value.trim() || null;
    const payload  = { name, event_id, positions: placedPlayers, notes };

    try {
        let saved;
        if (currentFormationId) {
            saved = await apiFetch(`/field-formations/${currentFormationId}`, { method: "PUT", body: JSON.stringify(payload) });
        } else {
            saved = await apiFetch("/field-formations", { method: "POST", body: JSON.stringify(payload) });
        }
        currentFormationId = saved.id;
        document.getElementById("fe-name").value = saved.name;
        dirty = false;
        allFormations = await apiFetch("/field-formations");
        renderFormationList();
        bootstrap.Modal.getInstance(document.getElementById("feSaveModal"))?.hide();
        showToast("Formation saved");
    } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove("d-none");
    }
}

window._feLoad = (id) => {
    if (dirty && !confirm("Discard unsaved changes and load this formation?")) return;
    const f = allFormations.find(f => f.id === id);
    if (!f) return;
    currentFormationId = f.id;
    document.getElementById("fe-name").value = f.name;
    document.getElementById("fe-event").value = f.event_id || "";
    placedPlayers = (f.positions || []).map(p => ({ ...p }));
    dirty = false;
    renderField();
    renderFormationList();
};

window._feDelete = async (id) => {
    if (!confirm("Delete this formation?")) return;
    try {
        await apiFetch(`/field-formations/${id}`, { method: "DELETE" });
        if (currentFormationId === id) clearEditor();
        allFormations = allFormations.filter(f => f.id !== id);
        renderFormationList();
        showToast("Formation deleted");
    } catch (err) {
        showToast(err.message, "error");
    }
};

// ── AI Field Suggester ────────────────────────────────────────────────────────

async function runAISuggestion() {
    const btn     = document.getElementById("btn-ai-suggest");
    const spinner = document.getElementById("ai-spinner");
    const expl    = document.getElementById("ai-explanation");

    btn.disabled = true;
    spinner.classList.remove("d-none");
    expl.classList.add("d-none");

    const body = {
        arm:          document.getElementById("ai-arm").value,
        side:         document.getElementById("ai-side").value,
        bowling_type: document.getElementById("ai-type").value,
        length:       document.getElementById("ai-length").value,
        line:         document.getElementById("ai-line").value,
        movement:     document.getElementById("ai-movement").value,
        amount:       document.getElementById("ai-amount").value,
        batter_hand:  document.getElementById("ai-batter").value,
        phase:        document.getElementById("ai-phase").value,
    };

    try {
        const res = await apiFetch("/ai/field-suggestion", {
            method: "POST",
            body: JSON.stringify(body),
        });

        // Place fielders as anonymous dots (no member_id) using AI coordinates
        if (placedPlayers.length && !confirm(`Replace the ${placedPlayers.length} current player(s) with the AI-suggested field?`)) return;

        placedPlayers = res.positions.map(p => ({
            member_id:   null,
            jersey_name: p.label,
            x: p.x,
            y: p.y,
        }));
        dirty = true;
        renderField();

        if (res.explanation) {
            expl.textContent = `🤖 ${res.explanation}`;
            expl.classList.remove("d-none");
        }
        showToast("AI field generated — drag to adjust, then Save");
    } catch (err) {
        showToast(err.message, "error");
    } finally {
        btn.disabled = false;
        spinner.classList.add("d-none");
    }
}

// ── Export & Print ────────────────────────────────────────────────────────────

function getAnnotatedSVG() {
    const svg  = document.getElementById("fe-svg");
    const name = document.getElementById("fe-name").value.trim();
    const clone = svg.cloneNode(true);
    // Add formation name as title text
    if (name) {
        const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
        t.setAttribute("x", "300");
        t.setAttribute("y", "22");
        t.setAttribute("text-anchor", "middle");
        t.setAttribute("font-size", "16");
        t.setAttribute("font-weight", "bold");
        t.setAttribute("fill", "white");
        t.setAttribute("font-family", "sans-serif");
        t.textContent = name;
        clone.insertBefore(t, clone.firstChild);
    }
    return new XMLSerializer().serializeToString(clone);
}

async function exportPNG() {
    if (!placedPlayers.length) { showToast("Place players on the field first", "error"); return; }
    const svgStr = getAnnotatedSVG();
    const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const img  = new Image();
    img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 900;
        canvas.height = 900;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#1a3d22";
        ctx.fillRect(0, 0, 900, 900);
        ctx.drawImage(img, 0, 0, 900, 900);
        URL.revokeObjectURL(url);
        const link = document.createElement("a");
        const safe = (document.getElementById("fe-name").value.trim() || "formation").replace(/[^a-z0-9]/gi, "_");
        link.download = `${safe}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
    };
    img.onerror = () => { URL.revokeObjectURL(url); showToast("Export failed", "error"); };
    img.src = url;
}

function printFormation() {
    if (!placedPlayers.length) { showToast("Place players on the field first", "error"); return; }
    const svgStr  = getAnnotatedSVG();
    const name    = escHtml(document.getElementById("fe-name").value.trim() || "Cricket Formation");
    const win     = window.open("", "_blank", "width=700,height=750");
    win.document.write(`<!DOCTYPE html>
<html><head><title>${name}</title>
<style>
  body { margin: 20px; text-align: center; font-family: sans-serif; background: #fff; }
  h2 { margin: 0 0 10px; font-size: 18px; }
  svg { max-width: 600px; width: 100%; height: auto; }
</style>
</head><body>
<h2>${name}</h2>
${svgStr}
<script>window.onload = () => { window.print(); }<\/script>
</body></html>`);
    win.document.close();
}
