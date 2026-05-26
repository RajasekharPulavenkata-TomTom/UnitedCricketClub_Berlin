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

- **Backend**: Python 3.13 · FastAPI · SQLAlchemy · SQLite
- **Frontend**: Bootstrap 5 · Chart.js · Vanilla JS (no build step)
- **Auth**: JWT (`python-jose`) · `bcrypt` password hashing
- **Deploy**: Docker · Fly.io (`ams` region)

### Quick Start

```bash
cd ucc-manager
python3.13 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python seed.py                   # Creates ucc.db and seeds default data
uvicorn main:app --reload --port 8000
```

Open **http://localhost:8000** in your browser.  
Interactive API docs: **http://localhost:8000/docs**

### Project Layout

```
ucc-manager/
├── main.py               # FastAPI app entry point + startup migrations
├── database.py           # SQLAlchemy engine and session
├── seed.py               # One-time database seed
├── models/               # ORM models (member, event, accounting, inventory, …)
├── schemas/              # Pydantic request/response schemas
├── routers/              # Route handlers (one file per feature area)
├── services/             # Business logic (reports, assignments, auth)
├── dependencies/         # Shared FastAPI dependencies (auth guards)
├── static/               # Frontend
│   ├── index.html        # App shell
│   ├── pages/            # HTML page fragments
│   ├── js/               # JavaScript modules
│   └── css/              # Club branding styles
├── Dockerfile
└── fly.toml              # Fly.io deployment config
```

### Deployment

The app is deployed on [Fly.io](https://fly.io) under the app name `united-cricket-club` in the `ams` (Amsterdam) region.

```bash
fly deploy
```

### Backup

All data lives in `ucc.db`. Copy that file to create a full backup.
