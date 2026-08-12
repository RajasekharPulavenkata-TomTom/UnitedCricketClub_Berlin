# UCC Manager — United Cricket Club Management App

A FastAPI web application for managing all aspects of United Cricket Club operations.

## Features

**Members**
- Full roster with jersey number, jersey name, and on-field role
- Ball type preference (Tennis / Leather / Both), DCB ID, CricHeroes and CricClubs registration flags
- Active / inactive status and free-text notes

**Events & Availability**
- Schedule matches, training sessions, and general club events
- Players mark availability per event (available / unavailable / maybe)
- Calendar import via script (`scripts/import_calendar.py`)

**Accounting**
- Track income and expenses across categories (membership fees, match fees, ground rent, equipment, travel, sponsorships, etc.)
- Financial dashboard with live balance, income/expense totals, and recent transactions
- Monthly reports with income vs. expense bar chart and running balance
- Category breakdown reports
- Approval workflow for pending transactions; finance PIN guard for sensitive actions

**Inventory**
- Equipment catalogue (bats, balls, helmets, pads, gloves, stumps, jerseys, bags)
- Track quantity, condition (Good / Fair / Poor), and supplier
- Assign equipment to members and track returns (overdue highlighting)
- Maintenance log per item
- Approval workflow for pending assignments

**Tasks**
- Internal task board for club management to-dos with status tracking

**Audit Log**
- Immutable record of all data changes for accountability and transparency

**Auth**
- JWT-based login with role-based access (admin / finance / standard)
- Finance PIN guard for sensitive financial actions

## Setup

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

API docs: **http://localhost:8000/docs**

## Project Structure

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
├── scripts/              # Utility scripts (calendar import, etc.)
├── static/               # Frontend (promoted to Vercel's CDN at build time)
│   ├── index.html        # App shell
│   ├── pages/            # HTML page fragments
│   ├── js/               # JavaScript modules
│   └── css/              # Club branding styles
└── vercel.json           # Build command, function config, cache headers
```

## Tech Stack

- **Backend**: Python 3.12 · FastAPI · SQLAlchemy · Postgres (Neon)
- **Frontend**: Bootstrap 5 · Chart.js · Vanilla JS (no build step)
- **Auth**: JWT (`python-jose`) · `bcrypt` password hashing
- **Deploy**: Vercel (`iad1`)

## Deployment

```bash
vercel deploy --prod
```

Project `ucc-manager` · live at **https://unitedcricketclub.vercel.app**

`vercel.json` sets the build command to `python vercel_build.py`, which runs schema
migrations and seeding **once per production deployment** — not per request. Preview
deployments skip the schema work and run against the production schema, so a preview can
verify routing and auth but not a schema change.

Environment variables (`DATABASE_URL`, `UCC_SECRET_KEY`, `APP_URL`) are managed with
`vercel env`. `DATABASE_URL` must point at Neon's **pooled** (`-pooler`) host.

See `docs/superpowers/specs/2026-08-11-vercel-migration-design.md` for the full design.

## Backup

All data lives in Neon Postgres. Use Neon's branching/point-in-time restore, or
`pg_dump "$DATABASE_URL"` for a file-based backup.
