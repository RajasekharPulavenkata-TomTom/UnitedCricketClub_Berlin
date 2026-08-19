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

// ── German amount in words ("Gesamtbetrag in Worten") ────────────────────────

const _ONES = ["", "ein", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun",
    "zehn", "elf", "zwölf", "dreizehn", "vierzehn", "fünfzehn", "sechzehn", "siebzehn", "achtzehn", "neunzehn"];
const _TENS = ["", "", "zwanzig", "dreißig", "vierzig", "fünfzig", "sechzig", "siebzig", "achtzig", "neunzig"];

function _two(n) {
    if (n < 20) return _ONES[n];
    return (n % 10 ? _ONES[n % 10] + "und" : "") + _TENS[Math.floor(n / 10)];
}
function _three(n) {
    return (n >= 100 ? _ONES[Math.floor(n / 100)] + "hundert" : "") + _two(n % 100);
}
function amountInWords(amount) {
    const euros = Math.floor(amount);
    const cents = Math.round((amount - euros) * 100);
    let words = euros === 0 ? "null"
        : (euros >= 1000 ? (Math.floor(euros / 1000) === 1 ? "ein" : _three(Math.floor(euros / 1000))) + "tausend" : "")
          + _three(euros % 1000);
    words += " Euro";
    if (cents) words += " und " + _two(cents) + " Cent";
    return words.charAt(0).toUpperCase() + words.slice(1);
}

// ── Quittung rendering (mirrors the classic German receipt-pad layout) ────────

const CLUB_LEGAL_NAME = "HELLERSDORFER ATHLETIK-CLUB BERLIN e. V.";
const _eur = (n) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const _deDate = (d) => new Date(d + "T00:00:00").toLocaleDateString("de-DE");

function renderQuittung(r) {
    const fuer = r.purpose + (r.event_title ? ` — ${r.event_title}` : "");
    document.getElementById("quittung-body").innerHTML = `
      <div class="d-flex justify-content-between align-items-start mb-3 gap-3">
        <div class="q-head-box">
          <div class="q-head-title">Quittung</div>
          <div class="q-head-no">Quittung Nr.: <strong>${escHtml(r.receipt_no)}</strong></div>
        </div>
        <table class="q-amounts"><tbody>
          <tr><td class="q-label pe-2 text-end">Netto:</td><td class="q-line text-end">${_eur(r.amount)}</td></tr>
          <tr><td class="q-label pe-2 text-end">+ 0&nbsp;% MwSt:</td><td class="q-line text-end">${_eur(0)}</td></tr>
          <tr><td class="q-label pe-2 text-end fw-bold">Gesamtbetrag:</td><td class="q-line q-total text-end fw-bold">${_eur(r.amount)}</td></tr>
        </tbody></table>
      </div>

      <div class="q-row"><span class="q-label">Gesamtbetrag in Worten:</span>
        <span class="q-line flex-grow-1">${escHtml(amountInWords(r.amount))}</span></div>
      <div class="q-label fst-italic mb-3">(Im Gesamtbetrag sind 0&nbsp;% Mehrwertsteuer enthalten.)</div>

      <div class="q-row"><span class="q-label">Von</span>
        <span class="q-line flex-grow-1">${CLUB_LEGAL_NAME}${r.paid_by ? ` (${escHtml(r.paid_by)})` : ""}</span></div>
      <div class="q-row"><span class="q-label">für</span>
        <span class="q-line flex-grow-1">${escHtml(fuer)}</span></div>
      <div class="q-label fst-italic mb-3">dankend erhalten.</div>

      <div class="q-row mb-3">
        <span class="q-label">Ort:</span><span class="q-line flex-grow-1">${escHtml(r.location || "Berlin")}</span>
        <span class="q-label ms-3">Datum:</span><span class="q-line" style="min-width:110px">${_deDate(r.date)}</span>
      </div>

      <div class="d-flex justify-content-between align-items-end gap-4">
        <div class="q-book-box">
          <div class="q-label">Buchungsvermerke:</div>
        </div>
        <div class="q-sig text-center">
          <img src="${r.signature}" alt="Signature" />
          <div class="border-top border-dark mt-1 pt-1 q-label">Stempel / Unterschrift des Empfängers</div>
          <div class="q-label">${escHtml(r.recipient_name)}</div>
        </div>
      </div>`;
    document.getElementById("quittung-view").classList.remove("d-none");
    document.getElementById("quittung-actions").classList.remove("d-none");
}

// ── List ───────────────────────────────────────────────────────────────────────

let _isAdmin = false;

async function loadList() {
    const el = document.getElementById("receipts-list");
    const rows = await apiFetch("/receipts");
    if (!rows.length) {
        el.innerHTML = `<div class="text-center text-muted py-4">No receipts yet.</div>`;
        return;
    }
    el.innerHTML = rows.map(r => `
      <div class="list-group-item d-flex justify-content-between align-items-center gap-2">
        <button class="btn btn-link text-decoration-none text-start text-reset flex-grow-1 p-0 d-flex justify-content-between align-items-center gap-2"
                data-id="${r.id}">
          <span>
            <span class="fw-semibold">${escHtml(r.receipt_no)}</span>
            <span class="text-muted small ms-2">${escHtml(r.recipient_name)}</span>
          </span>
          <span class="text-end">
            <span class="fw-semibold">${fmt.currency(r.amount)}</span>
            <span class="text-muted small ms-2">${fmt.date(r.date)}</span>
          </span>
        </button>
        ${_isAdmin ? `<button class="btn btn-outline-danger btn-sm" data-del="${r.id}"
            title="Delete ${escHtml(r.receipt_no)}"><i class="bi bi-trash"></i></button>` : ""}
      </div>`).join("");
    el.querySelectorAll("[data-id]").forEach(btn =>
        btn.addEventListener("click", async () => {
            renderQuittung(await apiFetch(`/receipts/${btn.dataset.id}`));
            document.getElementById("quittung-view").scrollIntoView({ behavior: "smooth" });
        }));
    el.querySelectorAll("[data-del]").forEach(btn =>
        btn.addEventListener("click", async () => {
            if (!confirm("Delete this receipt? It is a bookkeeping document — only remove clear mistakes.")) return;
            try {
                await apiFetch(`/receipts/${btn.dataset.del}`, { method: "DELETE" });
                showToast("Receipt deleted");
                // the deleted receipt may be the one on display
                document.getElementById("quittung-view").classList.add("d-none");
                document.getElementById("quittung-actions").classList.add("d-none");
                loadList();
            } catch (err) {
                showToast(err.message, "danger");
            }
        }));
}

// ── Init ───────────────────────────────────────────────────────────────────────

export async function init() {
    initSigPad();
    document.getElementById("btn-print").addEventListener("click", () => window.print());

    const me = await apiFetch("/auth/me").catch(() => null);
    _isAdmin = me?.role === "manager" || me?.role === "developer";

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
                    location: form.location.value,
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
