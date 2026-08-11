# Migrating UCC Manager from Fly.io to Vercel

**Date:** 2026-08-11
**Status:** Design

## Goal

Move the UCC Manager deployment from Fly.io (`united-cricket-club.fly.dev`) to Vercel,
without migrating data and without a custom domain. The app ships on a `*.vercel.app`
URL; a custom domain can be attached later with no further migration.

## Context

The app is a FastAPI monolith serving a JSON API plus a static single-page frontend.
Today it runs as a Docker container on Fly.io with `min_machines_running = 1`, two
uvicorn workers, and schema migrations executed on every process boot.

The database is **Neon Postgres** and is already external to Fly. It stays exactly where
it is — there is no data migration in this project.

The app was shaped for a persistent always-on box. Three of its assumptions break on a
serverless platform, and correcting them is the substance of this migration:

1. Migrations and seeding run at process startup.
2. The SQLAlchemy pool is sized for a fixed worker count.
3. The service-worker cache key is derived from process boot time.

## Non-goals

- No data migration (Neon is unchanged).
- No custom domain (deferred; the user does not own one).
- No refactoring beyond what the platform move requires.
- No changes to application features, other than removing CricBot (see below).

## Design

### 1. Entrypoint and project layout

Vercel's FastAPI framework preset auto-detects a top-level `app` in `main.py`. No
`api/index.py` wrapper or ASGI shim is needed — `main.py` already satisfies the
convention.

This repository is a monorepo: the git root is `UnitedCricketClub/` and the application
lives in `ucc-manager/`. The Vercel project's **Root Directory must be set to
`ucc-manager`**. Vercel sets the function's working directory to the project base, so
existing relative paths (`open("static/sw.js")`, `StaticFiles(directory="static")`)
continue to resolve.

Python version is pinned to **3.12** via a `.python-version` file, matching CI
(`.github/workflows/ci.yml`). The Dockerfile's 3.13 is not carried over.

### 2. Database connection

`DATABASE_URL` is repointed to Neon's **pooled** endpoint (the `-pooler` host). Serverless
creates many short-lived instances; the direct endpoint would exhaust Neon's connection
limit.

`database.py` currently sizes its pool as "5 per worker × 2 workers":

```python
pool_size=10,
max_overflow=20,
```

This is per-process and multiplies across concurrent Vercel instances. It becomes:

```python
pool_size=2,
max_overflow=3,
pool_pre_ping=True,   # unchanged
pool_recycle=300,     # unchanged
```

The comment referencing Fly.io's network is updated to reference Neon's pooler.

`database.py` raises `RuntimeError` at import time when `DATABASE_URL` is unset. It must
therefore be present in **every** Vercel environment (Production, Preview, Development),
not only Production.

### 3. Migrations move from startup to build time

Today `lifespan` in `main.py` runs, on every boot:

- `_run_migrations()` — a long sequence of `ALTER TABLE` / `CREATE TABLE` statements
- `Base.metadata.create_all(bind=engine)`
- `_seed_sponsors()`
- `_seed_founding_events()`

and `start.sh` separately runs `seed.py` before starting uvicorn.

On Vercel this would execute on every cold start, concurrently across instances — slow
first requests and a repeated DDL storm against Neon. The existing
`pg_advisory_xact_lock` guard was written for a 2-worker race and does not generalise to
an unbounded number of serverless instances.

**New:** `scripts/vercel_build.py` performs, once per deployment, in this order:

1. Service-worker version stamping (see §5) — always, including preview builds
2. seeding of categories and default users, via `import seed`
3. `_run_migrations()`
4. `Base.metadata.create_all(bind=engine)`
5. `_seed_sponsors()` and `_seed_founding_events()`

**Order 2-before-3 is load-bearing.** `seed` creates the tables; `_run_migrations` opens
with `UPDATE users ...` statements that run unconditionally and fail against a database
with no tables. On Fly this ordering was implicit — `start.sh` ran `seed.py` before uvicorn
started and the lifespan migrations fired. Making it explicit preserves the exact
production semantics.

