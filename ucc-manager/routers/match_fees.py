from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models.event import Event, EventAvailability
from models.member import Member
from models.match_fee import MatchFeePayment

router = APIRouter(prefix="/api/match-fees", tags=["match-fees"])


class FeeSet(BaseModel):
    amount: float


def _available_ids(event_id: int, db: Session) -> list[int]:
    return [a.member_id for a in
            db.query(EventAvailability)
            .filter(EventAvailability.event_id == event_id,
                    EventAvailability.status == "available").all()]


@router.get("")
def list_events(year: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(Event).filter(Event.type == "match")
    if year:
        query = query.filter(Event.date.between(f"{year}-01-01", f"{year}-12-31"))
    events = query.order_by(Event.date.desc()).all()
    if not events:
        return []

    event_ids = [ev.id for ev in events]
    avail_rows = db.query(EventAvailability).filter(
        EventAvailability.event_id.in_(event_ids),
        EventAvailability.status == "available",
    ).all()
    avail_by_event: dict[int, set] = {}
    for a in avail_rows:
        avail_by_event.setdefault(a.event_id, set()).add(a.member_id)

    payments = db.query(MatchFeePayment).filter(MatchFeePayment.event_id.in_(event_ids)).all()
    payments_by_event: dict[int, list] = {}
    for p in payments:
        payments_by_event.setdefault(p.event_id, []).append(p)

    result = []
    for ev in events:
        avail = avail_by_event.get(ev.id, set())
        total = len(avail)
        paid_count = sum(1 for p in payments_by_event.get(ev.id, []) if p.paid and p.member_id in avail)
        fee = float(ev.match_fee) if ev.match_fee is not None else None
        collected = round(paid_count * fee, 2) if fee is not None else 0.0
        outstanding = round((total - paid_count) * fee, 2) if fee is not None else 0.0
        result.append({
            "id": ev.id,
            "date": ev.date.isoformat(),
            "title": ev.title,
            "location": ev.location,
            "fee": fee,
            "paid_count": paid_count,
            "total_members": total,
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
    ids = _available_ids(event_id, db)
    if not ids:
        return []
    members = {m.id: m for m in db.query(Member).filter(Member.id.in_(ids)).all()}
    payments = {p.member_id: p for p in
                db.query(MatchFeePayment).filter(MatchFeePayment.event_id == event_id).all()}
    return [
        {
            "member_id": mid,
            "name": (members[mid].jersey_name or members[mid].name) if mid in members else f"Member {mid}",
            "paid": payments[mid].paid if mid in payments else False,
        }
        for mid in ids if mid in members
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
