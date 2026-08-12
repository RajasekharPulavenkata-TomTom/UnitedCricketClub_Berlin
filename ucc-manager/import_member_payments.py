"""One-time import of the 2026 membership-dues sheet.

Keyed on DCB ID (reliable; present for every row). Sets the static member fields
(membership_no, id_card_received, spielerpass) and upserts each member's 2026
payment row. Idempotent on (member, year) — safe to re-run. Rows whose DCB ID is
not found in the DB are reported and skipped (no members are auto-created).

Uses the app's DATABASE_URL, so run it against the target DB:
    DATABASE_URL=<neon-pooled-url> python3 import_member_payments.py

NOTE: The source sheet's own footer tallies SEPA = 7, but only 5 rows carry a
visible SEPA mark below. The 5 are imported; verify the other 2 in the UI.
"""
from database import SessionLocal
from models.member import Member
from models.member_payment import MemberPayment

YEAR = 2026

# (dcb_id, membership_no, id_card_received, spielerpass,
#  anmeldung, dezember, quarterly, yearly, sepa)
ROWS = [
    ("DCB0M44632", "CR1812250162", True,  "All Set", True,  True,  False, True,  False),  # Raja Sekhar Pula Venkata
    ("DCB0M97957", "CR1812250155", True,  "All Set", True,  True,  False, True,  False),  # Nilesh Chaudhari
    ("DCB0M13973", "CR1812250158", True,  "All Set", True,  True,  False, True,  False),  # Sanowar Alam (Bubai) Gazi
    ("DCB0M19903", "CR1812250159", True,  "All Set", True,  True,  False, True,  False),  # Vamsi Krishna Sripathi
    ("DCB0M49771", "CR1812250160", True,  "All Set", True,  True,  False, True,  False),  # Samir Choksi
    ("DCB0M42596", "CR1812250157", True,  "All Set", True,  True,  False, True,  False),  # Pratik Chaudhary
    ("DCB0M29436", "CR1812250156", True,  "All Set", True,  True,  False, True,  False),  # Sani Upadhyay
    ("DCB0M86351", "CR1801260168", False, "All Set", True,  True,  False, True,  False),  # Mayuresh Thorat
    ("DCB0M75354", "CR1801260169", False, "All Set", True,  False, False, True,  True),   # Manoj Varma Sri Vatchavai
    ("DCB0M28354", None,           True,  "All Set", True,  False, True,  False, True),   # Vinay Yadati Nagaraj
    ("DCB0M12628", None,           True,  "All Set", True,  False, False, True,  False),  # Raj Kumar Saragadam
    ("DCB0M24057", None,           True,  "All Set", False, False, False, False, False),  # Dipanshu Sharma
    ("DCB0M42408", None,           True,  "All Set", True,  False, False, True,  True),   # Krishna Bhargav
    ("DCB0M34896", "CR1812250167", False, "All Set", True,  False, False, True,  False),  # Rakesh Sharma
    ("DCB0M73567", "CR1801260166", False, "All Set", True,  True,  False, True,  False),  # Shyam Chothani
    ("DCB0M44476", None,           False, "All Set", False, False, False, False, False),  # Roshan Neupane
    ("DCB0M91598", "CR1812250164", True,  "All Set", True,  True,  False, True,  True),   # Samir Patel
    ("DCB0M55166", "CR1812250161", False, "All Set", True,  True,  False, True,  False),  # Chirag Patel
    ("DCB0M16116", None,           False, "All Set", False, False, False, False, False),  # Rounak Maheshwari
    ("DCB0M75680", "CR1812250163", True,  "All Set", True,  True,  False, True,  True),   # Jeegar Bhalala
    ("DCB0M27099", None,           False, "All Set", False, False, False, False, False),  # Kuljit Arora
]

FEE_FIELDS = ("anmeldung", "dezember", "quarterly", "yearly", "sepa")


def run():
    db = SessionLocal()
    matched = 0
    unmatched = []

    for dcb_id, membership_no, id_card, spielerpass, *fees in ROWS:
        member = db.query(Member).filter(Member.dcb_id == dcb_id).first()
        if not member:
            unmatched.append(dcb_id)
            print(f"  MISS  {dcb_id}  — no member with this DCB ID")
            continue

        member.membership_no = membership_no
        member.id_card_received = id_card
        member.spielerpass = spielerpass

        payment = db.query(MemberPayment).filter(
            MemberPayment.member_id == member.id, MemberPayment.year == YEAR
        ).first()
        if not payment:
            payment = MemberPayment(member_id=member.id, year=YEAR)
            db.add(payment)
        for field, value in zip(FEE_FIELDS, fees):
            setattr(payment, field, value)

        matched += 1
        print(f"  OK    {dcb_id}  {member.name}")

    db.commit()
    db.close()

    print(f"\nDone — {matched} matched, {len(unmatched)} unmatched.")
    if unmatched:
        print("Unmatched DCB IDs (fix names/DCB IDs in the app, then re-run):")
        for d in unmatched:
            print(f"  - {d}")


if __name__ == "__main__":
    run()