`_run_migrations`, `_seed_sponsors`, and `_seed_founding_events` are **moved** out of
`main.py` into `scripts/vercel_build.py`, so the request-serving module no longer carries
DDL. Step 3 is performed by importing `seed`, whose module-level code already does this
work idempotently; the import happens inside the production guard so it never executes on
a preview build.

It is wired as `buildCommand` in `vercel.json`, which takes precedence over any
`pyproject.toml` build script.

Steps 1–4 are guarded by `VERCEL_ENV == "production"`. Preview deployments share the same
Neon database, and preview builds must not mutate the production schema. Step 5 runs
unconditionally, because every deployment needs a correct service-worker version.

The `lifespan` handler is removed and `main.py` becomes `app = FastAPI(title="UCC Manager")`.

Consequence to accept: schema changes now require a deployment, and a production deploy is
the only thing that migrates. This is the correct trade — it makes migrations an explicit,
once-per-release event instead of an implicit per-boot one.

Second consequence, stated plainly because it shapes what preview deployments are good
for: **previews never migrate.** A preview runs against whatever schema the last production
build left behind. Previews therefore verify routing, static assets, service-worker
versioning, and authentication — but they cannot verify a schema change. A migration-bearing
change is verified in production, immediately after promotion. Giving previews their own
Neon branch would remove this limitation and is deliberately out of scope here.

Audit performed while writing this design: nothing in the codebase imports `seed`
(`start.sh` invokes it as a script), and `_run_migrations`, `_seed_sponsors`, and
`_seed_founding_events` are called only from `lifespan`. Moving all four is therefore a
clean cut with no hidden call sites that would keep DDL running per cold start.

### 4. Static assets served from the CDN

Vercel's FastAPI preset promotes directories mounted via `app.mount(..., StaticFiles(...))`
to the CDN at build time. The existing line stays unchanged:

```python
app.mount("/", StaticFiles(directory="static", html=True), name="static")
```

`static/` is 1.7 MB and remains in the function bundle as well, so the `/sw.js` route can
still read `static/sw.js` from disk and the mount works under `vercel dev`.

Because CDN-served assets bypass the ASGI app, the static branch of the `cache_control`
middleware in `main.py` no longer runs for them. Those rules move to `vercel.json`
`headers`. The `/api/*` `no-store` branch stays in middleware, since API responses always
come from the function.

**Risk:** mounting at `/` with `html=True` is a broader promotion than the documented
examples (which mount at a subpath). Whether `/` resolves to `index.html` and whether
`/pages/*.html` resolve correctly must be verified on a preview deployment before
promoting to production.

**Rollback if it misbehaves:** add `[tool.vercel.fastapi.static] cdn = false` to
`pyproject.toml`. This disables CDN promotion and routes every asset through the function —
equivalent to today's Fly behaviour, at the cost of a function invocation per asset.

### 5. Service-worker cache versioning (bug fix)

`main.py:12` computes:

```python
_BOOT_VERSION = f"ucc-{int(time.time())}"
```

and the `/sw.js` route substitutes it into `static/sw.js`'s `__CACHE_VERSION__` placeholder.

Two defects surface on Vercel:

- The value is per-process. Each cold-start instance produces a different cache key, so a
  client can receive a different service-worker version on successive requests and thrash
  its caches.
- Once `static/sw.js` is CDN-promoted, the CDN may serve the raw file and the dynamic route
  never runs — clients would receive the literal string `__CACHE_VERSION__`, which never
  changes, pinning them to a stale cache indefinitely.

**Fix:** `scripts/vercel_build.py` rewrites `static/sw.js` in place during the build,
substituting `__CACHE_VERSION__` with `ucc-${VERCEL_GIT_COMMIT_SHA}`. This is stable within
a deployment and changes on every deployment. The rewrite happens in the build container
only and is never committed.

The dynamic `/sw.js` route in `main.py` is kept as a local-development fallback, with
`_BOOT_VERSION` retained for that purpose only.

