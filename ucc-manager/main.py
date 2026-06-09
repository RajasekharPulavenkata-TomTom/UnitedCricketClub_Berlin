from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy import text, inspect
from database import engine, Base
import models  # registers all models before create_all
from dependencies.auth import get_current_user
from routers import accounting, inventory, members, events, audit, finance_pin, player_availability, tasks, tournament, match_fees, reporting, auth, approvals, polls, pain_points, violations, field_formations, ai_field, scoreboard, sponsors


def _run_migrations():
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    # Pre-fetch all columns in one pass — avoids repeated round-trips during migration checks
    _cols = {t: {c["name"] for c in inspector.get_columns(t)} for t in existing_tables}
    with engine.begin() as conn:
        # Rename legacy default usernames
        conn.execute(text("UPDATE users SET username='ucc_manager', full_name='UCC Manager' WHERE username='root'"))
        conn.execute(text("UPDATE users SET username='ucc_accouting_manager', full_name='UCC Accounting Manager' WHERE username='admin'"))
        conn.execute(text("UPDATE users SET username='ucc_inventory_manager', full_name='UCC Inventory Manager', role='admin' WHERE username='player1'"))
        if "equipment_items" in existing_tables:
            cols = _cols["equipment_items"]
            if "purchase_date" in cols:
                conn.execute(text("ALTER TABLE equipment_items DROP COLUMN purchase_date"))
            if "purchase_price" in cols:
                conn.execute(text("ALTER TABLE equipment_items DROP COLUMN purchase_price"))
        if "transactions" in existing_tables:
            cols = _cols["transactions"]
            if "status" not in cols:
                conn.execute(text("ALTER TABLE transactions ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'"))
            if "created_by_id" not in cols:
                conn.execute(text("ALTER TABLE transactions ADD COLUMN created_by_id INTEGER REFERENCES users(id)"))
        if "users" in existing_tables:
            cols = _cols["users"]
            if "status" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'"))
            if "member_id" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN member_id INTEGER REFERENCES members(id) ON DELETE SET NULL"))
            # Ensure bootstrap admin is never stuck in pending
            conn.execute(text("UPDATE users SET status='active' WHERE username='ucc_manager' AND status != 'active'"))
            # Remove deprecated seeded accounts
            conn.execute(text("DELETE FROM users WHERE username IN ('ucc_accouting_manager','ucc_inventory_manager')"))
        if "tournaments" in existing_tables:
            cols = _cols["tournaments"]
            if "date" not in cols:
                conn.execute(text("ALTER TABLE tournaments ADD COLUMN date DATE"))
        if "tournament_participants" in existing_tables:
            cols = _cols["tournament_participants"]
            if "paid" not in cols:
                conn.execute(text("ALTER TABLE tournament_participants ADD COLUMN paid BOOLEAN NOT NULL DEFAULT FALSE"))
        if "members" in existing_tables:
            cols = _cols["members"]
            if "jersey_name" not in cols:
                conn.execute(text("ALTER TABLE members ADD COLUMN jersey_name VARCHAR(100)"))
            if "role" not in cols:
                conn.execute(text("ALTER TABLE members ADD COLUMN role VARCHAR(50)"))
            if "phone" in cols and "email" not in cols:
                # Legacy drop: old phone was a different schema; re-add both properly below
                conn.execute(text("ALTER TABLE members DROP COLUMN phone"))
            if "email" not in cols:
                conn.execute(text("ALTER TABLE members ADD COLUMN email VARCHAR(200)"))
            if "phone" not in cols:
                conn.execute(text("ALTER TABLE members ADD COLUMN phone VARCHAR(30)"))
            if "ball_type" not in cols:
                conn.execute(text("ALTER TABLE members ADD COLUMN ball_type VARCHAR(20)"))
            if "dcb_id" not in cols:
                conn.execute(text("ALTER TABLE members ADD COLUMN dcb_id VARCHAR(20)"))
            if "cricheroes" not in cols:
                conn.execute(text("ALTER TABLE members ADD COLUMN cricheroes BOOLEAN NOT NULL DEFAULT FALSE"))
            if "cricclubs" not in cols:
                conn.execute(text("ALTER TABLE members ADD COLUMN cricclubs BOOLEAN NOT NULL DEFAULT FALSE"))
        if "event_squads" in existing_tables:
            cols = _cols["event_squads"]
            if "batting_order" not in cols:
                conn.execute(text("ALTER TABLE event_squads ADD COLUMN batting_order INTEGER"))
        if "events" in existing_tables:
            cols = _cols["events"]
            if "match_fee" not in cols:
                conn.execute(text("ALTER TABLE events ADD COLUMN match_fee NUMERIC(10,2)"))
            if "reporting_time" not in cols:
                conn.execute(text("ALTER TABLE events ADD COLUMN reporting_time TIME"))
            if "remarks" not in cols:
                conn.execute(text("ALTER TABLE events ADD COLUMN remarks TEXT"))
            if "match_type" not in cols:
                conn.execute(text("ALTER TABLE events ADD COLUMN match_type VARCHAR(20)"))
            if "home_away" not in cols:
                conn.execute(text("ALTER TABLE events ADD COLUMN home_away VARCHAR(10)"))
            if "match_time" not in cols:
                conn.execute(text("ALTER TABLE events ADD COLUMN match_time TIME"))
        if "player_reporting" not in existing_tables:
            conn.execute(text("""
                CREATE TABLE player_reporting (
                    id SERIAL PRIMARY KEY,
                    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
                    member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
                    status VARCHAR(20) NOT NULL DEFAULT 'unknown',
                    reported_time TIME,
                    remarks TEXT,
                    CONSTRAINT uq_player_reporting UNIQUE (event_id, member_id)
                )
            """))
        else:
            pr_cols = _cols.get("player_reporting", set())
            if "reported" in pr_cols and "status" not in pr_cols:
                conn.execute(text("ALTER TABLE player_reporting ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'unknown'"))
                conn.execute(text("UPDATE player_reporting SET status = 'reported' WHERE reported = TRUE"))
                conn.execute(text("ALTER TABLE player_reporting DROP COLUMN reported"))
            if "remarks" not in pr_cols:
                conn.execute(text("ALTER TABLE player_reporting ADD COLUMN remarks TEXT"))
        if "audit_logs" in existing_tables:
            al_cols = _cols["audit_logs"]
            if "user_id" not in al_cols:
                conn.execute(text("ALTER TABLE audit_logs ADD COLUMN user_id INTEGER REFERENCES users(id)"))
            if "user_name" not in al_cols:
                conn.execute(text("ALTER TABLE audit_logs ADD COLUMN user_name VARCHAR(150)"))
        if "polls" in existing_tables:
            poll_cols = _cols["polls"]
            if "is_anonymous" not in poll_cols:
                conn.execute(text("ALTER TABLE polls ADD COLUMN is_anonymous BOOLEAN NOT NULL DEFAULT FALSE"))
        if "poll_votes" in existing_tables:
            # Make user_id nullable to support anonymous votes
            conn.execute(text("ALTER TABLE poll_votes ALTER COLUMN user_id DROP NOT NULL"))
            # Drop old unique constraint and replace with partial index (excludes NULL user_ids)
            conn.execute(text("ALTER TABLE poll_votes DROP CONSTRAINT IF EXISTS uq_poll_user_vote"))
            conn.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_poll_user_vote "
                "ON poll_votes(poll_id, user_id) WHERE user_id IS NOT NULL"
            ))
        if "poll_anonymous_voters" not in existing_tables:
            conn.execute(text("""
                CREATE TABLE poll_anonymous_voters (
                    id SERIAL PRIMARY KEY,
                    poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    voted_at TIMESTAMP DEFAULT NOW(),
                    CONSTRAINT uq_anon_poll_user UNIQUE (poll_id, user_id)
                )
            """))
        # Fix any NULL created_at left by raw-SQL seed inserts
        conn.execute(text("UPDATE members SET created_at = NOW() WHERE created_at IS NULL"))
        # Performance indexes — PostgreSQL does not auto-index FK columns
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_transactions_category_id ON transactions (category_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_transactions_date ON transactions (date DESC)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_tasks_assigned_to_id ON tasks (assigned_to_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_tasks_event_id ON tasks (event_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_tournament_participants_tournament_id ON tournament_participants (tournament_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_audit_logs_entity_type ON audit_logs (entity_type)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_audit_logs_created_at ON audit_logs (created_at DESC)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_users_member_id ON users (member_id)"))
        # Seed The Biryani Club sponsor (only if table already existed — new installs seed after create_all)
        if "sponsors" in existing_tables:
            count = conn.execute(text("SELECT COUNT(*) FROM sponsors")).scalar()
            if count == 0:
                conn.execute(text("""
                    INSERT INTO sponsors (name, logo_url, website_url, description, since_year, is_active, display_order)
                    VALUES (
                        'The Biryani Club',
                        'https://thebiryani.club/images/tbc-logo.webp',
                        'https://thebiryani.club/en/',
                        'Authentic Indian Cuisine. No Compromises.',
                        2025,
                        TRUE,
                        0
                    )
                """))


def _seed_sponsors():
    with engine.begin() as conn:
        count = conn.execute(text("SELECT COUNT(*) FROM sponsors")).scalar()
        if count == 0:
            conn.execute(text("""
                INSERT INTO sponsors (name, logo_url, website_url, description, since_year, is_active, display_order)
                VALUES (
                    'The Biryani Club',
                    'https://thebiryani.club/images/tbc-logo.webp',
                    'https://thebiryani.club/en/',
                    'Authentic Indian Cuisine. No Compromises.',
                    2025,
                    TRUE,
                    0
                )
            """))


_SEED_MEMBERS = [
    ("Raja Sekhar Pula Venkata",  "REDACTED",          "REDACTED"),
    ("Anish Arora",               "REDACTED",           "REDACTED"),
    ("Nilesh Chaudhari",          "REDACTED",             "REDACTED"),
    ("Bubai",                     "REDACTED",         "REDACTED"),
    ("Vinay Yadati Nagaraj",      "REDACTED",             "REDACTED"),
    ("Vamsi Krishna Sripathi",    "REDACTED",           "REDACTED"),
    ("Souvik Ghosh",              "REDACTED",               None),
    ("Vinal Kamble",              "REDACTED",            None),
    ("Samir Choksi",              "REDACTED",            None),
    ("Rounak Maheshwari",         "REDACTED",       "REDACTED"),
    ("Samir Patel",               "REDACTED",            None),
    ("Bhavin Mehta",              "REDACTED",           "REDACTED"),
    ("Pratik Chaudhary",          "REDACTED",   "REDACTED"),
    ("Monark Shah",               "REDACTED",          "REDACTED"),
    ("Chirag Patel",              "REDACTED",        "REDACTED"),
    ("Kuljit Arora",              "REDACTED",          "REDACTED"),
    ("Dipanshu Sharma",           "REDACTED",      "REDACTED"),
    ("Manoj Varma Sri Vatchavai", "REDACTED",           "REDACTED"),
    ("Sani Upadhyay",             "REDACTED",               "REDACTED"),
    ("Shyam Chothani",            "REDACTED",          "REDACTED"),
    ("Rakesh Sharma",             "REDACTED",          "REDACTED"),
    ("Bharghav Krishna",          "REDACTED",  "REDACTED"),
    ("Raj Kumar Saragadam",       "REDACTED",           "REDACTED"),
    ("Roshan Neupane",            "REDACTED",           "REDACTED"),
]


def _seed_founding_events():
    from datetime import date
    current_year = date.today().year
    with engine.begin() as conn:
        for year in range(current_year, current_year + 5):
            founding_date = f"{year}-06-30"
            exists = conn.execute(
                text("SELECT 1 FROM events WHERE date = :d AND title = 'UCC Founding Day' LIMIT 1"),
                {"d": founding_date},
            ).scalar()
            if not exists:
                conn.execute(
                    text("INSERT INTO events (date, title, type, notes, created_at) VALUES (:d, 'UCC Founding Day', 'other', 'Annual celebration of UCC''s founding on 30 June.', NOW())"),
                    {"d": founding_date},
                )


def _seed_members():
    with engine.begin() as conn:
        existing = {r[0] for r in conn.execute(text("SELECT name FROM members")).fetchall()}
        for name, email, phone in _SEED_MEMBERS:
            if name in existing:
                conn.execute(
                    text("UPDATE members SET email=:e, phone=:p WHERE name=:n AND (email IS NULL OR email='')"),
                    {"e": email, "p": phone, "n": name},
                )
            else:
                conn.execute(
                    text("INSERT INTO members (name, email, phone, is_active, created_at) VALUES (:n, :e, :p, TRUE, NOW())"),
                    {"n": name, "e": email, "p": phone},
                )


@asynccontextmanager
async def lifespan(app: FastAPI):
    _run_migrations()
    Base.metadata.create_all(bind=engine)
    _seed_sponsors()
    _seed_members()
    _seed_founding_events()
    yield


app = FastAPI(title="UCC Manager", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=1000)

@app.middleware("http")
async def no_cache_api(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response

_auth = [Depends(get_current_user)]

app.include_router(auth.router)
app.include_router(approvals.router)
app.include_router(accounting.router,          dependencies=_auth)
app.include_router(inventory.router,           dependencies=_auth)
app.include_router(members.router,             dependencies=_auth)
app.include_router(events.router,              dependencies=_auth)
app.include_router(audit.router,               dependencies=_auth)
app.include_router(finance_pin.router,         dependencies=_auth)
app.include_router(player_availability.router, dependencies=_auth)
app.include_router(tasks.router,               dependencies=_auth)
app.include_router(tournament.router,          dependencies=_auth)
app.include_router(match_fees.router,          dependencies=_auth)
app.include_router(reporting.router,           dependencies=_auth)
app.include_router(polls.router,               dependencies=_auth)
app.include_router(pain_points.router,         dependencies=_auth)
app.include_router(violations.router,          dependencies=_auth)
app.include_router(field_formations.router,    dependencies=_auth)
app.include_router(ai_field.router,            dependencies=_auth)
app.include_router(scoreboard.router,          dependencies=_auth)
app.include_router(sponsors.router,            dependencies=_auth)

app.mount("/", StaticFiles(directory="static", html=True), name="static")
