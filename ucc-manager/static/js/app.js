import { apiFetch } from "/js/api.js";

// ── Auth gate ──────────────────────────────────────────────────────────────────

let authModal;

function initAuth() {
    authModal = new bootstrap.Modal(document.getElementById("authModal"));

    document.getElementById("login-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const form = e.target;
        const errEl = document.getElementById("login-error");
        errEl.classList.add("d-none");
        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: form.username.value, password: form.password.value }),
            });
            const data = await res.json();
            if (!res.ok) {
                errEl.textContent = data.detail || "Login failed";
                errEl.classList.remove("d-none");
                return;
            }
            localStorage.setItem("ucc_token", data.access_token);
            localStorage.setItem("ucc_user", JSON.stringify({ username: data.username, role: data.role, id: data.user_id, member_id: data.member_id ?? null }));
            authModal.hide();
            bootApp();
        } catch {
            errEl.textContent = "Network error. Please try again.";
            errEl.classList.remove("d-none");
        }
    });

    document.getElementById("register-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const form = e.target;
        const errEl = document.getElementById("register-error");
        errEl.classList.add("d-none");
        try {
            const res = await fetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: form.username.value, password: form.password.value, full_name: form.full_name.value }),
            });
            const data = await res.json();
            if (!res.ok) {
                errEl.textContent = data.detail || "Registration failed";
                errEl.classList.remove("d-none");
                return;
            }
            document.getElementById("register-form").classList.add("d-none");
            document.getElementById("register-success").classList.remove("d-none");
        } catch {
            errEl.textContent = "Network error. Please try again.";
            errEl.classList.remove("d-none");
        }
    });

    window.addEventListener("ucc:logout", () => {
        document.getElementById("page-content").innerHTML = "";
        authModal.show();
        window._authTab("login");
    });
}

window._authTab = (tab) => {
    document.getElementById("auth-login").classList.toggle("d-none", tab !== "login");
    document.getElementById("auth-register").classList.toggle("d-none", tab !== "register");
    document.getElementById("tab-login-btn").classList.toggle("active", tab === "login");
    document.getElementById("tab-register-btn").classList.toggle("active", tab === "register");
};

