// Standard Edition D/L parameters (published values)
const Z0 = [100, 93.4, 85.1, 74.9, 62.7, 49.0, 34.9, 22.0, 11.9, 4.7];
const b  = [0.0450, 0.0478, 0.0516, 0.0572, 0.0651, 0.0746, 0.0875, 0.1032, 0.1284, 0.1831];

// Average score parameter (G50) used when Team 2 has more resources
const G50 = { 20: 135, 40: 200, 50: 245 };

function resources(oversRemaining, wicketsLost) {
    const w = Math.min(Math.max(Math.round(wicketsLost), 0), 9);
    const u = Math.max(oversRemaining, 0);
    if (u === 0) return 0;
    return Z0[w] * (1 - Math.exp(-b[w] * u));
}

export function init() {}

window.dlFormatChange = function () {
    const val = document.getElementById("dl-format").value;
    document.getElementById("dl-custom-overs-wrap").style.display = val === "custom" ? "" : "none";
    const t1 = document.getElementById("dl-t1-overs");
    if (val !== "custom") t1.placeholder = `e.g. ${val}`;
};

window.dlCalculate = function () {
    const formatVal = document.getElementById("dl-format").value;
    const N = formatVal === "custom"
        ? parseFloat(document.getElementById("dl-overs-per-side").value)
        : parseFloat(formatVal);

    const s1        = parseFloat(document.getElementById("dl-t1-score").value);
    const t1Overs   = parseFloat(document.getElementById("dl-t1-overs").value) || N;
    const bowled    = parseFloat(document.getElementById("dl-t2-overs-bowled").value) || 0;
    const wickets   = parseFloat(document.getElementById("dl-t2-wickets").value) || 0;
    const available = parseFloat(document.getElementById("dl-t2-overs-available").value);

    if (isNaN(s1) || isNaN(available) || isNaN(N)) {
        alert("Please fill in all required fields.");
        return;
    }

    // Resources
    const r1 = resources(t1Overs, 0);                        // Team 1 had full innings
    const remainingAtRain = N - bowled;                       // overs remaining when rain started
    const remainingAfterRain = available - bowled;            // overs remaining after rain
    const resourcesLost = resources(remainingAtRain, wickets) - resources(Math.max(remainingAfterRain, 0), wickets);
    const r2 = r1 - resourcesLost;

    // Revised target
    const g50 = G50[formatVal] || Math.round(245 * N / 50);
    let target, targetLabel;
    if (r2 <= r1) {
        target = Math.floor(s1 * r2 / r1) + 1;
        targetLabel = `Team 2 needs ${target} to win in ${available} overs`;
    } else {
        target = Math.round(s1 + g50 * (r2 - r1) / 100) + 1;
        targetLabel = `Team 2 needs ${target} to win — bonus applied (more resources)`;
    }

    // Par score progression table
    const par = buildParTable(s1, r1, r2, bowled, available, wickets, N);

    // Render
    const targetCard = document.getElementById("dl-target-card");
    targetCard.style.background = r2 <= r1
        ? "linear-gradient(135deg,#1a3a8b,#1e4db7)"
        : "linear-gradient(135deg,#c44e2c,#e8603c)";

    document.getElementById("dl-target-runs").textContent = target;
    document.getElementById("dl-target-runs").className = "display-4 fw-bold text-white";
    document.getElementById("dl-target-sub").textContent = targetLabel;
    document.getElementById("dl-target-sub").className = "small mt-1 text-white-50";

    document.getElementById("dl-r1").textContent = r1.toFixed(1) + "%";
    document.getElementById("dl-r1-bar").style.width = r1 + "%";
    document.getElementById("dl-r2").textContent = r2.toFixed(1) + "%";
    document.getElementById("dl-r2").className = "fs-3 fw-bold " + (r2 <= r1 ? "text-warning" : "text-success");
    document.getElementById("dl-r2-bar").style.width = Math.min(r2, 100) + "%";
    document.getElementById("dl-r2-bar").className = "progress-bar " + (r2 <= r1 ? "bg-warning" : "bg-success");

    const lost = (r1 - r2).toFixed(1);
    document.getElementById("dl-resource-note").textContent =
        r2 <= r1
        ? `${lost}% of resources were lost due to the interruption.`
        : `Team 2 gained ${(r2 - r1).toFixed(1)}% extra resources — target adjusted upward.`;

    document.getElementById("dl-par-tbody").innerHTML = par;
    document.getElementById("dl-result").style.display = "";
    document.getElementById("dl-empty").style.display = "none";
};

function buildParTable(s1, r1, r2, bowled, available, wicketsAtRain, N) {
    const rows = [];
    for (let over = 1; over <= Math.floor(available); over++) {
        const oversBowled = bowled + over;
        const rows3 = [0, 2, 5].map(w => {
            if (w > 0 && w >= wicketsAtRain + 1 && oversBowled <= bowled) return "—";
            const rem = available - over;
            const r2par = r2 - (resources(rem, w));
            const resourcesUsed = r1 - r2 + r2par;
            const par = Math.round(s1 * resourcesUsed / r1);
            return par >= 0 ? par : "—";
        });
        const isNow = over === Math.floor(available);
        rows.push(`
          <tr ${isNow ? 'class="table-primary fw-semibold"' : ""}>
            <td>${oversBowled <= N ? oversBowled : available}</td>
            <td class="text-end">${rows3[0]}</td>
            <td class="text-end">${rows3[1]}</td>
            <td class="text-end">${rows3[2]}</td>
          </tr>`);
    }
    return rows.join("");
}
