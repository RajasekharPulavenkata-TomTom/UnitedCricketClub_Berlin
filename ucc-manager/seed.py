"""Run once to seed default categories and users. Safe to re-run — skips existing."""
from sqlalchemy import text, inspect as sa_inspect
from database import SessionLocal, engine, Base
import models
from models.accounting import Category
from models.auth import User
from services.auth_service import hash_password

# Apply column migrations before create_all so ORM queries work with the new schema
_insp = sa_inspect(engine)
_existing = set(_insp.get_table_names())
with engine.begin() as _conn:
    if "users" in _existing:
        _user_cols = {c["name"] for c in _insp.get_columns("users")}
        if "member_id" not in _user_cols:
            _conn.execute(text("ALTER TABLE users ADD COLUMN member_id INTEGER REFERENCES members(id) ON DELETE SET NULL"))

Base.metadata.create_all(bind=engine)

INCOME_CATEGORIES = [
    ("Membership Fees", "Annual club membership subscriptions"),
    ("Match Fees", "Per-match player contributions"),
    ("Sponsorships", "Corporate or individual sponsorships"),
    ("Donations", "Charitable donations to the club"),
    ("Fundraising", "Fundraising events and activities"),
    ("Ground Hire Income", "Income from hiring out the ground"),
]

EXPENSE_CATEGORIES = [
    ("Ground Rent", "Pitch and ground hire fees"),
    ("Equipment Purchases", "Bats, balls, helmets, and other gear"),
    ("Travel", "Transport to away matches and tournaments"),
    ("Umpire Fees", "Match official payments"),
    ("Kit Printing", "Jerseys, caps, and printed apparel"),
    ("Training", "Coaching sessions and training costs"),
    ("Affiliation Fees", "League and association registration fees"),
    ("Miscellaneous", "Other club expenses"),
]

DEFAULT_USERS = [
    {"username": "ucc_manager", "full_name": "UCC Manager", "password": "ucc-root-2025", "role": "root"},
]

db = SessionLocal()
inserted_cats = 0
inserted_users = 0

for name, desc in INCOME_CATEGORIES:
    if not db.query(Category).filter(Category.name == name).first():
        db.add(Category(name=name, type="income", description=desc))
        inserted_cats += 1

for name, desc in EXPENSE_CATEGORIES:
    if not db.query(Category).filter(Category.name == name).first():
        db.add(Category(name=name, type="expense", description=desc))
        inserted_cats += 1

for u in DEFAULT_USERS:
    if not db.query(User).filter(User.username == u["username"]).first():
        db.add(User(
            username=u["username"],
            full_name=u["full_name"],
            hashed_password=hash_password(u["password"]),
            role=u["role"],
            status="active",
        ))
        inserted_users += 1

db.commit()
db.close()
print(f"Seeded {inserted_cats} categories and {inserted_users} users (skipped existing).")
print("\nDefault credentials:")
print("  ucc_manager / ucc-root-2025  (Root - full access)")
print("\nChange password after first login!")
