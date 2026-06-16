import { apiFetch } from "/js/api.js";

let questions = [];
let current   = 0;
let score     = 0;

// ── Fielding position coordinates (400x400 viewBox, batsman at bottom) ─────────
// Off side = right (x > 200), Leg side = left (x < 200)
const FIELD_POSITIONS = {
  "wicket-keeper": { cx: 200, cy: 285 },
  "1st-slip":      { cx: 228, cy: 298 },
  "2nd-slip":      { cx: 253, cy: 310 },
  "gully":         { cx: 313, cy: 262 },
  "point":         { cx: 350, cy: 200 },
  "cover":         { cx: 320, cy: 132 },
  "mid-off":       { cx: 248, cy: 113 },
  "long-off":      { cx: 285, cy:  48 },
  "third-man":     { cx: 318, cy: 318 },
  "fine-leg":      { cx:  82, cy: 318 },
  "square-leg":    { cx:  52, cy: 200 },
  "mid-wicket":    { cx:  96, cy: 140 },
  "mid-on":        { cx: 153, cy: 113 },
  "long-on":       { cx: 115, cy:  48 },
  "short-leg":     { cx: 175, cy: 255 },
};

function fieldSVG(targetPos) {
  const pos = FIELD_POSITIONS[targetPos];
  if (!pos) return "";
  const { cx, cy } = pos;

  const greyDots = Object.entries(FIELD_POSITIONS)
    .filter(([key]) => key !== targetPos)
    .map(([, p]) =>
      `<circle cx="${p.cx}" cy="${p.cy}" r="5" fill="rgba(255,255,255,0.35)" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>`
    ).join("");

  return `<svg viewBox="0 0 400 400" style="max-width:100%;width:300px;display:block;margin:0 auto" aria-label="Cricket field diagram">
    <ellipse cx="200" cy="200" rx="185" ry="185" fill="#3d6b47"/>
    <ellipse cx="200" cy="200" rx="185" ry="185" fill="none" stroke="#2d5238" stroke-width="2"/>
    <circle cx="200" cy="200" r="110" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="1" stroke-dasharray="6,4"/>
    <rect x="194" y="148" width="12" height="104" fill="#c8a882" rx="2"/>
    <line x1="192" y1="148" x2="208" y2="148" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="192" y1="252" x2="208" y2="252" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="200" cy="263" r="8" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.4)" stroke-width="1.5"/>
    <text x="200" y="267" text-anchor="middle" fill="rgba(255,255,255,0.65)" font-size="7" font-family="sans-serif" font-weight="bold">BAT</text>
    <text x="375" y="204" text-anchor="middle" fill="rgba(255,255,255,0.35)" font-size="9" font-family="sans-serif">OFF</text>
    <text x="25" y="204" text-anchor="middle" fill="rgba(255,255,255,0.35)" font-size="9" font-family="sans-serif">LEG</text>
    ${greyDots}
    <circle cx="${cx}" cy="${cy}" r="18" fill="none" stroke="#e8603c" stroke-width="2" opacity="0.5"/>
    <circle cx="${cx}" cy="${cy}" r="11" fill="#e8603c" stroke="#fff" stroke-width="2.5"/>
    <text x="${cx}" y="${cy + 4}" text-anchor="middle" fill="#fff" font-size="11" font-family="sans-serif" font-weight="bold">?</text>
  </svg>`;
}

export async function init() {
    document.getElementById("btn-start-quiz").addEventListener("click", onStart);
    document.getElementById("btn-play-again").addEventListener("click", onPlayAgain);
    await preload();
}

async function preload() {
    const loadEl = document.getElementById("quiz-loading");
    const errEl  = document.getElementById("quiz-start-error");
    const btn    = document.getElementById("btn-start-quiz");
    loadEl.style.display = "block";
    btn.disabled = true;
    try {
        questions = await apiFetch("/quiz/questions");
        loadEl.style.display = "none";
        btn.disabled = false;
    } catch (e) {
        loadEl.style.display = "none";
        errEl.textContent = `Failed to load questions: ${e.message}`;
        errEl.classList.remove("d-none");
    }
}

