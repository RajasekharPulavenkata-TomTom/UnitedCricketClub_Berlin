from datetime import time as _time
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models.event import Event, EventAvailability
from models.member import Member
from models.reporting import PlayerReporting
from models.squad import EventSquad

router = APIRouter(prefix="/api/reporting", tags=["reporting"])


class ReportingUpdate(BaseModel):
    status: Optional[str] = None        # "unknown", "reported", "absent"
    reported_time: Optional[str] = None  # "HH:MM" or "" to clear
    remarks: Optional[str] = None


def _squad_ids(event_id: int, db: Session) -> list[int]:
    return [s.member_id for s in
            db.query(EventSquad)
            .filter(EventSquad.event_id == event_id)
            .order_by(EventSquad.batting_order).all()]


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
    if not events:
        return []

    event_ids = [ev.id for ev in events]

    if event_type == "match":
        squad_rows = db.query(EventSquad).filter(EventSquad.event_id.in_(event_ids)).all()
        member_by_event: dict[int, set] = {}
        for s in squad_rows:
            member_by_event.setdefault(s.event_id, set()).add(s.member_id)
    else:
        avail_rows = db.query(EventAvailability).filter(
            EventAvailability.event_id.in_(event_ids),
            EventAvailability.status == "available",
        ).all()
        member_by_event: dict[int, set] = {}
        for a in avail_rows:
            member_by_event.setdefault(a.event_id, set()).add(a.member_id)

    report_rows = db.query(PlayerReporting).filter(PlayerReporting.event_id.in_(event_ids)).all()
    reports_by_event: dict[int, list] = {}
    for r in report_rows:
        reports_by_event.setdefault(r.event_id, []).append(r)

    result = []
    for ev in events:
        members = member_by_event.get(ev.id, set())
        reports = reports_by_event.get(ev.id, [])
        result.append({
            "id": ev.id,
            "date": ev.date.isoformat(),
            "title": ev.title,
            "location": ev.location,
            "reporting_time": ev.reporting_time.strftime("%H:%M") if ev.reporting_time else None,
            "total_members": len(members),
            "reported_count": sum(1 for r in reports if r.status == "reported" and r.member_id in members),
            "absent_count":   sum(1 for r in reports if r.status == "absent"   and r.member_id in members),
            "remarks": ev.remarks or "",
        })
    return result


@router.get("/{event_id}/players")
def get_players(event_id: int, db: Session = Depends(get_db)):
    ev = db.query(Event).filter(Event.id == event_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")
    ids = _squad_ids(event_id, db) if ev.type == "match" else _available_ids(event_id, db)
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
            "remarks": reports[mid].remarks or "" if mid in reports else "",
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
            try:
                h, m_str = data.reported_time.split(":")
                rec.reported_time = _time(int(h), int(m_str))
            except (ValueError, TypeError):
                raise HTTPException(status_code=400, detail="reported_time must be HH:MM")
    if data.remarks is not None:
        rec.remarks = data.remarks
    db.commit()
    return {
        "status": rec.status,
        "reported_time": rec.reported_time.strftime("%H:%M") if rec.reported_time else None,
        "remarks": rec.remarks or "",
    }
