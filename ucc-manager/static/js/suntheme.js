// Time-of-day page ambience. Computes today's real sunrise/sunset locally
// (NOAA solar approximation, ±2 min — plenty for theming) and stamps the
// current phase on <html data-sun-phase>; ucc.css keys the page canvas off it.
// No network calls. QA override: append ?sun=dawn|day|dusk|night|deep-night.

const LAT = 52.513735, LON = 13.235553; // same location weather.js forecasts for
const TWILIGHT_MS = 40 * 60 * 1000;     // dawn/dusk window: sunrise/sunset ±40 min

// ── Light/Dark theme ─────────────────────────────────────────────────────────
// ucc_theme: "light" | "dark" | "auto" (default). Bootstrap 5.3 restyles all
// components off data-bs-theme; ucc.css adds the hand-rolled bits. "auto"
// follows the device and reacts live when it flips.

const _darkMq = matchMedia("(prefers-color-scheme: dark)");

function applyTheme() {
    const mode = localStorage.getItem("ucc_theme") || "auto";
    const dark = mode === "dark" || (mode === "auto" && _darkMq.matches);
    document.documentElement.setAttribute("data-bs-theme", dark ? "dark" : "light");
}

window._setTheme = (mode) => {
    localStorage.setItem("ucc_theme", mode);
    applyTheme();
};

_darkMq.addEventListener("change", applyTheme);
applyTheme();

function sunTimes(date) {
    const rad = Math.PI / 180;
    const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);
    const lngHour = LON / 15;

    const calc = (rising) => {
        const t = dayOfYear + ((rising ? 6 : 18) - lngHour) / 24;
        const M = 0.9856 * t - 3.289;
        let L = M + 1.916 * Math.sin(M * rad) + 0.020 * Math.sin(2 * M * rad) + 282.634;
        L = ((L % 360) + 360) % 360;
        let RA = Math.atan(0.91764 * Math.tan(L * rad)) / rad;
        RA = ((RA % 360) + 360) % 360;
        RA += (Math.floor(L / 90) - Math.floor(RA / 90)) * 90;
        RA /= 15;
        const sinDec = 0.39782 * Math.sin(L * rad);
        const cosDec = Math.cos(Math.asin(sinDec));
        const cosH = (Math.cos(90.833 * rad) - sinDec * Math.sin(LAT * rad)) / (cosDec * Math.cos(LAT * rad));
        if (cosH > 1 || cosH < -1) return null; // sun never rises/sets (not at this latitude)
        let H = rising ? 360 - Math.acos(cosH) / rad : Math.acos(cosH) / rad;
        H /= 15;
        const T = H + RA - 0.06571 * t - 6.622;
        const UT = (((T - lngHour) % 24) + 24) % 24;
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        d.setUTCMinutes(Math.round(UT * 60));
        return d;
    };

    return { sunrise: calc(true), sunset: calc(false) };
}

function currentPhase(now) {
    const { sunrise, sunset } = sunTimes(now);
    if (!sunrise || !sunset) return "day";
    const t = now.getTime();
    if (Math.abs(t - sunrise.getTime()) <= TWILIGHT_MS) return "dawn";
    if (Math.abs(t - sunset.getTime()) <= TWILIGHT_MS) return "dusk";
    if (t > sunrise.getTime() && t < sunset.getTime()) return "day";
    // pre-dawn small hours read differently from the evening
    return now.getHours() < 12 ? "deep-night" : "night";
}

const _override = new URLSearchParams(location.search).get("sun");

function apply() {
    const phase = _override || currentPhase(new Date());
    if (document.documentElement.dataset.sunPhase !== phase) {
        document.documentElement.dataset.sunPhase = phase;
    }
}

apply();
setInterval(apply, 60_000); // attribute write only happens on an actual phase change

// Meteor overlay — four staggered streaks; all styling/animation lives in
// ucc.css, keyed off data-sun-phase for color. pointer-events:none, so it can
// never intercept clicks.
function injectMeteors() {
    const layer = document.createElement("div");
    layer.className = "meteor-layer";
    layer.setAttribute("aria-hidden", "true");
    for (let i = 1; i <= 4; i++) {
        const m = document.createElement("span");
        m.className = `meteor meteor-${i}`;
        layer.appendChild(m);
    }
    document.body.appendChild(layer);
}

// ── Weather ambience ─────────────────────────────────────────────────────────
// Live conditions at the club ground drive <html data-weather="...">; ucc.css
// renders rain/snow particles, a storm flash, or an overcast tint. Attribute
// absent = clear sky (the sun phase owns the canvas). QA override: ?wx=rain.

const WX_REFRESH_MS = 15 * 60 * 1000;

function weatherEffect(code) {
    if (code == null) return null;
    if (code >= 95) return "storm";
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
    if (code === 3 || code === 45 || code === 48) return "overcast";
    if (code === 2) return "clouds"; // partly cloudy: drifting clouds, normal canvas
    return null;
}

const _wxOverride = new URLSearchParams(location.search).get("wx");

async function applyWeather() {
    let effect = _wxOverride;
    if (!effect) {
        try {
            const res = await fetch(
                `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=weather_code`,
                { signal: AbortSignal.timeout(5000) },
            );
            if (!res.ok) return;
            const code = (await res.json()).current?.weather_code;
            effect = weatherEffect(code);
        } catch { return; } // no weather data → no effect, never an error
    }
    if (effect) document.documentElement.dataset.weather = effect;
    else delete document.documentElement.dataset.weather;
}

function injectWeatherLayer() {
    const layer = document.createElement("div");
    layer.className = "weather-layer";
    layer.setAttribute("aria-hidden", "true");
    for (let i = 1; i <= 12; i++) {
        const p = document.createElement("span");
        p.className = `wx-p wx-p-${i}`;
        layer.appendChild(p);
    }
    for (let i = 1; i <= 5; i++) {
        const c = document.createElement("span");
        c.className = `wx-cloud wx-c-${i}`;
        layer.appendChild(c);
    }
    document.body.appendChild(layer);
}

function initOverlays() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    injectMeteors();
    injectWeatherLayer();
}
if (document.body) initOverlays();
else addEventListener("DOMContentLoaded", initOverlays);

applyWeather();
setInterval(applyWeather, WX_REFRESH_MS);

export { sunTimes, currentPhase, weatherEffect }; // exported for testing
