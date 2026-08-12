# United Cricket Club

A management platform for United Cricket Club (UCC) — covering members, events, finance, inventory, and squad operations.

## Repository Structure

```
UnitedCricketClub/
└── ucc-manager/    # Backend API + Frontend web app
```

## ucc-manager

A FastAPI web application that gives club administrators and managers a single place to run club operations.

### Features

| Module | What it does |
|---|---|
| **Members** | Roster management — jersey numbers, roles, ball type preference, DCB ID, CricHeroes / CricClubs registration |
| **Events** | Match, training, and general event scheduling with player availability tracking (available / unavailable / maybe) |
| **Accounting** | Income and expense tracking, live financial dashboard, monthly reports with charts, category breakdowns, approval workflow |
| **Inventory** | Cricket equipment catalogue, quantity and condition tracking, member assignments, maintenance log |
| **Tasks** | Internal task board for club management to-dos |
| **Audit Log** | Immutable record of all data changes for accountability |
| **Auth** | JWT-based login with role-based access (admin / finance / standard) and a finance PIN guard |

### Tech Stack

- **Backend**: Python 3.12 · FastAPI · SQLAlchemy · Postgres (Neon)
- **Frontend**: Bootstrap 5 · Chart.js · Vanilla JS (no build step)
- **Auth**: JWT (`python-jose`) · `bcrypt` password hashing
- **Deploy**: Vercel (`iad1`)

### Quick Start

```bash
cd ucc-manager
python3.12 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
export DATABASE_URL=postgresql://…   # Neon connection string
python vercel_build.py --migrate     # Creates tables and seeds default data
uvicorn main:app --reload --port 8000
```

Open **http://localhost:8000** in your browser.  
Interactive API docs: **http://localhost:8000/docs**

### Project Layout

```
ucc-manager/
├── main.py               # FastAPI app entry point (Vercel's detected entrypoint)
├── vercel_build.py       # Build-time migrations, seeding, service-worker stamping
├── database.py           # SQLAlchemy engine and session
├── seed.py               # Category and default-user seeding
├── models/               # ORM models (member, event, accounting, inventory, …)
├── schemas/              # Pydantic request/response schemas
├── routers/              # Route handlers (one file per feature area)
├── services/             # Business logic (reports, assignments, auth)
├── dependencies/         # Shared FastAPI dependencies (auth guards)
├── static/               # Frontend (promoted to Vercel's CDN at build time)
│   ├── index.html        # App shell
│   ├── pages/            # HTML page fragments
│   ├── js/               # JavaScript modules
│   └── css/              # Club branding styles
└── vercel.json           # Build command, function config, cache headers
```

### Deployment

Deployed on [Vercel](https://vercel.com) as project `ucc-manager`, live at
**https://unitedcricketclub.vercel.app**.

```bash
cd ucc-manager
vercel deploy --prod
```

`vercel.json` sets the build command to `python vercel_build.py`, which runs schema
migrations and seeding **once per production deployment** — not per request. Preview
deployments skip the schema work and run against the production schema, so a preview can
verify routing and auth but not a schema change.

Environment variables (`DATABASE_URL`, `UCC_SECRET_KEY`, `APP_URL`) are managed with
`vercel env`. `DATABASE_URL` must point at Neon's **pooled** (`-pooler`) host.

See `ucc-manager/docs/superpowers/specs/2026-08-11-vercel-migration-design.md` for the
full deployment design.

### Backup

All data lives in Neon Postgres. Use Neon's branching/point-in-time restore, or
`pg_dump "$DATABASE_URL"` for a file-based backup.
