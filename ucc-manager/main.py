import time
from pathlib import Path
from fastapi import FastAPI, Depends, Request
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.gzip import GZipMiddleware
from dependencies.auth import get_current_user

_STATIC_DIR = Path(__file__).resolve().parent / "static"

# Local-development fallback only. On Vercel, vercel_build.py stamps the real
# deploy version into static/sw.js at build time, so the substitution in /sw.js
# below finds no placeholder and is a no-op. Never make this the authoritative
# source of the version — it is per-process, and clients would thrash caches.
_BOOT_VERSION = f"ucc-{int(time.time())}"
from routers import accounting, inventory, members, member_payments, events, audit, player_availability, tasks, reporting, auth, approvals, polls, pain_points, violations, field_formations, scoreboard, sponsors, external_tournament, internal_tournament, page_views, tournament_feedback, elections, feedback, meetings, quiz


app = FastAPI(title="UCC Manager")
app.add_middleware(GZipMiddleware, minimum_size=500)

@app.middleware("http")
async def cache_control(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path.startswith("/api/") or path == "/sw.js":
        # /sw.js must stay no-store: it ends in .js, so without this guard the
        # branch below would clobber the no-store the route itself sets.
        response.headers["Cache-Control"] = "no-store"
    elif path.endswith((".js", ".css", ".png", ".jpg", ".webp", ".ico", ".woff2", ".svg", ".gif")):
        # versioned via ?v= query param — safe to cache for a long time
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    elif path.endswith(".html") or path == "/":
        response.headers["Cache-Control"] = "no-cache"
    return response

_auth = [Depends(get_current_user)]

app.include_router(auth.router)
app.include_router(approvals.router)
app.include_router(accounting.router,          dependencies=_auth)
app.include_router(inventory.router,           dependencies=_auth)
app.include_router(members.router,             dependencies=_auth)
app.include_router(member_payments.router,     dependencies=_auth)
app.include_router(events.router,              dependencies=_auth)
app.include_router(audit.router,               dependencies=_auth)
app.include_router(player_availability.router, dependencies=_auth)
app.include_router(tasks.router,               dependencies=_auth)
app.include_router(reporting.router,           dependencies=_auth)
app.include_router(polls.router,               dependencies=_auth)
app.include_router(pain_points.router,         dependencies=_auth)
app.include_router(violations.router,          dependencies=_auth)
app.include_router(field_formations.router,    dependencies=_auth)
app.include_router(scoreboard.router,          dependencies=_auth)
app.include_router(sponsors.router,            dependencies=_auth)
app.include_router(external_tournament.router, dependencies=_auth)
app.include_router(internal_tournament.router, dependencies=_auth)
app.include_router(page_views.router,          dependencies=_auth)
app.include_router(tournament_feedback.router, dependencies=_auth)
app.include_router(elections.router,          dependencies=_auth)
app.include_router(feedback.router,           dependencies=_auth)
app.include_router(meetings.router,           dependencies=_auth)
app.include_router(quiz.router,               dependencies=_auth)


@app.get("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}


@app.get("/sw.js", include_in_schema=False)
async def service_worker():
    """Serve the Service Worker with the current deploy version baked in.
    The no-store header ensures the browser always checks for an updated SW."""
    with open(_STATIC_DIR / "sw.js") as f:
        body = f.read().replace("__CACHE_VERSION__", _BOOT_VERSION)
    return Response(body, media_type="application/javascript",
                    headers={"Cache-Control": "no-store"})


app.mount("/", StaticFiles(directory=_STATIC_DIR, html=True), name="static")
