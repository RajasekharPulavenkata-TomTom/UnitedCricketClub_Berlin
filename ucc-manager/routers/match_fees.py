from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models.event import Event
from models.member import Member
from models.match_fee import MatchFeePayment

router = APIRouter(prefix="/api/match-fees", tags=["match-fees"])


class FeeSet(BaseModel):
    amount: float


@router.get("")
def list_events(year: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(Event).filter(Event.type == "match")
    if year:
        query = query.filter(Event.date.between(f"{year}-01-01", f"{year}-12-31"))
    events = query.order_by(Event.date.desc()).all()

    total_active = db.query(Member).filter(Member.is_active == True).count()

    result = []
    for ev in events:
        payments = db.query(MatchFeePayment).filter(MatchFeePayment.event_id == ev.id).all()
        paid_count = sum(1 for p in payments if p.paid)
        fee = float(ev.match_fee) if ev.match_fee is not None else None
        collected = round(paid_count * fee, 2) if fee is not None else 0.0
        outstanding = round((total_active - paid_count) * fee, 2) if fee is not None else 0.0
        result.append({
            "id": ev.id,
            "date": ev.date.isoformat(),
            "title": ev.title,
            "location": ev.location,
            "fee": fee,
            "paid_count": paid_count,
            "total_members": total_active,
            "collected": collected,
            "outstanding": outstanding,
        })
    return result


@router.put("/{event_id}/fee")
def set_fee(event_id: int, data: FeeSet, db: Session = Depends(get_db)):
    ev = db.query(Event).filter(Event.id == event_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")
    ev.match_fee = data.amount
    db.commit()
    return {"ok": True}


@router.get("/{event_id}/payments")
def get_payments(event_id: int, db: Session = Depends(get_db)):
    active_members = db.query(Member).filter(Member.is_active == True).order_by(Member.name).all()
    payments = {p.member_id: p for p in db.query(MatchFeePayment).filter(MatchFeePayment.event_id == event_id).all()}
    return [
        {
            "member_id": m.id,
            "name": m.jersey_name or m.name,
            "paid": payments[m.id].paid if m.id in payments else False,
        }
        for m in active_members
    ]


@router.patch("/{event_id}/payments/{member_id}")
def toggle_payment(event_id: int, member_id: int, db: Session = Depends(get_db)):
    if not db.query(Event).filter(Event.id == event_id).first():
        raise HTTPException(status_code=404, detail="Event not found")
    payment = db.query(MatchFeePayment).filter_by(event_id=event_id, member_id=member_id).first()
    if payment:
        payment.paid = not payment.paid
        payment.paid_at = datetime.now(timezone.utc) if payment.paid else None
    else:
        payment = MatchFeePayment(event_id=event_id, member_id=member_id,
                                  paid=True, paid_at=datetime.now(timezone.utc))
        db.add(payment)
    db.commit()
    return {"paid": payment.paid}
