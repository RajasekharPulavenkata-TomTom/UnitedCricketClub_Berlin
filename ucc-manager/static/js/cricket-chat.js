const WELCOME = `👋 Hi! I'm **CricBot**, your cricket rules and regulations assistant.

Ask me anything about:
- **MCC Laws of Cricket** (all 42 Laws)
- **ICC Playing Conditions** — Test, ODI, T20I rules
- **DRS**, field restrictions, powerplays, dismissals
- Cricket terminology, formats, and more

What would you like to know?`;

const TYPING_HTML = `<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>`;

let _marked = null;

async function loadMarked() {
    if (_marked) return _marked;
    if (window.marked) { _marked = window.marked; return _marked; }
    await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/marked@9/marked.min.js";
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
    });
    _marked = window.marked;
    return _marked;
}

function appendRow(role) {
    const messagesEl = document.getElementById("chat-messages");
    const row = document.createElement("div");
    row.className = `msg-row${role === "user" ? " msg-row-user" : ""}`;

    const avatar = document.createElement("div");
    avatar.className = `msg-avatar msg-avatar-${role}`;
    avatar.textContent = role === "user" ? "You" : "CB";

    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${role === "bot" ? "bubble-bot" : "bubble-user"}`;

    row.appendChild(avatar);
    row.appendChild(bubble);
    messagesEl.appendChild(row);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return bubble;
}

export async function init() {
    const marked = await loadMarked();
    const messagesEl = document.getElementById("chat-messages");
    const inputEl   = document.getElementById("chat-input");
    const sendBtn   = document.getElementById("chat-send");
    const chipsEl   = document.getElementById("chat-chips");

    const history = [];
    let busy = false;

    // Welcome message
    const welcomeBubble = appendRow("bot");
    welcomeBubble.innerHTML = marked.parse(WELCOME);

    // Suggestion chips
    chipsEl.querySelectorAll(".chip").forEach(chip => {
        chip.addEventListener("click", () => {
            inputEl.value = chip.textContent;
            send();
        });
    });

    async function send() {
        const text = inputEl.value.trim();
        if (!text || busy) return;

        busy = true;
        inputEl.value = "";
        inputEl.disabled = true;
        sendBtn.disabled = true;
        chipsEl.style.display = "none";

        // User bubble
        const userBubble = appendRow("user");
        userBubble.textContent = text;
        history.push({ role: "user", content: text });
        messagesEl.scrollTop = messagesEl.scrollHeight;

        // Bot bubble with typing indicator
        const botBubble = appendRow("bot");
        botBubble.innerHTML = TYPING_HTML;

        const token = localStorage.getItem("ucc_token");
        let reply = "";
        let buffer = "";

        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`,
                },
                body: JSON.stringify({ messages: history.slice(-10) }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                botBubble.innerHTML = `<span class="text-danger"><i class="bi bi-exclamation-circle me-1"></i>${err.detail || "Request failed"}</span>`;
                return;
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                // Consume complete SSE lines
                const lines = buffer.split("\n");
                buffer = lines.pop(); // keep any incomplete trailing line

                for (const line of lines) {
                    if (!line.startsWith("data: ")) continue;
                    const payload = line.slice(6).trim();
                    if (payload === "[DONE]") break;
                    try {
                        const { text } = JSON.parse(payload);
                        reply += text;
                        botBubble.innerHTML = marked.parse(reply);
                        messagesEl.scrollTop = messagesEl.scrollHeight;
                    } catch { /* ignore partial JSON */ }
                }
            }

            if (reply) history.push({ role: "assistant", content: reply });

        } catch (err) {
            botBubble.innerHTML = `<span class="text-danger"><i class="bi bi-exclamation-circle me-1"></i>Network error. Please try again.</span>`;
        } finally {
            busy = false;
            inputEl.disabled = false;
            sendBtn.disabled = false;
            inputEl.focus();
        }
    }

    sendBtn.addEventListener("click", send);
    inputEl.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) send(); });
}
