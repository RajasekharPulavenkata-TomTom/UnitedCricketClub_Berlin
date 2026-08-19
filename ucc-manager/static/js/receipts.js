import { apiFetch, fmt, showToast, escHtml } from "/js/api.js";

// ── Signature pad (vanilla pointer events, DPR-aware) ─────────────────────────

let _canvas, _ctx, _hasInk = false, _drawing = false;

function initSigPad() {
    _canvas = document.getElementById("sig-pad");
    const dpr = window.devicePixelRatio || 1;
    const rect = _canvas.getBoundingClientRect();
    _canvas.width = rect.width * dpr;
    _canvas.height = rect.height * dpr;
    _ctx = _canvas.getContext("2d");
    _ctx.scale(dpr, dpr);
    _ctx.lineWidth = 2;
    _ctx.lineCap = "round";
    _ctx.lineJoin = "round";
    _ctx.strokeStyle = "#1a3a8b";

    const pos = (e) => {
        const r = _canvas.getBoundingClientRect();
        return [e.clientX - r.left, e.clientY - r.top];
    };
    _canvas.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        _drawing = true;
        _canvas.setPointerCapture(e.pointerId);
        _ctx.beginPath();
        _ctx.moveTo(...pos(e));
    });
    _canvas.addEventListener("pointermove", (e) => {
        if (!_drawing) return;
        e.preventDefault();
        _ctx.lineTo(...pos(e));
        _ctx.stroke();
        _hasInk = true;
    });
    const stop = () => { _drawing = false; };
    _canvas.addEventListener("pointerup", stop);
    _canvas.addEventListener("pointercancel", stop);

    document.getElementById("sig-clear").addEventListener("click", clearSig);
}

function clearSig() {
    _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
    _hasInk = false;
}

// ── Quittung rendering ─────────────────────────────────────────────────────────

function renderQuittung(r) {
    document.getElementById("quittung-body").innerHTML = `
      <div class="d-flex justify-content-between align-items-start mb-3">
        <div>
          <!-- legal entity name (registered Verein), not the club brand -->
          <div class="fw-bold fs-6" style="color:#1a3a8b">HELLERSDORFER ATHLETIK-CLUB BERLIN e.&nbsp;V.</div>
          <div class="q-label">Quittung / Receipt</div>
        </div>
        <div class="text-end">
          <div class="fw-semibold">${escHtml(r.receipt_no)}</div>
          <div class="q-label">${fmt.date(r.date)}</div>
        </div>
      </div>
      <hr />
      <div class="row g-3 mb-2">
        <div class="col-6"><div class="q-label">Betrag / Amount</div>
          <div class="fw-bold fs-4">${fmt.currency(r.amount)}</div></div>
        <div class="col-6"><div class="q-label">Zweck / Purpose</div>
          <div class="fw-semibold">${escHtml(r.purpose)}</div></div>
        ${r.event_title ? `<div class="col-12"><div class="q-label">Spiel / Match</div>
          <div>${escHtml(r.event_title)}</div></div>` : ""}
        <div class="col-6"><div class="q-label">Gezahlt von / Paid by</div>
          <div>${escHtml(r.paid_by || "—")}</div></div>
        <div class="col-6"><div class="q-label">Erhalten von / Received by</div>
          <div>${escHtml(r.recipient_name)}</div></div>
      </div>
      <div class="q-sig mt-3">
        <div class="q-label mb-1">Betrag dankend erhalten — Unterschrift / Signature</div>
        <img src="${r.signature}" alt="Signature" />
        <div class="border-top mt-1 pt-1 q-label">${escHtml(r.recipient_name)}, ${fmt.date(r.date)}</div>
      </div>`;
    document.getElementById("quittung-view").classList.remove("d-none");
    document.getElementById("quittung-actions").classList.remove("d-none");
}

// ── List ───────────────────────────────────────────────────────────────────────

async function loadList() {
    const el = document.getElementById("receipts-list");
    const rows = await apiFetch("/receipts");
    if (!rows.length) {
        el.innerHTML = `<div class="text-center text-muted py-4">No receipts yet.</div>`;
        return;
    }
    el.innerHTML = rows.map(r => `
      <button class="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
              data-id="${r.id}">
        <span>
          <span class="fw-semibold">${escHtml(r.receipt_no)}</span>
          <span class="text-muted small ms-2">${escHtml(r.recipient_name)}</span>
        </span>
        <span class="text-end">
          <span class="fw-semibold">${fmt.currency(r.amount)}</span>
          <span class="text-muted small ms-2">${fmt.date(r.date)}</span>
        </span>
      </button>`).join("");
    el.querySelectorAll("[data-id]").forEach(btn =>
        btn.addEventListener("click", async () => {
            renderQuittung(await apiFetch(`/receipts/${btn.dataset.id}`));
            document.getElementById("quittung-view").scrollIntoView({ behavior: "smooth" });
        }));
}

// ── Init ───────────────────────────────────────────────────────────────────────

export async function init() {
    initSigPad();
    document.getElementById("btn-print").addEventListener("click", () => window.print());

    const form = document.getElementById("receipt-form");
    const today = new Date().toISOString().split("T")[0];
    form.date.value = today;

    // Offer this month's events, preselecting one on today's date
    const now = new Date();
    apiFetch(`/events?year=${now.getFullYear()}&month=${now.getMonth() + 1}`).then(events => {
        const sel = form.event_id;
        events.forEach(ev => {
            const opt = document.createElement("option");
            opt.value = ev.id;
            opt.textContent = `${fmt.date(ev.date)} — ${ev.title}`;
            if (ev.date === today) opt.selected = true;
            sel.appendChild(opt);
        });
    }).catch(() => {});

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const errEl = document.getElementById("receipt-error");
        errEl.classList.add("d-none");
        if (!_hasInk) {
            errEl.textContent = "The recipient must sign before saving.";
            errEl.classList.remove("d-none");
            return;
        }
        try {
            const receipt = await apiFetch("/receipts", {
                method: "POST",
                body: JSON.stringify({
                    date: form.date.value,
                    recipient_name: form.recipient_name.value,
                    amount: parseFloat(form.amount.value),
                    purpose: form.purpose.value,
                    event_id: form.event_id.value ? parseInt(form.event_id.value) : null,
                    signature: _canvas.toDataURL("image/png"),
                }),
            });
            showToast(`Receipt ${receipt.receipt_no} saved`);
            renderQuittung(receipt);
            form.recipient_name.value = "";
            form.amount.value = "";
            clearSig();
            loadList();
        } catch (err) {
            errEl.textContent = err.message;
            errEl.classList.remove("d-none");
        }
    });

    await loadList();
}
