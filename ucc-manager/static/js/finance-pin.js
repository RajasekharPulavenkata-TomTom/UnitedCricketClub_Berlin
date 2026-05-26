import { showToast } from "/js/api.js";

const UNLOCK_KEY = "ucc_finance_unlocked";
const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export function isUnlocked() {
    const t = sessionStorage.getItem(UNLOCK_KEY);
    return !!t && (Date.now() - Number(t)) < TIMEOUT_MS;
}

export function lock() {
    sessionStorage.removeItem(UNLOCK_KEY);
}

function _unlock() {
    sessionStorage.setItem(UNLOCK_KEY, String(Date.now()));
}

export async function ensureUnlocked(container) {
    if (isUnlocked()) return true;
    const { set } = await fetch("/api/finance/pin/status").then(r => r.json());
    if (!set) { _unlock(); return true; }
    return new Promise(resolve => _renderKeypad(container, resolve));
}

function _renderKeypad(container, resolve) {
    let entered = "";
    let busy = false;

    container.innerHTML = `
    <div class="d-flex align-items-center justify-content-center" style="min-height:72vh">
      <div class="card shadow" style="width:300px">
        <div class="card-header text-center fw-semibold py-3" style="background:#1a472a;color:#fff">
          <i class="bi bi-lock-fill me-2"></i>Finance PIN
        </div>
        <div class="card-body text-center py-4 px-4">
          <p class="text-muted small mb-4">Enter your PIN to access finance</p>
          <div class="d-flex justify-content-center gap-3 mb-1" id="fp-dots">
            <div class="fp-dot"></div><div class="fp-dot"></div>
            <div class="fp-dot"></div><div class="fp-dot"></div>
          </div>
          <div id="fp-err" class="text-danger small mt-2 mb-3" style="min-height:1.3em"></div>
          <div class="fp-pad">
            ${[1,2,3,4,5,6,7,8,9,null,0,"⌫"].map(k =>
              k === null
                ? `<div></div>`
                : `<button class="btn btn-outline-secondary fp-key" data-k="${k}">${k}</button>`
            ).join("")}
          </div>
        </div>
      </div>
    </div>
    <style>
      .fp-pad{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-width:200px;margin:0 auto}
      .fp-key{padding:14px;font-size:1.15rem;border-radius:8px}
      .fp-dot{width:14px;height:14px;border-radius:50%;border:2px solid #adb5bd;background:transparent;transition:background .12s,border-color .12s}
      .fp-dot.on{background:#1a472a;border-color:#1a472a}
    </style>`;

    const sync = () => document.querySelectorAll(".fp-dot").forEach((d, i) =>
        d.classList.toggle("on", i < entered.length));

    const tryVerify = async () => {
        if (busy) return;
        busy = true;
        const { ok } = await fetch("/api/finance/pin/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pin: entered }),
        }).then(r => r.json());
        if (ok) {
            _unlock();
            resolve(true);
        } else {
            document.getElementById("fp-err").textContent = "Incorrect PIN — try again.";
            entered = "";
            sync();
            busy = false;
        }
    };

    container.querySelectorAll(".fp-key").forEach(btn => {
        btn.addEventListener("click", () => {
            if (busy) return;
            document.getElementById("fp-err").textContent = "";
            const k = btn.dataset.k;
            if (k === "⌫") { entered = entered.slice(0, -1); }
            else if (entered.length < 4) { entered += k; }
            sync();
            if (entered.length === 4) tryVerify();
        });
    });
}

export async function showPinModal() {
    const { set } = await fetch("/api/finance/pin/status").then(r => r.json());

    document.getElementById("fp-mgmt-modal")?.remove();

    const el = document.createElement("div");
    el.innerHTML = `
    <div class="modal fade" id="fp-mgmt-modal" tabindex="-1">
      <div class="modal-dialog modal-sm">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${set ? "Change PIN" : "Set Finance PIN"}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            ${set ? `
            <div class="mb-3">
              <label class="form-label small fw-semibold">Current PIN</label>
              <input type="password" class="form-control" id="fp-current" inputmode="numeric" maxlength="6" placeholder="••••">
            </div>` : ""}
            <div class="mb-3">
              <label class="form-label small fw-semibold">New PIN <span class="text-muted fw-normal">(4–6 digits)</span></label>
              <input type="password" class="form-control" id="fp-new" inputmode="numeric" maxlength="6" placeholder="••••">
            </div>
            <div class="mb-2">
              <label class="form-label small fw-semibold">Confirm new PIN</label>
              <input type="password" class="form-control" id="fp-confirm" inputmode="numeric" maxlength="6" placeholder="••••">
            </div>
            <div id="fp-mgmt-err" class="text-danger small" style="min-height:1.2em"></div>
          </div>
          <div class="modal-footer ${set ? "justify-content-between" : "justify-content-end"}">
            ${set ? `<button class="btn btn-sm btn-outline-danger" id="fp-remove-btn"><i class="bi bi-trash me-1"></i>Remove PIN</button>` : ""}
            <button class="btn btn-success btn-sm" id="fp-save-btn">${set ? "Update PIN" : "Set PIN"}</button>
          </div>
        </div>
      </div>
    </div>`;
    document.body.appendChild(el);

    const modal = new bootstrap.Modal(document.getElementById("fp-mgmt-modal"));
    modal.show();

    document.getElementById("fp-save-btn").addEventListener("click", async () => {
        const err = document.getElementById("fp-mgmt-err");
        const current = document.getElementById("fp-current")?.value || undefined;
        const newPin  = document.getElementById("fp-new").value.trim();
        const confirm = document.getElementById("fp-confirm").value.trim();
        err.textContent = "";
        if (!/^\d{4,6}$/.test(newPin)) { err.textContent = "PIN must be 4–6 digits."; return; }
        if (newPin !== confirm)         { err.textContent = "PINs do not match."; return; }

        const res = await fetch("/api/finance/pin/set", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pin: newPin, current_pin: current }),
        });
        const data = await res.json();
        if (res.ok) { modal.hide(); showToast(set ? "PIN updated" : "Finance PIN set"); }
        else { err.textContent = data.detail || "Failed to update PIN."; }
    });

    if (set) {
        document.getElementById("fp-remove-btn").addEventListener("click", async () => {
            const err = document.getElementById("fp-mgmt-err");
            const current = document.getElementById("fp-current")?.value || "";
            if (!current) { err.textContent = "Enter current PIN to remove it."; return; }

            const res = await fetch("/api/finance/pin", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pin: current }),
            });
            const data = await res.json();
            if (res.ok) { modal.hide(); lock(); showToast("Finance PIN removed"); }
            else { err.textContent = data.detail || "Incorrect PIN."; }
        });
    }
}
