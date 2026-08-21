"""Deployment-time database migrations, seeding, and asset stamping.

Runs once per deployment as the Vercel Build Command — never per request. On the
previous Fly.io deployment this work ran in the FastAPI lifespan on every process
boot; on a serverless platform that would fire on every cold start, concurrently
across instances.

Schema work is guarded to production builds. Preview deployments share the same
Neon database and must never mutate the production schema, so previews verify
routing, static assets and auth — not schema changes. Pass --migrate to run the
schema work manually outside Vercel.
"""
import os
import sys
from pathlib import Path

from sqlalchemy import text, inspect

from database import engine, Base
import models  # noqa: F401 — registers all ORM classes with Base before create_all

ROOT = Path(__file__).resolve().parent


def _run_migrations():
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    # Pre-fetch all columns in one pass — avoids repeated round-trips during migration checks
    _cols = {t: {c["name"] for c in inspector.get_columns(t)} for t in existing_tables}
    with engine.begin() as conn:
        # Serialize migrations across workers — released automatically at transaction end
        conn.execute(text("SELECT pg_advisory_xact_lock(88776655)"))
        # Rename legacy default usernames
        conn.execute(text("UPDATE users SET username='ucc_manager', full_name='UCC Manager' WHERE username='root'"))
        conn.execute(text("UPDATE users SET username='ucc_accouting_manager', full_name='UCC Accounting Manager' WHERE username='admin'"))
        conn.execute(text("UPDATE users SET username='ucc_inventory_manager', full_name='UCC Inventory Manager', role='admin' WHERE username='player1'"))
        # Rename roles: root→developer, admin→manager, user→player
        conn.execute(text("UPDATE users SET role='developer' WHERE role='root'"))
        conn.execute(text("UPDATE users SET role='manager' WHERE role='admin'"))
        conn.execute(text("UPDATE users SET role='player' WHERE role='user'"))
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
            # The old ucc_manager root account shipped a plaintext password in
            # seed.py — keep it permanently disabled (not hard-deleted: it owns
            # historical transactions via created_by_id, so a DELETE would fail
            # the FK. Deactivation blocks login and preserves data lineage).
            conn.execute(text("UPDATE users SET is_active=false WHERE username='ucc_manager'"))
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
            # IF NOT EXISTS guards against the 2-worker race: both workers snapshot
            # `cols` before the advisory lock, so the second worker's guard can be
            # stale and would otherwise crash on a duplicate ADD COLUMN.
            if "membership_no" not in cols:
                conn.execute(text("ALTER TABLE members ADD COLUMN IF NOT EXISTS membership_no VARCHAR(30)"))
            if "id_card_received" not in cols:
                conn.execute(text("ALTER TABLE members ADD COLUMN IF NOT EXISTS id_card_received BOOLEAN NOT NULL DEFAULT FALSE"))
            if "spielerpass" not in cols:
                conn.execute(text("ALTER TABLE members ADD COLUMN IF NOT EXISTS spielerpass VARCHAR(30)"))
        if "event_squads" in existing_tables:
            cols = _cols["event_squads"]
            if "batting_order" not in cols:
                conn.execute(text("ALTER TABLE event_squads ADD COLUMN batting_order INTEGER"))
        if "events" in existing_tables:
            cols = _cols["events"]
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
            if "allow_multiple" not in poll_cols:
                conn.execute(text("ALTER TABLE polls ADD COLUMN allow_multiple BOOLEAN NOT NULL DEFAULT FALSE"))
        if "poll_votes" in existing_tables:
            # Make user_id nullable to support anonymous votes
            conn.execute(text("ALTER TABLE poll_votes ALTER COLUMN user_id DROP NOT NULL"))
            # Drop old unique constraint and replace with partial index (excludes NULL user_ids)
            conn.execute(text("ALTER TABLE poll_votes DROP CONSTRAINT IF EXISTS uq_poll_user_vote"))
            # Drop old (poll_id, user_id) index and upgrade to (poll_id, user_id, option_id)
            # so multi-select polls can store multiple rows per user (one per option chosen)
            conn.execute(text("DROP INDEX IF EXISTS uq_poll_user_vote"))
            conn.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_poll_user_option_vote "
                "ON poll_votes(poll_id, user_id, option_id) WHERE user_id IS NOT NULL"
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
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_ext_tournament_players_tournament_id ON external_tournament_players (tournament_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_ext_tournament_players_member_id ON external_tournament_players (member_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_members_active ON members (id) WHERE is_active = true"))
        if "external_tournament_players" in existing_tables:
            etp_cols = _cols.get("external_tournament_players", set())
            if "matches_played" not in etp_cols:
                conn.execute(text("ALTER TABLE external_tournament_players ADD COLUMN matches_played INTEGER NOT NULL DEFAULT 1"))
        if "external_tournaments" in existing_tables:
            et_cols = _cols.get("external_tournaments", set())
            if "captain_id" not in et_cols:
                conn.execute(text("ALTER TABLE external_tournaments ADD COLUMN captain_id INTEGER REFERENCES members(id) ON DELETE SET NULL"))
            if "payment_info" not in et_cols:
                conn.execute(text("ALTER TABLE external_tournaments ADD COLUMN payment_info TEXT"))
        if "internal_tournament_teams" in existing_tables:
            itt_cols = _cols.get("internal_tournament_teams", set())
            if "captain_id" not in itt_cols:
                conn.execute(text("ALTER TABLE internal_tournament_teams ADD COLUMN captain_id INTEGER REFERENCES members(id) ON DELETE SET NULL"))
        if "internal_tournaments" in existing_tables:
            it_cols = _cols.get("internal_tournaments", set())
            if "captain_id" not in it_cols:
                conn.execute(text("ALTER TABLE internal_tournaments ADD COLUMN captain_id INTEGER REFERENCES members(id) ON DELETE SET NULL"))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS page_views (
                id SERIAL PRIMARY KEY,
                page VARCHAR(100) NOT NULL,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                visited_at TIMESTAMP DEFAULT NOW()
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_page_views_page ON page_views (page)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_page_views_visited_at ON page_views (visited_at DESC)"))
        if "page_views" in existing_tables:
            pv_cols = _cols.get("page_views", set())
            if "nav_ms" not in pv_cols:
                conn.execute(text("ALTER TABLE page_views ADD COLUMN nav_ms INTEGER"))
            if "device" not in pv_cols:
                conn.execute(text("ALTER TABLE page_views ADD COLUMN device VARCHAR(10)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_page_views_device ON page_views (device) WHERE device IS NOT NULL"))
        if "page_views" in existing_tables and "is_first" not in _cols.get("page_views", set()):
            conn.execute(text("ALTER TABLE page_views ADD COLUMN is_first BOOLEAN"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_int_tournament_teams_tournament_id ON internal_tournament_teams (tournament_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_int_tournament_team_players_team_id ON internal_tournament_team_players (team_id)"))
        # Legacy quiz_questions predates the JSON `options` column; no version of
        # the current model can read it (every query 500s on UndefinedColumn), so
        # its rows are unreachable seed content. Drop it — create_all then
        # recreates the table with the current schema and _seed_quiz_questions
        # repopulates it.
        if "quiz_questions" in existing_tables and "options" not in _cols.get("quiz_questions", set()):
            conn.execute(text("DROP TABLE quiz_questions"))
        # page_views is the highest-write table and only feeds 30/90-day stats —
        # prune on every production deploy so it can't grow without bound
        conn.execute(text("DELETE FROM page_views WHERE visited_at < NOW() - INTERVAL '90 days'"))
        # receipts.location ("Ort") was added after the table first shipped
        if "receipts" in existing_tables and "location" not in _cols.get("receipts", set()):
            conn.execute(text("ALTER TABLE receipts ADD COLUMN location VARCHAR(100) NOT NULL DEFAULT 'Berlin'"))
        # Approvals queue: nearly all rows are 'approved', so a partial index on the
        # pending slice is far more selective than a full status index
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_transactions_pending ON transactions (created_at) WHERE status = 'pending'"))
        # Date-range filters (routers use sargable half-open ranges on these columns)
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_events_date ON events (date)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_player_availability_date ON player_availability (date)"))
        if "tournament_feedback" not in existing_tables:
            conn.execute(text("""
                CREATE TABLE tournament_feedback (
                    id SERIAL PRIMARY KEY,
                    tournament_type VARCHAR(10) NOT NULL,
                    tournament_id INTEGER NOT NULL,
                    feedback_type VARCHAR(10) NOT NULL,
                    reviewer_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
                    reviewed_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
                    rating INTEGER,
                    comment TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            """))
        if "elections" in existing_tables:
            el_cols = _cols.get("elections", set())
            if "nominations_close_at" not in el_cols:
                conn.execute(text("ALTER TABLE elections ADD COLUMN nominations_close_at TIMESTAMPTZ"))
        if "elections" not in existing_tables:
            conn.execute(text("""
                CREATE TABLE elections (
                    id SERIAL PRIMARY KEY,
                    title VARCHAR(200) NOT NULL,
                    description TEXT,
                    status VARCHAR(20) NOT NULL DEFAULT 'nominating',
                    created_by_id INTEGER REFERENCES users(id),
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    closed_at  TIMESTAMPTZ
                )
            """))
            conn.execute(text("""
                CREATE TABLE election_candidates (
                    id SERIAL PRIMARY KEY,
                    election_id INTEGER NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
                    member_id   INTEGER NOT NULL REFERENCES members(id)   ON DELETE CASCADE,
                    CONSTRAINT uq_election_candidate UNIQUE (election_id, member_id)
                )
            """))
            conn.execute(text("""
                CREATE TABLE election_votes (
                    id SERIAL PRIMARY KEY,
                    election_id  INTEGER NOT NULL REFERENCES elections(id)           ON DELETE CASCADE,
                    candidate_id INTEGER NOT NULL REFERENCES election_candidates(id) ON DELETE CASCADE,
                    voted_at TIMESTAMPTZ DEFAULT NOW()
                )
            """))
            conn.execute(text("""
                CREATE TABLE election_voters (
                    id SERIAL PRIMARY KEY,
                    election_id INTEGER NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
                    user_id     INTEGER NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
                    voted_at TIMESTAMPTZ DEFAULT NOW(),
                    CONSTRAINT uq_election_voter UNIQUE (election_id, user_id)
                )
            """))
            conn.execute(text("""
                CREATE TABLE election_nominations (
                    id SERIAL PRIMARY KEY,
                    election_id INTEGER NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
                    member_id   INTEGER NOT NULL REFERENCES members(id)   ON DELETE CASCADE,
                    user_id     INTEGER NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
                    nominated_at TIMESTAMPTZ DEFAULT NOW(),
                    CONSTRAINT uq_election_nomination_user UNIQUE (election_id, user_id)
                )
            """))
        else:
            # Migrate existing elections table to support nomination phase
            el_cols = _cols.get("elections", set())
            if "open" in (conn.execute(text("SELECT DISTINCT status FROM elections")).scalars().all() if "elections" in existing_tables else []):
                conn.execute(text("UPDATE elections SET status='voting' WHERE status='open'"))
            if "seats" not in el_cols:
                conn.execute(text("ALTER TABLE elections ADD COLUMN seats INTEGER NOT NULL DEFAULT 3"))
            if "election_nominations" not in existing_tables:
                conn.execute(text("""
                    CREATE TABLE election_nominations (
                        id SERIAL PRIMARY KEY,
                        election_id INTEGER NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
                        member_id   INTEGER NOT NULL REFERENCES members(id)   ON DELETE CASCADE,
                        user_id     INTEGER NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
                        nominated_at TIMESTAMPTZ DEFAULT NOW(),
                        CONSTRAINT uq_election_nomination_user UNIQUE (election_id, user_id)
                    )
                """))
        if "meetings" not in existing_tables:
            conn.execute(text("""
                CREATE TABLE meetings (
                    id SERIAL PRIMARY KEY,
                    title VARCHAR(200) NOT NULL,
                    meeting_date DATE NOT NULL,
                    status VARCHAR(20) NOT NULL DEFAULT 'upcoming',
                    created_by_id INTEGER REFERENCES users(id),
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            """))
            conn.execute(text("""
                CREATE TABLE meeting_agenda_items (
                    id SERIAL PRIMARY KEY,
                    meeting_id   INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
                    title        VARCHAR(300) NOT NULL,
                    description  TEXT,
                    raised_by_id INTEGER REFERENCES users(id),
                    status       VARCHAR(20) NOT NULL DEFAULT 'pending',
                    decision     TEXT,
                    created_at   TIMESTAMPTZ DEFAULT NOW()
                )
            """))
            conn.execute(text("""
                CREATE TABLE meeting_item_seconds (
                    id SERIAL PRIMARY KEY,
                    item_id    INTEGER NOT NULL REFERENCES meeting_agenda_items(id) ON DELETE CASCADE,
                    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    CONSTRAINT uq_meeting_item_second UNIQUE (item_id, user_id)
                )
            """))
        if "feedback_sessions" not in existing_tables:
            conn.execute(text("""
                CREATE TABLE feedback_sessions (
                    id SERIAL PRIMARY KEY,
                    title VARCHAR(200) NOT NULL,
                    election_id INTEGER REFERENCES elections(id) ON DELETE SET NULL,
                    status VARCHAR(20) NOT NULL DEFAULT 'open',
                    created_by_id INTEGER REFERENCES users(id),
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    closed_at  TIMESTAMPTZ
                )
            """))
            conn.execute(text("""
                CREATE TABLE feedback_ratings (
                    id SERIAL PRIMARY KEY,
                    session_id   INTEGER NOT NULL REFERENCES feedback_sessions(id) ON DELETE CASCADE,
                    pillar       INTEGER NOT NULL,
                    rating       INTEGER NOT NULL,
                    submitted_at TIMESTAMPTZ DEFAULT NOW()
                )
            """))
            conn.execute(text("""
                CREATE TABLE feedback_submitters (
                    id SERIAL PRIMARY KEY,
                    session_id   INTEGER NOT NULL REFERENCES feedback_sessions(id) ON DELETE CASCADE,
                    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    submitted_at TIMESTAMPTZ DEFAULT NOW(),
                    CONSTRAINT uq_feedback_submitter UNIQUE (session_id, user_id)
                )
            """))
        if "pain_points" in existing_tables:
            pp_cols = _cols.get("pain_points", set())
            if "discussion_note" not in pp_cols:
                conn.execute(text("ALTER TABLE pain_points ADD COLUMN discussion_note TEXT"))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS member_payments (
                id SERIAL PRIMARY KEY,
                member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
                year INTEGER NOT NULL,
                anmeldung BOOLEAN NOT NULL DEFAULT FALSE,
                dezember  BOOLEAN NOT NULL DEFAULT FALSE,
                quarterly BOOLEAN NOT NULL DEFAULT FALSE,
                yearly    BOOLEAN NOT NULL DEFAULT FALSE,
                sepa      BOOLEAN NOT NULL DEFAULT FALSE,
                notes TEXT,
                CONSTRAINT uq_member_payment_year UNIQUE (member_id, year)
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_member_payments_member_id ON member_payments (member_id)"))
        # Drop legacy orphan tables
        conn.execute(text("DROP TABLE IF EXISTS assignments"))
        conn.execute(text("DROP TABLE IF EXISTS notification_logs"))
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


def _seed_quiz_questions():
    """Seed quiz questions at deploy time. Previously this ran lazily inside
    GET /quiz/questions, where two concurrent cold starts could double-seed."""
    from database import SessionLocal
    from routers.quiz import _seed
    db = SessionLocal()
    try:
        _seed(db)
    finally:
        db.close()


def _stamp_service_worker():
    """Bake a deploy-stable cache key into static assets.

    The version must be identical across every instance of a deployment and must
    change on every deployment. A per-process value (the old boot timestamp) makes
    clients thrash between service-worker caches once more than one instance exists.

    Besides sw.js, the same key is stamped into the ?v= asset URLs in the HTML
    entry points and into app.js's _SV: stable URLs within a deploy make the
    immutable Cache-Control headers effective, and a new deploy rotates every
    URL at once so updates propagate.
    """
    version = os.environ.get("VERCEL_GIT_COMMIT_SHA") or os.environ.get("VERCEL_DEPLOYMENT_ID")
    if not version:
        print("==> No Vercel deploy identifier; leaving cache-version placeholders intact")
        return
    for rel in ("static/sw.js", "static/index.html", "static/avail.html", "static/js/app.js"):
        f = ROOT / rel
        f.write_text(f.read_text().replace("__CACHE_VERSION__", f"ucc-{version}"))
    print(f"==> Stamped cache version into sw.js, index.html, avail.html, app.js: ucc-{version}")


def _apply_schema():
    """Apply schema and seed data, in the same order the Fly.io deployment used.

    Order matters and is not obvious: `seed` creates the tables, so it must run
    before `_run_migrations`, whose first statements UPDATE `users` unconditionally
    and would fail against a database that has no tables yet. On Fly this ordering
    was implicit — start.sh ran seed.py before uvicorn started and the lifespan
    migrations fired.
    """
    print("==> Creating tables and seeding categories and default users...")
    import seed  # noqa: F401 — module-level code creates tables and seeds, idempotently
    print("==> Running migrations...")
    _run_migrations()
    print("==> Creating any tables added since...")
    Base.metadata.create_all(bind=engine)
    print("==> Seeding sponsors and founding events...")
    _seed_sponsors()
    _seed_founding_events()
    print("==> Seeding quiz questions...")
    _seed_quiz_questions()


def main():
    _stamp_service_worker()
    if os.environ.get("VERCEL_ENV") == "production" or "--migrate" in sys.argv:
        _apply_schema()
        print("==> Database is up to date")
    else:
        print(f"==> Skipping schema work (VERCEL_ENV={os.environ.get('VERCEL_ENV')!r}); "
              "previews run against the production schema")


if __name__ == "__main__":
    main()
