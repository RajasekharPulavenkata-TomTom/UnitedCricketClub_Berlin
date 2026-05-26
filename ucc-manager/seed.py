"""Run once to seed default categories and users. Safe to re-run — skips existing."""
from database import SessionLocal, engine, Base
import models
from models.accounting import Category
from models.auth import User
from services.auth_service import hash_password

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
    {"username": "ucc_manager",           "full_name": "UCC Manager",           "password": "ucc-root-2025",  "role": "root"},
    {"username": "ucc_accouting_manager", "full_name": "UCC Accounting Manager","password": "ucc-admin-2025", "role": "admin"},
    {"username": "ucc_inventory_manager", "full_name": "UCC Inventory Manager", "password": "ucc-user-2025",  "role": "admin"},
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
        ))
        inserted_users += 1

db.commit()
db.close()
print(f"Seeded {inserted_cats} categories and {inserted_users} users (skipped existing).")
print("\nDefault credentials:")
print("  ucc_manager           / ucc-root-2025   (Root - full access + user management)")
print("  ucc_accouting_manager / ucc-admin-2025  (Admin - manage & approve accounting)")
print("  ucc_inventory_manager / ucc-user-2025   (Admin - manage & approve inventory)")
print("\nChange passwords after first login!")
