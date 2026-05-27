import { apiFetch } from "/js/api.js";
import { ensureUnlocked, lock, showPinModal } from "/js/finance-pin.js";

const FINANCE_PAGES = new Set(["dashboard", "transactions", "categories", "reports"]);

const PAGES = {
    home:               { html: "/pages/home.html",               js: "/js/home.js"               },
    dashboard:          { html: "/pages/dashboard.html",          js: "/js/dashboard.js"          },
    transactions:       { html: "/pages/transactions.html",        js: "/js/transactions.js"       },
    categories:         { html: "/pages/categories.html",          js: "/js/categories.js"         },
    reports:            { html: "/pages/reports.html",             js: "/js/reports.js"            },
    equipment:          { html: "/pages/equipment.html",           js: "/js/equipment.js"          },
    assignments:        { html: "/pages/assignments.html",         js: "/js/assignments.js"        },
    "player-inventory": { html: "/pages/player-inventory.html",   js: "/js/player-inventory.js"   },
    maintenance:        { html: "/pages/maintenance.html",         js: "/js/maintenance.js"        },
    members:            { html: "/pages/members.html",             js: "/js/members.js"            },
    tasks:              { html: "/pages/tasks.html",               js: "/js/tasks.js"              },
    "tournament-fees":  { html: "/pages/tournament-fees.html",    js: "/js/tournament-fees.js"    },
    "match-fees":       { html: "/pages/match-fees.html",         js: "/js/match-fees.js"         },
    calendar:           { html: "/pages/calendar.html",            js: "/js/calendar.js"           },
    rules:              { html: "/pages/rules.html",               js: "/js/rules.js"              },
    history:            { html: "/pages/history.html",             js: "/js/history.js"            },
    "cricket-rules":    { html: "/pages/cricket-rules.html",       js: "/js/cricket-rules.js"      },
    "cricket-formats":  { html: "/pages/cricket-formats.html",     js: "/js/cricket-formats.js"    },
    "cricket-positions":{ html: "/pages/cricket-positions.html",   js: "/js/cricket-positions.js"  },
    "cricket-glossary": { html: "/pages/cricket-glossary.html",    js: "/js/cricket-glossary.js"   },
    "dl-calculator":    { html: "/pages/dl-calculator.html",       js: "/js/dl-calculator.js"      },
};

document.getElementById("main-nav").style.display = "";
document.getElementById("navbar-date").textContent = new Date().toLocaleDateString("en-GB", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
});

window.addEventListener("hashchange", router);
router();

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

    if (FINANCE_PAGES.has(hash)) {
        const unlocked = await ensureUnlocked(container);
        if (!unlocked) return;
    }

    try {
        const html = await fetch(page.html + "?t=" + Date.now()).then((r) => r.text());
        container.innerHTML = html;
        if (FINANCE_PAGES.has(hash)) injectFinanceToolbar(container);
        const mod = await import(page.js + "?t=" + Date.now());
        if (mod.init) mod.init();
    } catch (e) {
        container.innerHTML = `<div class="alert alert-danger">Failed to load page: ${e.message}</div>`;
    }
}

function injectFinanceToolbar(container) {
    const bar = document.createElement("div");
    bar.className = "d-flex justify-content-end gap-2 mb-3 no-print";
    bar.innerHTML = `
        <button class="btn btn-sm btn-outline-secondary" id="fp-change-btn">
            <i class="bi bi-key me-1"></i>PIN Settings
        </button>
        <button class="btn btn-sm btn-outline-danger" id="fp-lock-btn">
            <i class="bi bi-lock me-1"></i>Lock Finance
        </button>`;
    container.prepend(bar);

    document.getElementById("fp-lock-btn").addEventListener("click", () => {
        lock();
        location.reload();
    });
    document.getElementById("fp-change-btn").addEventListener("click", () => showPinModal());
}
