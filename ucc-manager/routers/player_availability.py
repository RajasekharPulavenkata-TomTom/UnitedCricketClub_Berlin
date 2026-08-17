from datetime import date as date_type
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db
from models.player_availability import PlayerAvailability
from models.member import Member

router = APIRouter(prefix="/api/player-availability", tags=["player-availability"])


class AvailSet(BaseModel):
    member_id: int
    date: str        # YYYY-MM-DD
    status: str      # available | unavailable


@router.get("")
def get_availability(year: int, month: int, db: Session = Depends(get_db)):
    # half-open range keeps the filter sargable (extract() would force a full scan)
    start = date_type(year, month, 1)
    end = date_type(year + 1, 1, 1) if month == 12 else date_type(year, month + 1, 1)
    rows = (
        db.query(PlayerAvailability)
        .filter(PlayerAvailability.date >= start, PlayerAvailability.date < end)
        .all()
    )
    return [
        {"member_id": r.member_id, "date": str(r.date), "status": r.status}
        for r in rows
    ]


@router.put("")
def set_availability(data: AvailSet, db: Session = Depends(get_db)):
    if data.status not in ("available", "unavailable"):
        raise HTTPException(status_code=400, detail="status must be available or unavailable")
    member = db.query(Member).filter(Member.id == data.member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    rec = db.query(PlayerAvailability).filter(
        PlayerAvailability.member_id == data.member_id,
        PlayerAvailability.date == data.date,
    ).first()
    if rec:
        rec.status = data.status
    else:
        rec = PlayerAvailability(member_id=data.member_id, date=data.date, status=data.status)
        db.add(rec)
    db.commit()
    return {"ok": True}


@router.delete("")
def clear_availability(member_id: int, date: str, db: Session = Depends(get_db)):
    rec = db.query(PlayerAvailability).filter(
        PlayerAvailability.member_id == member_id,
        PlayerAvailability.date == date,
    ).first()
    if rec:
        db.delete(rec)
        db.commit()
    return {"ok": True}
