from datetime import date
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database import get_db
from models.member import Member
from models.member_payment import MemberPayment
from models.auth import User
from routers.audit import log
from dependencies.auth import get_current_user, require_admin

router = APIRouter(prefix="/api", tags=["member-payments"])

# Per-year fee amounts (euros). Used only to compute the totals row.
# A year with no entry falls back to the latest defined year.
FEE_AMOUNTS = {
    2026: {"anmeldung": 20, "dezember": 13, "quarterly": 45, "yearly": 156},
}
FEES = ("anmeldung", "dezember", "quarterly", "yearly")


def _amounts_for(year: int) -> dict:
    if year in FEE_AMOUNTS:
        return FEE_AMOUNTS[year]
    return FEE_AMOUNTS[max(FEE_AMOUNTS)]


class PaymentUpdate(BaseModel):
    anmeldung: Optional[bool] = None
    dezember: Optional[bool] = None
    quarterly: Optional[bool] = None
    yearly: Optional[bool] = None
    sepa: Optional[bool] = None
    notes: Optional[str] = None


@router.get("/member-payments")
def list_member_payments(
    year: int = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """All active members joined with their payment row for the given year, plus totals."""
    if year is None:
        year = date.today().year

    members = db.query(Member).filter(Member.is_active == True).order_by(Member.name).all()
    payments = {p.member_id: p for p in db.query(MemberPayment).filter(MemberPayment.year == year).all()}

    rows = []
    counts = {f: 0 for f in FEES}
    sepa_count = 0
    for m in members:
        p = payments.get(m.id)
        fees = {f: bool(getattr(p, f)) if p else False for f in FEES}
        sepa = bool(p.sepa) if p else False
        for f in FEES:
            if fees[f]:
                counts[f] += 1
        if sepa:
            sepa_count += 1
        rows.append({
            "member_id": m.id,
            "name": m.name,
            "membership_no": m.membership_no,
            "dcb_id": m.dcb_id,
            "id_card_received": m.id_card_received,
            "spielerpass": m.spielerpass,
            **fees,
            "sepa": sepa,
            "notes": p.notes if p else None,
        })

    amounts = _amounts_for(year)
    total = sum(counts[f] * amounts.get(f, 0) for f in FEES)
    totals = {
        "counts": counts,
        "sepa": sepa_count,
        "amounts": amounts,
        "total_paid": total,
    }
    return {"year": year, "members": rows, "totals": totals}


@router.put("/member-payments/{member_id}")
def upsert_member_payment(
    member_id: int,
    data: PaymentUpdate,
    year: int = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if year is None:
        year = date.today().year
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    payment = db.query(MemberPayment).filter(
        MemberPayment.member_id == member_id, MemberPayment.year == year
    ).first()
    if not payment:
        payment = MemberPayment(member_id=member_id, year=year)
        db.add(payment)

    updates = data.model_dump(exclude_none=True)
    for field, value in updates.items():
        setattr(payment, field, value)

    log(db, "updated", "member_payment", member_id,
        f"Payments for '{member.name}' ({year}) updated", user=current_user)
    db.commit()
    db.refresh(payment)
    return {
        "member_id": member_id,
        "year": year,
        "anmeldung": payment.anmeldung,
        "dezember": payment.dezember,
        "quarterly": payment.quarterly,
        "yearly": payment.yearly,
        "sepa": payment.sepa,
        "notes": payment.notes,
    }
