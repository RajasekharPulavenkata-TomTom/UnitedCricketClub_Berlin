# UCC Manager — United Cricket Club Accounting & Inventory

A web application for managing club finances and cricket equipment.

## Features

**Accounting**
- Track income and expenses with categories (membership fees, match fees, ground rent, equipment purchases, travel, sponsorships, etc.)
- Financial dashboard with live balance, income/expense totals, and recent transactions
- Monthly reports with income vs. expense bar chart and running balance
- Category breakdown reports

**Inventory**
- Equipment catalogue (bats, balls, helmets, pads, gloves, stumps, jerseys, bags)
- Track quantity, condition (Good / Fair / Poor), purchase info, and supplier
- Assign equipment to members and track returns (overdue highlighting)
- Maintenance log per item

## Setup

```bash
cd ucc-manager
python3.13 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python seed.py                   # Creates ucc.db and seeds default categories
uvicorn main:app --reload --port 8000
```

Open **http://localhost:8000** in your browser.

API docs are available at **http://localhost:8000/docs**.

## Project Structure

```
ucc-manager/
├── main.py               # FastAPI app entry point
├── database.py           # SQLAlchemy engine + session
├── seed.py               # Seeds default categories (run once)
├── models/               # SQLAlchemy ORM models
├── schemas/              # Pydantic request/response schemas
├── routers/              # API route handlers
├── services/             # Business logic (reports, assignments)
└── static/               # Frontend (Bootstrap 5, vanilla JS)
    ├── index.html        # App shell
    ├── pages/            # HTML page fragments
    ├── js/               # JavaScript modules
    └── css/              # Club branding styles
```

## Tech Stack

- **Backend**: FastAPI + SQLAlchemy + SQLite
- **Frontend**: Bootstrap 5 + Chart.js + Vanilla JS (no build step)
- **Database**: SQLite (file: `ucc.db`)

## Backup

The entire database is in `ucc.db`. Copy that file to back up all data.
