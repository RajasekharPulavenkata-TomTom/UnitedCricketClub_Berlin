from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy import text, inspect
from database import engine, Base
import models  # registers all models before create_all
from dependencies.auth import get_current_user
from routers import accounting, inventory, members, events, audit, player_availability, tasks, reporting, auth, approvals, polls, pain_points, violations, field_formations, scoreboard, sponsors, external_tournament, internal_tournament, page_views, tournament_feedback, quiz, chatbot, elections, feedback, meetings


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
        if "external_tournament_players" in existing_tables:
            etp_cols = _cols.get("external_tournament_players", set())
            if "matches_played" not in etp_cols:
                conn.execute(text("ALTER TABLE external_tournament_players ADD COLUMN matches_played INTEGER NOT NULL DEFAULT 1"))
        if "external_tournaments" in existing_tables:
            et_cols = _cols.get("external_tournaments", set())
            if "captain_id" not in et_cols:
                conn.execute(text("ALTER TABLE external_tournaments ADD COLUMN captain_id INTEGER REFERENCES members(id) ON DELETE SET NULL"))
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
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_int_tournament_teams_tournament_id ON internal_tournament_teams (tournament_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_int_tournament_team_players_team_id ON internal_tournament_team_players (team_id)"))
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
        # Remove any non-cricket questions left over from the opentdb era
        conn.execute(text("DELETE FROM quiz_questions WHERE category IS DISTINCT FROM 'Cricket'"))
        if "quiz_questions" not in existing_tables:
            conn.execute(text("""
                CREATE TABLE quiz_questions (
                    id SERIAL PRIMARY KEY,
                    question TEXT NOT NULL,
                    correct_answer TEXT NOT NULL,
                    incorrect_answers JSONB NOT NULL,
                    difficulty VARCHAR(10),
                    category VARCHAR(100),
                    question_type VARCHAR(20) DEFAULT 'text',
                    field_position VARCHAR(50),
                    fetched_at TIMESTAMPTZ DEFAULT NOW()
                )
            """))
        elif "quiz_questions" in existing_tables:
            qq_cols = _cols.get("quiz_questions", set())
            if "question_type" not in qq_cols:
                conn.execute(text("ALTER TABLE quiz_questions ADD COLUMN question_type VARCHAR(20) DEFAULT 'text'"))
                conn.execute(text("ALTER TABLE quiz_questions ADD COLUMN field_position VARCHAR(50)"))
                # Clear all questions so _seed_if_empty reseeds with the full bank (including field questions)
                conn.execute(text("DELETE FROM quiz_questions"))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS quiz_scores (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                score INTEGER NOT NULL,
                total INTEGER NOT NULL,
                played_at TIMESTAMPTZ DEFAULT NOW()
            )
        """))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_quiz_scores_user_id ON quiz_scores (user_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_quiz_scores_played_at ON quiz_scores (played_at DESC)"))
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    _run_migrations()
    Base.metadata.create_all(bind=engine)
    _seed_sponsors()
    _seed_founding_events()
    yield


app = FastAPI(title="UCC Manager", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=1000)

@app.middleware("http")
async def cache_control(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path.startswith("/api/"):
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
app.include_router(quiz.router,               dependencies=_auth)
app.include_router(chatbot.router,            dependencies=_auth)
app.include_router(elections.router,          dependencies=_auth)
app.include_router(feedback.router,           dependencies=_auth)
app.include_router(meetings.router,           dependencies=_auth)


@app.get("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}


app.mount("/", StaticFiles(directory="static", html=True), name="static")
