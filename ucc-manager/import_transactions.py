"""One-time script to import historical transactions. Idempotent — safe to re-run.

Uses the app's DATABASE_URL, so run it against the target DB:
    DATABASE_URL=<neon-pooled-url> python3 import_transactions.py
"""
import sys
from datetime import date
from decimal import Decimal

from database import SessionLocal

db = SessionLocal()

from models.accounting import Category, Transaction
from models.auth import User

# Resolve category IDs
def cat(name):
    c = db.query(Category).filter(Category.name == name).first()
    if not c:
        print(f"ERROR: category '{name}' not found"); sys.exit(1)
    return c.id

equip = cat("Equipment Purchases")
travel = cat("Travel")
misc  = cat("Miscellaneous")

# Resolve user IDs
def uid(username):
    u = db.query(User).filter(User.username == username).first()
    return u.id if u else None

# `ucc_accouting_manager` used to be resolved here as a fallback, but the migrations
# delete that account — the per-row payer is recorded in `reference` instead.
raj = uid("ucc_manager")  # Root user who made most purchases
if raj is None:
    print("ERROR: user 'ucc_manager' not found"); sys.exit(1)

TRANSACTIONS = [
    # (date,              amount,  category,  description,                           reference)
    (date(2026,  1,  6), "58.75",  equip,  "Indoor Leather Balls",                  "Raj"),
    (date(2026,  1,  8), "15.50",  equip,  "FILA Surface Care Solutions",           "Raj"),
    (date(2026,  1, 10), "125.00", equip,  "MRF Team Bat",                          "Raj"),
    (date(2026,  1, 10), "80.00",  equip,  "Heavy white balls",                     "Raj"),
    (date(2026,  1, 10), "18.00",  equip,  "Wicket Keeping Gloves",                 "Raj"),
    (date(2026,  1, 10), "6.00",   equip,  "Wicket Keeping inner Gloves",           "Raj"),
    (date(2026,  1, 10), "28.00",  equip,  "Wicket Keeping Pads",                   "Raj"),
    (date(2026,  1, 24), "9.99",   equip,  "DIY Doctor Double Sided Carpet Rug Tape", "Raj"),
    (date(2026,  3,  5), "38.55",  equip,  "Stumps",                                "Raj"),
    (date(2026,  3, 18), "295.00", travel, "Transport Charges",                     "Raj"),
    (date(2026,  3, 31), "50.00",  misc,   "2 pair of keys for Indoor",             "Raj"),
    (date(2026,  5, 19), "42.00",  equip,  "12 Balls",                              "Pratik"),  # date not provided — using today
]

inserted = 0
for d, amt, cat_id, desc, ref in TRANSACTIONS:
    # Skip if already exists (idempotent)
    exists = db.query(Transaction).filter(
        Transaction.date == d,
        Transaction.description == desc,
        Transaction.amount == Decimal(amt),
    ).first()
    if exists:
        print(f"  SKIP  {d}  {desc}")
        continue
    tx = Transaction(
        date=d,
        amount=Decimal(amt),
        type="expense",
        category_id=cat_id,
        description=desc,
        reference=ref,
        status="approved",
        created_by_id=raj,
    )
    db.add(tx)
    inserted += 1
    print(f"  ADD   {d}  {desc}  €{amt}")

db.commit()
db.close()
print(f"\nDone — inserted {inserted} transactions.")
