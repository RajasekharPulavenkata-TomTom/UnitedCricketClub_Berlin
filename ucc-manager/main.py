from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text, inspect
from database import engine, Base
import models  # registers all models before create_all
from routers import accounting, inventory, members, events, audit, finance_pin, player_availability, tasks, tournament, match_fees


def _run_migrations():
    inspector = inspect(engine)
    existing_tables = inspector.get_table_names()
    with engine.begin() as conn:
        # Rename legacy default usernames
        conn.execute(text("UPDATE users SET username='ucc_manager', full_name='UCC Manager' WHERE username='root'"))
        conn.execute(text("UPDATE users SET username='ucc_accouting_manager', full_name='UCC Accounting Manager' WHERE username='admin'"))
        conn.execute(text("UPDATE users SET username='ucc_inventory_manager', full_name='UCC Inventory Manager', role='admin' WHERE username='player1'"))
        if "equipment_items" in existing_tables:
            cols = [c["name"] for c in inspector.get_columns("equipment_items")]
            if "purchase_date" in cols:
                conn.execute(text("ALTER TABLE equipment_items DROP COLUMN purchase_date"))
            if "purchase_price" in cols:
                conn.execute(text("ALTER TABLE equipment_items DROP COLUMN purchase_price"))
        if "transactions" in existing_tables:
            cols = [c["name"] for c in inspector.get_columns("transactions")]
            if "status" not in cols:
                conn.execute(text("ALTER TABLE transactions ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'"))
            if "created_by_id" not in cols:
                conn.execute(text("ALTER TABLE transactions ADD COLUMN created_by_id INTEGER REFERENCES users(id)"))
        if "assignments" in existing_tables:
            cols = [c["name"] for c in inspector.get_columns("assignments")]
            if "status" not in cols:
                conn.execute(text("ALTER TABLE assignments ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'"))
            if "created_by_id" not in cols:
                conn.execute(text("ALTER TABLE assignments ADD COLUMN created_by_id INTEGER REFERENCES users(id)"))
        if "users" in existing_tables:
            cols = [c["name"] for c in inspector.get_columns("users")]
            if "status" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'"))
        if "tournaments" in existing_tables:
            cols = [c["name"] for c in inspector.get_columns("tournaments")]
            if "date" not in cols:
                conn.execute(text("ALTER TABLE tournaments ADD COLUMN date DATE"))
        if "tournament_participants" in existing_tables:
            cols = [c["name"] for c in inspector.get_columns("tournament_participants")]
            if "paid" not in cols:
                conn.execute(text("ALTER TABLE tournament_participants ADD COLUMN paid BOOLEAN NOT NULL DEFAULT FALSE"))
        if "members" in existing_tables:
            cols = [c["name"] for c in inspector.get_columns("members")]
            if "jersey_name" not in cols:
                conn.execute(text("ALTER TABLE members ADD COLUMN jersey_name VARCHAR(100)"))
            if "role" not in cols:
                conn.execute(text("ALTER TABLE members ADD COLUMN role VARCHAR(50)"))
            if "phone" in cols:
                conn.execute(text("ALTER TABLE members DROP COLUMN phone"))
            if "ball_type" not in cols:
                conn.execute(text("ALTER TABLE members ADD COLUMN ball_type VARCHAR(20)"))
            if "dcb_id" not in cols:
                conn.execute(text("ALTER TABLE members ADD COLUMN dcb_id VARCHAR(20)"))
            if "cricheroes" not in cols:
                conn.execute(text("ALTER TABLE members ADD COLUMN cricheroes BOOLEAN NOT NULL DEFAULT FALSE"))
            if "cricclubs" not in cols:
                conn.execute(text("ALTER TABLE members ADD COLUMN cricclubs BOOLEAN NOT NULL DEFAULT FALSE"))
        if "event_squads" in existing_tables:
            cols = [c["name"] for c in inspector.get_columns("event_squads")]
            if "batting_order" not in cols:
                conn.execute(text("ALTER TABLE event_squads ADD COLUMN batting_order INTEGER"))
        if "events" in existing_tables:
            cols = [c["name"] for c in inspector.get_columns("events")]
            if "match_fee" not in cols:
                conn.execute(text("ALTER TABLE events ADD COLUMN match_fee NUMERIC(10,2)"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    _run_migrations()
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="UCC Manager", lifespan=lifespan)

app.include_router(accounting.router)
app.include_router(inventory.router)
app.include_router(members.router)
app.include_router(events.router)
app.include_router(audit.router)
app.include_router(finance_pin.router)
app.include_router(player_availability.router)
app.include_router(tasks.router)
app.include_router(tournament.router)
app.include_router(match_fees.router)

app.mount("/", StaticFiles(directory="static", html=True), name="static")