This is safe in production **even if the function — not the CDN — ends up serving `/sw.js`**,
and the reason must not be lost: the build step has already rewritten the on-disk
`static/sw.js`, and the function bundle includes `static/`, so the route's
`.replace("__CACHE_VERSION__", _BOOT_VERSION)` finds no placeholder and is a no-op. The
per-instance `_BOOT_VERSION` can therefore never reach a production client. Do not
"simplify" this route into the authoritative source of the version — that reintroduces the
cache-thrash bug.

`/sw.js` gets `Cache-Control: no-store` via `vercel.json` headers, preserving today's
behaviour so browsers always re-check for an updated worker.

### 6. Remove CricBot

`GEMINI_API_KEY` is no longer required. CricBot is already orphaned — it is absent from the
`PAGES` route table in `static/js/app.js` and nothing links to `cricket-chat.html`. Removal
has no user-facing effect and drops roughly 160 MB (`googleapiclient` + `grpc`) from the
bundle.

Delete:

- `routers/chatbot.py`
- `static/js/cricket-chat.js`
- `static/pages/cricket-chat.html`
- the `chatbot` import and `app.include_router(chatbot.router, ...)` line in `main.py`
- `google-generativeai>=0.8.0` from `requirements.txt`

### 7. Configuration files

**`vercel.json`** (new):

- `buildCommand` → `python scripts/vercel_build.py`
- `functions."main.py".maxDuration` → an explicit value rather than relying on the default
- `functions."main.py".excludeFiles` → `{tests/**,docs/**,.venv/**,**/*.db,.pytest_cache/**,.idea/**,test_*.py}`
- `headers` → long-lived immutable caching for `.js`/`.css`/`.png`/`.jpg`/`.webp`/`.ico`/`.woff2`/`.svg`/`.gif`;
  `no-cache` for `.html` and `/`; `no-store` for `/sw.js`

**`.python-version`** (new): `3.12`

**`.vercelignore`** (new): `.venv/`, `*.db`, `.pytest_cache/`, `.idea/`, `__pycache__/`

`static/` is deliberately **not** ignored — it must be uploaded for CDN promotion.

Bundle size after removing `google-generativeai` is well under the 500 MB limit.

### 8. Environment variables

Set in the Vercel project for Production, Preview, and Development:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon **pooled** connection string |
| `UCC_SECRET_KEY` | **newly generated** strong secret |
| `APP_URL` | the new `https://<project>.vercel.app` URL |
| `UCC_TOKEN_EXPIRE_MINUTES` | optional; defaults to `480` |

`GEMINI_API_KEY` and `UCC_NOTIFICATION` are **not** carried over.

Dropping `UCC_NOTIFICATION` disables outbound email. This degrades cleanly rather than
failing: `_send()` in `services/notification_service.py` returns early when the key is
empty, so every notification call site becomes a no-op. `sendgrid` stays in
`requirements.txt` because `_do_send` imports it lazily and the feature can be re-enabled
by setting the variable alone.

When email is re-enabled, note that `_send` dispatches via a daemon `threading.Thread`.
That pattern assumes a long-lived process: on Vercel the instance can be frozen or
reclaimed once the response is sent, so a send may be cut off mid-flight. It should be
converted to a synchronous send or a background-task primitive at that point. This is out
of scope while email is off.

Two notes:

- **`UCC_SECRET_KEY` is not currently set on Fly.** Production is signing JWTs with the
  hardcoded fallback `"ucc-dev-secret-change-in-production"` (`services/auth_service.py:9`).
  Setting a real secret on Vercel invalidates all existing sessions — every user logs in
  again once. This is a security fix worth taking during the move.
- **`APP_URL` must be updated** to the Vercel URL. It is only used to build links in
  notification emails, so a stale value fails silently — emails would keep pointing at a
  dead Fly host.

### 9. Files retired at cutover