function onStart() {
    if (!questions.length) return;
    current = 0;
    score   = 0;
    document.getElementById("q-total").textContent = questions.length;
    show("quiz-question");
    renderQuestion();
}

async function onPlayAgain() {
    show("quiz-start");
    questions = [];
    document.getElementById("quiz-start-error").classList.add("d-none");
    document.getElementById("btn-start-quiz").disabled = false;
    await preload();
}

function renderQuestion() {
    const q = questions[current];
    document.getElementById("q-num").textContent      = current + 1;
    document.getElementById("q-score").textContent    = score;
    document.getElementById("q-progress").style.width = `${(current / questions.length) * 100}%`;
    document.getElementById("q-text").textContent     = q.question;
    document.getElementById("q-category").textContent = q.category;

    const diffBadge = document.getElementById("q-difficulty-badge");
    diffBadge.textContent = q.difficulty.charAt(0).toUpperCase() + q.difficulty.slice(1);
    diffBadge.className   = `badge rounded-pill px-3 py-1 small fw-semibold diff-${q.difficulty}`;

    // Field diagram
    const fieldEl      = document.getElementById("q-field");
    const fieldLabelEl = document.getElementById("q-field-label");
    fieldLabelEl.classList.add("d-none");
    if (q.type === "field" && q.position && FIELD_POSITIONS[q.position]) {
        fieldEl.innerHTML = fieldSVG(q.position);
        fieldEl.classList.remove("d-none");
    } else {
        fieldEl.innerHTML = "";
        fieldEl.classList.add("d-none");
    }

    const labels = ["A", "B", "C", "D"];
    document.getElementById("q-options").innerHTML = q.options.map((opt, i) => `
        <button class="btn quiz-opt d-flex align-items-start gap-2" data-answer="${escAttr(opt)}">
          <span class="badge bg-secondary mt-1 flex-shrink-0">${labels[i]}</span>
          <span>${escHtml(opt)}</span>
        </button>`).join("");

    document.querySelectorAll(".quiz-opt").forEach(btn =>
        btn.addEventListener("click", () => onAnswer(btn, q))
    );
}

function onAnswer(clicked, q) {
    document.querySelectorAll(".quiz-opt").forEach(b => { b.disabled = true; });

    if (clicked.dataset.answer === q.correct) {
        clicked.classList.add("opt-correct");
        score++;
    } else {
        clicked.classList.add("opt-wrong");
        document.querySelectorAll(".quiz-opt").forEach(b => {
            if (b.dataset.answer === q.correct) b.classList.add("opt-correct");
        });
    }

    // Reveal position name below the field for field questions
    if (q.type === "field") {
        document.getElementById("q-field-pos-name").textContent = q.correct;
        document.getElementById("q-field-label").classList.remove("d-none");
    }

    setTimeout(() => {
        current++;
        if (current >= questions.length) {
            renderResults();
        } else {
            renderQuestion();
        }
    }, 1300);
}

function renderResults() {
    document.getElementById("q-progress").style.width = "100%";
    show("quiz-results");

    const pct = score / questions.length;
    let emoji, label, message;
    if (pct === 1)        { emoji = "🏆"; label = "Perfect score!";        message = "Outstanding! You're a cricket genius."; }
    else if (pct >= 0.7)  { emoji = "🏏"; label = "Excellent!";            message = "Great knowledge of the game!"; }
    else if (pct >= 0.4)  { emoji = "👍"; label = "Good effort!";          message = "Keep watching cricket and you'll nail it."; }
    else                  { emoji = "😅"; label = "Better luck next time!"; message = "Every pro started as a beginner."; }

    document.getElementById("results-emoji").textContent   = emoji;
    document.getElementById("results-score").textContent   = `${score} / ${questions.length}`;
    document.getElementById("results-label").textContent   = label;
    document.getElementById("results-message").textContent = message;
}

function show(id) {
    ["quiz-start", "quiz-question", "quiz-results"].forEach(sid =>
        document.getElementById(sid).classList.toggle("d-none", sid !== id)
    );
}

function escHtml(s) {
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function escAttr(s) {
    return String(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
