from datetime import time as _time
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models.event import Event, EventAvailability
from models.member import Member
from models.reporting import PlayerReporting

router = APIRouter(prefix="/api/reporting", tags=["reporting"])


class ReportingUpdate(BaseModel):
    status: Optional[str] = None        # "unknown", "reported", "absent"
    reported_time: Optional[str] = None  # "HH:MM" or "" to clear


def _available_ids(event_id: int, db: Session) -> list[int]:
    return [a.member_id for a in
            db.query(EventAvailability)
            .filter(EventAvailability.event_id == event_id,
                    EventAvailability.status == "available").all()]


@router.get("")
def list_events(year: Optional[int] = None, event_type: str = "match", db: Session = Depends(get_db)):
    query = db.query(Event).filter(Event.type == event_type)
    if year:
        query = query.filter(Event.date.between(f"{year}-01-01", f"{year}-12-31"))
    events = query.order_by(Event.date.desc()).all()
    result = []
    for ev in events:
        avail = set(_available_ids(ev.id, db))
        total = len(avail)
        reports = db.query(PlayerReporting).filter(PlayerReporting.event_id == ev.id).all()
        reported_count = sum(1 for r in reports if r.status == "reported" and r.member_id in avail)
        absent_count   = sum(1 for r in reports if r.status == "absent"   and r.member_id in avail)
        result.append({
            "id": ev.id,
            "date": ev.date.isoformat(),
            "title": ev.title,
            "location": ev.location,
            "reporting_time": ev.reporting_time.strftime("%H:%M") if ev.reporting_time else None,
            "total_members": total,
            "reported_count": reported_count,
            "absent_count": absent_count,
        })
    return result


@router.get("/{event_id}/players")
def get_players(event_id: int, db: Session = Depends(get_db)):
    ids = _available_ids(event_id, db)
    if not ids:
        return []
    members = {m.id: m for m in db.query(Member).filter(Member.id.in_(ids)).all()}
    reports = {r.member_id: r for r in
               db.query(PlayerReporting).filter(PlayerReporting.event_id == event_id).all()}
    return [
        {
            "member_id": mid,
            "name": (members[mid].jersey_name or members[mid].name) if mid in members else f"Member {mid}",
            "status": reports[mid].status if mid in reports else "unknown",
            "reported_time": reports[mid].reported_time.strftime("%H:%M") if mid in reports and reports[mid].reported_time else None,
        }
        for mid in ids if mid in members
    ]


@router.patch("/{event_id}/players/{member_id}")
def update_reporting(event_id: int, member_id: int, data: ReportingUpdate, db: Session = Depends(get_db)):
    if not db.query(Event).filter(Event.id == event_id).first():
        raise HTTPException(status_code=404, detail="Event not found")
    rec = db.query(PlayerReporting).filter_by(event_id=event_id, member_id=member_id).first()
    if not rec:
        rec = PlayerReporting(event_id=event_id, member_id=member_id, status="unknown")
        db.add(rec)
    if data.status is not None:
        if data.status not in ("unknown", "reported", "absent"):
            raise HTTPException(status_code=400, detail="status must be unknown, reported, or absent")
        rec.status = data.status
    if data.reported_time is not None:
        if data.reported_time == "":
            rec.reported_time = None
        else:
            h, m_str = data.reported_time.split(":")
            rec.reported_time = _time(int(h), int(m_str))
    db.commit()
    return {
        "status": rec.status,
        "reported_time": rec.reported_time.strftime("%H:%M") if rec.reported_time else None,
    }