function bootApp() {
    let user = null;
    try { user = JSON.parse(localStorage.getItem("ucc_user") || "null"); } catch { localStorage.removeItem("ucc_user"); }
    if (user) {
        document.getElementById("navbar-user").textContent = user.username;
        document.getElementById("navbar-user-area").style.removeProperty("display");
        if (user.role === "admin" || user.role === "root") {
            document.getElementById("nav-admin").style.display = "";
        }
    }

    document.getElementById("navbar-logout").addEventListener("click", () => {
        localStorage.removeItem("ucc_token");
        localStorage.removeItem("ucc_user");
        document.getElementById("navbar-user").textContent = "";
        document.getElementById("navbar-user-area").style.setProperty("display", "none", "important");
        document.getElementById("nav-admin").style.display = "none";
        document.getElementById("page-content").innerHTML = "";
        authModal.show();
        window._authTab("login");
    }, { once: true });

    const changePwdModal = new bootstrap.Modal(document.getElementById("changePwdModal"));
    document.getElementById("navbar-change-pwd").addEventListener("click", () => {
        document.getElementById("change-pwd-form").reset();
        document.getElementById("change-pwd-error").classList.add("d-none");
        changePwdModal.show();
    });
    document.getElementById("change-pwd-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const form = e.target;
        const errEl = document.getElementById("change-pwd-error");
        errEl.classList.add("d-none");
        if (form.new_password.value !== form.confirm_password.value) {
            errEl.textContent = "New passwords do not match.";
            errEl.classList.remove("d-none");
            return;
        }
        try {
            const res = await fetch("/api/auth/me/password", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${localStorage.getItem("ucc_token")}`,
                },
                body: JSON.stringify({ current_password: form.current_password.value, new_password: form.new_password.value }),
            });
            if (!res.ok) {
                const data = await res.json();
                errEl.textContent = data.detail || "Failed to update password.";
                errEl.classList.remove("d-none");
                return;
            }
            changePwdModal.hide();
            import("/js/api.js").then(({ showToast }) => showToast("Password updated successfully"));
        } catch {
            errEl.textContent = "Network error. Please try again.";
            errEl.classList.remove("d-none");
        }
    });

    window.addEventListener("hashchange", router);
    router();
    _loadSponsorsFooter();
}

async function _loadSponsorsFooter() {
    try {
        const sponsors = await apiFetch("/sponsors");
        const active = sponsors.filter(s => s.is_active);
        const footer  = document.getElementById("sponsors-footer");
        const logos   = document.getElementById("sponsors-footer-logos");
        if (!active.length) { footer.classList.add("d-none"); return; }
        logos.innerHTML = active.map(s => {
            const nameEsc = String(s.name ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
            const logoHtml = s.logo_url
                ? `<img src="${s.logo_url}" alt="${nameEsc}" style="max-height:48px;max-width:140px;object-fit:contain;display:block" onerror="this.style.display='none'">`
                : "";
            const card = `
                <div class="d-flex flex-column align-items-center gap-1">
                    ${logoHtml}
                    <span class="fw-semibold small text-dark">${nameEsc}</span>
                    ${s.website_url ? `<span class="text-muted" style="font-size:.7rem">${String(s.website_url).replace(/^https?:\/\//,"")}</span>` : ""}
                </div>`;
            return s.website_url
                ? `<a href="${s.website_url}" target="_blank" rel="noopener noreferrer" class="text-decoration-none">${card}</a>`
                : card;
        }).join("");
        footer.classList.remove("d-none");
    } catch {
        // silently skip if sponsors endpoint fails
    }
}

window._refreshSponsorsFooter = _loadSponsorsFooter;

// ── Boot ───────────────────────────────────────────────────────────────────────

document.getElementById("navbar-date").textContent = new Date().toLocaleDateString("en-GB", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
});

initAuth();

if (localStorage.getItem("ucc_token")) {
    bootApp();
} else {
    authModal.show();
}

// ── Pages ──────────────────────────────────────────────────────────────────────

// Single timestamp for the whole session — busts cache on page load/deploy
// but allows the browser to cache files across in-session navigations.
const _SV = Date.now();

const PAGES = {
    home:               { html: "/pages/home.html",               js: "/js/home.js"               },
    dashboard:          { html: "/pages/dashboard.html",          js: "/js/dashboard.js"          },
    transactions:       { html: "/pages/transactions.html",        js: "/js/transactions.js"       },
    categories:         { html: "/pages/categories.html",          js: "/js/categories.js"         },
    reports:            { html: "/pages/reports.html",             js: "/js/reports.js"            },
    equipment:          { html: "/pages/equipment.html",           js: "/js/equipment.js"          },
    maintenance:        { html: "/pages/maintenance.html",         js: "/js/maintenance.js"        },
    members:            { html: "/pages/members.html",             js: "/js/members.js"            },
    tasks:              { html: "/pages/tasks.html",               js: "/js/tasks.js"              },
    "club-fees":        { html: "/pages/club-fees.html",          js: "/js/club-fees.js"          },
    "reporting":          { html: "/pages/reporting.html",           js: "/js/reporting.js"           },
    "practice-reporting": { html: "/pages/practice-reporting.html", js: "/js/practice-reporting.js"  },
    "field-editor":       { html: "/pages/field-editor.html",       js: "/js/field-editor.js"         },
    "match-results":      { html: "/pages/scoreboard.html",          js: "/js/scoreboard.js"           },
    "external-tournaments": { html: "/pages/external-tournaments.html", js: "/js/external-tournaments.js" },
    "internal-tournaments": { html: "/pages/internal-tournaments.html", js: "/js/internal-tournaments.js" },
    calendar:           { html: "/pages/calendar.html",            js: "/js/calendar.js"           },
    rules:              { html: "/pages/rules.html",               js: "/js/rules.js"              },
    history:            { html: "/pages/history.html",             js: "/js/history.js"            },
    "cricket-rules":    { html: "/pages/cricket-rules.html",       js: "/js/cricket-rules.js"      },
    "cricket-formats":  { html: "/pages/cricket-formats.html",     js: "/js/cricket-formats.js"    },
    "cricket-positions":{ html: "/pages/cricket-positions.html",   js: "/js/cricket-positions.js"  },
    "cricket-glossary": { html: "/pages/cricket-glossary.html",    js: "/js/cricket-glossary.js"   },
    "dl-calculator":    { html: "/pages/dl-calculator.html",       js: "/js/dl-calculator.js"      },
    polls:              { html: "/pages/polls.html",               js: "/js/polls.js"              },
    "pain-points":      { html: "/pages/pain-points.html",         js: "/js/pain-points.js"        },
    violations:         { html: "/pages/violations.html",          js: "/js/violations.js"         },
    approvals:          { html: "/pages/approvals.html",           js: "/js/approvals.js"          },
    "user-management":  { html: "/pages/user-management.html",    js: "/js/user-management.js"    },
    sponsors:           { html: "/pages/sponsors.html",            js: "/js/sponsors.js"           },
};

async function router() {
    const hash = location.hash.replace("#", "") || "home";
    const page = PAGES[hash] || PAGES.dashboard;
    const container = document.getElementById("page-content");
    container.innerHTML = `<div class="d-flex justify-content-center py-5"><div class="spinner-border text-success"></div></div>`;

    // Clean up any Bootstrap modal state left over from the previous page
    document.querySelectorAll(".modal.show").forEach(el => bootstrap.Modal.getInstance(el)?.hide());
    document.querySelectorAll(".modal-backdrop").forEach(el => el.remove());
    document.body.classList.remove("modal-open");
    document.body.style.removeProperty("overflow");
    document.body.style.removeProperty("padding-right");

    try {
        const html = await fetch(page.html + "?v=" + _SV).then((r) => r.text());
        container.innerHTML = html;
        const mod = await import(page.js + "?v=" + _SV);
        if (mod.init) mod.init();
        apiFetch("/page-views", { method: "POST", body: JSON.stringify({ page: hash }) }).catch(() => {});
    } catch (e) {
        container.innerHTML = `<div class="alert alert-danger">Failed to load page: ${e.message}</div>`;
    }
}

