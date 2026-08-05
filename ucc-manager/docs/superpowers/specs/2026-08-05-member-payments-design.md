# Member Payments / Dues Tracking — Design

**Date:** 2026-08-05
**Status:** Approved (brainstorming complete)

## Problem

The club tracks per-member membership dues in an external spreadsheet (2026 sheet:
21 members with per-fee "Paid" status, membership numbers, ID-card status, DCB IDs,
and SpielerPass status). None of this exists in the app today. The `members` table
holds only identity/contact fields, and club bookkeeping (`transactions`) has no
`member_id`, so no payment can be attributed to a member.

Goal: track, per member and per year, which membership fees are paid, plus a few
static per-member membership attributes — and import the existing 2026 sheet.

## Model validation

The sheet's paid counts reconcile exactly with a plain paid/not-paid model:

```
17 × €20 (Anmeldung) + 12 × €13 (Dezember) + 1 × €45 (Quarterly) + 16 × €156 (Yearly)
= €340 + €156 + €45 + €2,496 = €3,037.00
```

This matches the sheet's "Total Amount Paid to ACB €3,037.00", confirming:
- The boolean paid/not-paid model is faithful (no hidden per-plan logic being dropped).
- Fee amounts are €20 / €13 / €45 / €156.
- The "Total to ACB" figure is a **computed** sum, not stored.

## Design decisions (from brainstorming)

- **Year-aware** tracking (separate per-member-per-year table), not flat columns — so
  each new year starts fresh without losing history.
- **Static ID/status fields** (membership number, ID-card received, SpielerPass) live on
  the `Member` record — they are per-person, not per-year.
- **Paid / not-paid only** per fee — mirror the spreadsheet 1:1, no dates/amounts per fee.
- **Access:** admin edits, all logged-in users can view (matches existing `create_member`
  → `require_admin` pattern).
- **UI:** a new dedicated Payments/Dues grid page with a year selector.
- **2026 import:** yes — as a standalone prod script keyed on DCB ID.

## Data model

### Static fields added to `Member` (`models/member.py`)

| Field | Type | Notes |
|---|---|---|
| `membership_no` | `String(30)` | e.g. `CR1812250162`; nullable |
| `id_card_received` | `Boolean` default `False` | Yes/No column |
| `spielerpass` | `String(30)` | e.g. `All Set`; nullable |

`dcb_id` already exists and is reused as the import join key.

### New table `member_payments` (`models/member_payment.py`)

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `member_id` | FK → `members(id)` ON DELETE CASCADE | |
| `year` | `Integer` | e.g. `2026` |
| `anmeldung` | `Boolean` default `False` | €20 registration |
| `dezember` | `Boolean` default `False` | €13 |
| `quarterly` | `Boolean` default `False` | €45 |
| `yearly` | `Boolean` default `False` | €156 |
| `sepa` | `Boolean` default `False` | direct-debit flag |
| `notes` | `Text` | nullable |
| — | UNIQUE `(member_id, year)` | idempotent upsert key |

Index on `member_id`.

### Fee amounts

Per-year constant dict in the router (no config table — YAGNI):

```python
FEE_AMOUNTS = {
    2026: {"anmeldung": 20, "dezember": 13, "quarterly": 45, "yearly": 156},
}
```

Used only to compute the totals row. Later years can define different amounts; a year
with no entry falls back to the latest defined year (or shows counts without euro totals).

## API — `routers/member_payments.py`

Registered under `/api`, behind the global `get_current_user` auth like other routers.

- `GET /api/member-payments?year=2026`
  - Returns all **active** members left-joined with their `member_payments` row for that
    year. A member with no row is reported with all-false fees (no row auto-created on read).
  - Includes a `totals` block: paid count per fee + computed euro total for the year.
  - Any logged-in user may call.

- `PUT /api/member-payments/{member_id}?year=2026`
  - Body: the five booleans + optional `notes`. Upserts the `(member_id, year)` row.
  - `require_admin`. Writes an audit entry via `routers.audit.log(...)`.

Static member fields (`membership_no`, `id_card_received`, `spielerpass`) are edited
through the **existing** `PUT /api/members/{id}` — added to `MemberUpdate` and `MemberOut`
(and `MemberBase` where appropriate) in `schemas/member.py`.

## UI — `static/pages/member-payments.html` + `static/js/member-payments.js`

Spreadsheet-style grid mirroring the source sheet:

- **Year selector** at top (defaults to current year).
- One row per active member: Name · Membership No · DCB ID ·
  [Anmeldung] [Dezember] [Quarterly] [Yearly] [SEPA] · ID Card · SpielerPass.
- Admins: editable checkboxes with auto-save on toggle (PUT per row). Non-admins:
  read-only ticks.
- **Footer row:** paid counts per fee + computed **Total to ACB** (reproduces €3,037 for 2026).
- Registered as a client route in the `routes` map in `static/js/app.js` (~line 295,
  alongside `members: { html, js }`) and linked from the nav markup in
  `static/index.html` (a `.ucc-nav-link[data-page="member-payments"]` entry near the
  Players link, under the admin section as appropriate). Follows existing page/JS
  conventions (e.g. `members.html`, `club-fees.html`).

## Migration — `main.py:_run_migrations()`

Append idempotent blocks (Postgres, matching existing style):

- Under the existing `if "members" in existing_tables:` column checks, add guards for
  `membership_no`, `id_card_received` (`BOOLEAN NOT NULL DEFAULT FALSE`), `spielerpass`.
- `CREATE TABLE IF NOT EXISTS member_payments (...)` with the UNIQUE `(member_id, year)`
  constraint, plus `CREATE INDEX IF NOT EXISTS ix_member_payments_member_id`.

New installs get the table from `Base.metadata.create_all` via the SQLAlchemy model.

## 2026 data import — standalone script `import_member_payments.py`

Precedent: `import_transactions.py` in the repo root — a one-off script run manually
against prod, **not** wired into the lifespan startup seeds (historical data does not
belong in the every-boot path).

Behaviour:
- **Keys on `dcb_id`** (present for all 21 sheet rows; reliable). Name matching is avoided —
  the DB has a single combined `name`, the sheet splits first/last, and rows like
  "Sanowar Alam (Bubai)" / "Gazi" won't join cleanly.
- Sets the static member fields (`membership_no`, `id_card_received`, `spielerpass`) and
  upserts the `member_payments` row for `year=2026`.
- Treats **blank cells as not-paid**.
- **Idempotent** on `(member_id, year)` and on the member update — safe to re-run.
- **Logs unmatched rows** (DCB ID not found) for manual review; does **not** auto-create
  members or hard-fail.

⚠️ **Verification note:** the import cannot be validated in the local dev session — the
checked-in `ucc.db` has no materialized `members` table and production is Postgres. The
DCB-ID matching is only confirmed when the user runs the script against prod.

## Out of scope (YAGNI)

- Per-fee payment dates or amounts.
- Linking payments to the `transactions` ledger (`member_id` FK on transactions).
- A fee-amount configuration table / admin UI for editing amounts.
- Auto-creating members from unmatched import rows.

## Files touched

**New**
- `models/member_payment.py`
- `routers/member_payments.py`
- `static/pages/member-payments.html`
- `static/js/member-payments.js`
- `import_member_payments.py`

**Modified**
- `models/member.py` — 3 static columns
- `schemas/member.py` — expose the 3 static fields
- `main.py` — migrations (`_run_migrations`) + register the new router
- `static/js/app.js` — add `member-payments` to the `routes` map
- `static/index.html` — add the nav link
