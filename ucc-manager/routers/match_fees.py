from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models.event import Event
from models.member import Member
from models.match_fee import MatchFeePayment
from models.squad import EventSquad

router = APIRouter(prefix="/api/match-fees", tags=["match-fees"])


class FeeSet(BaseModel):
    amount: float


def _squad_ids(event_id: int, db: Session) -> list[int]:
    return [s.member_id for s in
            db.query(EventSquad)
            .filter(EventSquad.event_id == event_id)
            .order_by(EventSquad.batting_order).all()]


@router.get("")
def list_events(year: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(Event).filter(Event.type == "match")
    if year:
        query = query.filter(Event.date.between(f"{year}-01-01", f"{year}-12-31"))
    events = query.order_by(Event.date.desc()).all()
    if not events:
        return []

    event_ids = [ev.id for ev in events]
    squad_rows = db.query(EventSquad).filter(EventSquad.event_id.in_(event_ids)).all()
    squad_by_event: dict[int, set] = {}
    for s in squad_rows:
        squad_by_event.setdefault(s.event_id, set()).add(s.member_id)

    payments = db.query(MatchFeePayment).filter(MatchFeePayment.event_id.in_(event_ids)).all()
    payments_by_event: dict[int, list] = {}
    for p in payments:
        payments_by_event.setdefault(p.event_id, []).append(p)

    result = []
    for ev in events:
        squad = squad_by_event.get(ev.id, set())
        total = len(squad)
        paid_count = sum(1 for p in payments_by_event.get(ev.id, []) if p.paid and p.member_id in squad)
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
    ids = _squad_ids(event_id, db)
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
