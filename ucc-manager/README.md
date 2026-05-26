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
python3.13 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python seed.py                   # Creates ucc.db and seeds default data
uvicorn main:app --reload --port 8000
```

Open **http://localhost:8000** in your browser.

API docs: **http://localhost:8000/docs**

## Project Structure

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
├── scripts/              # Utility scripts (calendar import, etc.)
├── static/               # Frontend
│   ├── index.html        # App shell
│   ├── pages/            # HTML page fragments
│   ├── js/               # JavaScript modules
│   └── css/              # Club branding styles
├── Dockerfile
└── fly.toml              # Fly.io deployment config
```

## Tech Stack

- **Backend**: Python 3.13 · FastAPI · SQLAlchemy · SQLite
- **Frontend**: Bootstrap 5 · Chart.js · Vanilla JS (no build step)
- **Auth**: JWT (`python-jose`) · `bcrypt` password hashing
- **Deploy**: Docker · Fly.io (`ams` region)

## Deployment

```bash
fly deploy
```

App name: `united-cricket-club` · Region: `ams` (Amsterdam)

## Backup

The entire database is in `ucc.db`. Copy that file to back up all data.