`fly.toml`, `Dockerfile`, `start.sh`, and `.dockerignore` are **kept** through the
migration and deleted in a separate follow-up commit only after production traffic is
confirmed healthy on Vercel. `seed.py` is retained — CI and local development still use it —
but is no longer invoked at container start.

## Cutover plan

1. Deploy a preview to Vercel and verify (see below).
2. Promote to Production.
3. Set `APP_URL` to the production Vercel URL and redeploy.
4. Leave the Fly app running as a fallback for one week. Both hit the same Neon database,
   so either can serve traffic.
5. After the week: delete `fly.toml`, `Dockerfile`, `start.sh`, `.dockerignore` in a
   separate commit, and run `fly apps destroy united-cricket-club`.

Users must be told the new URL. The old `united-cricket-club.fly.dev` bookmark and any
installed PWA stop working at step 5.

## Verification

Verified on the preview deployment before promoting:

- `/health` returns `{"status": "ok"}`.
- Login succeeds and an authenticated API call returns data from Neon.
- `/` serves `index.html`; hash routes load `/pages/*.html` and `/js/*.js` correctly.
- CSS, fonts, and images load; response headers show CDN cache headers from `vercel.json`.
- Cache-busting query strings still resolve — assets are referenced as `/css/ucc.css?v=7`
  and `/js/app.js?v=7`, so CDN-served assets must not 404 or serve stale content when a
  query string is attached.
- API responses are not double-compressed now that `GZipMiddleware` runs in-function while
  the edge also compresses.
- `/sw.js` returns a body containing a real commit SHA — **not** the literal
  `__CACHE_VERSION__` — with `Cache-Control: no-store`.
- The build log shows migrations running exactly once, and Neon shows no connection
  exhaustion under normal use.
- Cold-start latency on the first request after idle is measured and recorded. The app
  moves from always-warm (`min_machines_running = 1`) to cold starts; this is expected to
  be acceptable for a club-sized user base but should be a known number.
- The existing CI suite (`pytest tests/api/` and `tests/e2e/`) passes unchanged. Removing
  the `lifespan` handler must not break `tests/conftest.py`, which already creates tables
  directly and runs without lifespan.

## Outcomes observed during the actual migration

Recorded because they contradict or sharpen assumptions above.

- **CDN promotion does intercept `/sw.js`.** Confirmed in production: the response carries
  `x-vercel-cache: HIT` and an `etag`, so the FastAPI route never runs. Build-time stamping
  is therefore not belt-and-braces — it is the only thing producing a correct cache key in
  production.
- **`headers` rules are last-match-wins.** With the `/sw.js` rule listed *first*, the
  response still came back `public, max-age=31536000, immutable`. Moving the rule to the
  **end** of the `headers` array made `no-store` apply. Any future narrow rule must be
  placed after the broader rules it needs to override.
- **A pre-existing bug surfaced in `cache_control`.** `/sw.js` ends in `.js`, so the
  middleware's asset branch overwrote the `no-store` the route itself sets. This was wrong
  on Fly too. Fixed by testing `path == "/sw.js"` in the first branch.
- **`_apply_schema` ordering** had to be corrected — see §3. Caught by running the build
  script against an empty local database before deploying.
- **The first `vercel deploy` targets production**, not preview, when a project has no
  deployments yet and no Git connection. Subsequent bare `vercel deploy` calls produce
  previews. The production-guarded migration therefore ran on the very first deploy.
- **Preview URLs sit behind deployment protection** and return `302` to anonymous requests,
  so previews cannot be verified with unauthenticated `curl`.

## Open risks

| Risk | Mitigation |
|---|---|
| CDN promotion of a `/`-mounted `StaticFiles(html=True)` misroutes pages | Verify on preview; fall back to `[tool.vercel.fastapi.static] cdn = false` |
| Cold starts noticeably slow the first request after idle | Measure on preview; Fluid Compute reuses warm instances |
| Preview builds unintentionally migrate the production schema | Guarded by `VERCEL_ENV == "production"` |
| Neon connection limits under concurrent instances | Pooled endpoint plus reduced SQLAlchemy pool size |
