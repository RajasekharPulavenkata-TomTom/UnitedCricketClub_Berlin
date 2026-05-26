const LAT = 52.513735, LON = 13.235553;

export function wmoInfo(code) {
    if (code === 0)   return { label: "Clear sky",     icon: "bi-sun",                  color: "#f6c90e" };
    if (code <= 2)    return { label: "Partly cloudy", icon: "bi-cloud-sun",             color: "#aaa" };
    if (code === 3)   return { label: "Overcast",      icon: "bi-clouds",               color: "#aaa" };
    if (code <= 48)   return { label: "Foggy",         icon: "bi-cloud-fog2",           color: "#aaa" };
    if (code <= 55)   return { label: "Drizzle",       icon: "bi-cloud-drizzle",        color: "#5bc0de" };
    if (code <= 65)   return { label: "Rain",          icon: "bi-cloud-rain",           color: "#5bc0de" };
    if (code <= 75)   return { label: "Snow",          icon: "bi-cloud-snow",           color: "#b0c4de" };
    if (code <= 82)   return { label: "Showers",       icon: "bi-cloud-rain-heavy",     color: "#5bc0de" };
    if (code <= 86)   return { label: "Snow showers",  icon: "bi-cloud-snow",           color: "#b0c4de" };
    return                   { label: "Thunderstorm",  icon: "bi-cloud-lightning-rain", color: "#f0ad4e" };
}

export async function fetchWeatherRange(startDate, endDate) {
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
            `&daily=temperature_2m_max,temperature_2m_min,weathercode` +
            `&timezone=Europe%2FBerlin&start_date=${startDate}&end_date=${endDate}`;
        const res = await fetch(url);
        const d = await res.json();
        if (!d.daily?.time?.length) return {};
        const result = {};
        d.daily.time.forEach((date, i) => {
            result[date] = {
                code: d.daily.weathercode[i],
                maxT: Math.round(d.daily.temperature_2m_max[i]),
                minT: Math.round(d.daily.temperature_2m_min[i]),
            };
        });
        return result;
    } catch { return {}; }
}

export async function fetchWeather(date) {
    const diffDays = Math.round((new Date(date + "T12:00:00") - new Date()) / 86400000);
    if (diffDays < 0 || diffDays > 16) return null;
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
            `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode` +
            `&timezone=Europe%2FBerlin&start_date=${date}&end_date=${date}`;
        const res = await fetch(url);
        const d = await res.json();
        if (!d.daily?.weathercode?.length) return null;
        return {
            code:   d.daily.weathercode[0],
            maxT:   Math.round(d.daily.temperature_2m_max[0]),
            minT:   Math.round(d.daily.temperature_2m_min[0]),
            precip: d.daily.precipitation_sum[0],
        };
    } catch { return null; }
}

export function swingInfo(w) {
    let score = 0;
    const reasons = [];

    // Cloud cover is the dominant swing factor
    if (w.code === 3) {
        score += 3; reasons.push("overcast");
    } else if (w.code >= 1 && w.code <= 2) {
        score += 2; reasons.push("partly cloudy");
    } else if (w.code >= 45 && w.code <= 48) {
        score += 2; reasons.push("humid");
    } else if ((w.code >= 51 && w.code <= 67) || (w.code >= 80 && w.code <= 82)) {
        score += 2; reasons.push("damp conditions");
    }

    // Cool, dense air carries the ball more
    const avgT = (w.maxT + w.minT) / 2;
    if (avgT < 15)      { score += 2; reasons.push("cool air"); }
    else if (avgT <= 20){ score += 1; reasons.push("mild air"); }

    // Light moisture on the surface helps; heavy rain makes it uncontrollable
    if (w.precip > 0 && w.precip <= 3) { score += 1; reasons.push("damp outfield"); }
    else if (w.precip > 3)             { score -= 1; }

    if (score >= 5) return { level: "High",     badgeClass: "bg-success",          reason: reasons.join(" · ") };
    if (score >= 3) return { level: "Moderate", badgeClass: "bg-warning text-dark", reason: reasons.join(" · ") };
    return                 { level: "Low",      badgeClass: "bg-secondary",         reason: reasons.join(" · ") || "clear & warm" };
}

export function weatherHtml(w) {
    if (!w) return "";
    const { label, icon, color } = wmoInfo(w.code);
    const swing = swingInfo(w);
    return `
    <div class="d-flex align-items-center gap-3 p-2 rounded mb-3" style="background:#f8f9fa;border:1px solid #e9ecef">
      <i class="bi ${icon} fs-2" style="color:${color}"></i>
      <div class="flex-grow-1">
        <div class="fw-semibold">${label}</div>
        <div class="small text-muted">
          ${w.maxT}°C / ${w.minT}°C
          ${w.precip > 0 ? `&nbsp;·&nbsp;<i class="bi bi-droplet-fill text-primary"></i> ${w.precip} mm` : ""}
        </div>
      </div>
      <div class="text-end">
        <div class="small text-muted mb-1"><i class="bi bi-wind me-1"></i>Swing</div>
        <span class="badge ${swing.badgeClass}">${swing.level}</span>
        <div class="text-muted mt-1" style="font-size:.7rem">${swing.reason}</div>
      </div>
    </div>`;
}
