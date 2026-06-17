from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from database import get_db
from models.event import Event, EventAvailability
from models.member import Member
from models.squad import EventSquad
from schemas.event import EventCreate, EventUpdate, AvailabilitySet, EventOut
from routers.audit import log
from models.auth import User
from dependencies.auth import get_current_user
from services.notification_service import notify_event_created as _notify_event

router = APIRouter(prefix="/api", tags=["events"])


def _attach_counts(events: list) -> list[dict]:
    result = []
    for e in events:
        counts = {"available": 0, "unavailable": 0, "maybe": 0}
        for a in e.availability:
            if a.status in counts:
                counts[a.status] += 1
        result.append({
            "id": e.id,
            "date": e.date,
            "title": e.title,
            "type": e.type,
            "location": e.location,
            "notes": e.notes,
            "reporting_time": e.reporting_time,
            "remarks": e.remarks,
            "match_type": e.match_type,
            "home_away": e.home_away,
            "match_time": e.match_time,
            "created_at": e.created_at,
            "available_count": counts["available"],
            "unavailable_count": counts["unavailable"],
            "maybe_count": counts["maybe"],
        })
    return result


@router.get("/events", response_model=List[EventOut])
def list_events(
    year: Optional[int] = None,
    month: Optional[int] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Event).options(joinedload(Event.availability))
    if year:
        q = q.filter(func.extract("year", Event.date) == year)
    if month:
        q = q.filter(func.extract("month", Event.date) == month)
    events = q.order_by(Event.date).all()
    return _attach_counts(events)


@router.post("/events", response_model=EventOut, status_code=201)
def create_event(data: EventCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    event = Event(**data.model_dump())
    db.add(event)
    db.flush()
    log(db, "added", "event", event.id, f"Event '{event.title}' on {event.date} added", user=current_user)
    db.commit()
    db.refresh(event)
    members = db.query(Member).filter(Member.is_active == True, Member.email.isnot(None)).all()
    _notify_event(
        event.title, str(event.date), event.type or "",
        event.location, str(event.match_time) if event.match_time else None,
        event.notes, [m.email for m in members],
    )
    return _attach_counts([event])[0]


@router.put("/events/{id}", response_model=EventOut)
def update_event(id: int, data: EventUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    event = db.query(Event).options(joinedload(Event.availability)).filter(Event.id == id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(event, field, value)
    log(db, "updated", "event", id, f"Event '{event.title}' on {event.date} updated", user=current_user)
    db.commit()
    event = db.query(Event).options(joinedload(Event.availability)).filter(Event.id == id).first()
    return _attach_counts([event])[0]


@router.delete("/events/{id}", status_code=204)
def delete_event(id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    event = db.query(Event).filter(Event.id == id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    log(db, "deleted", "event", id, f"Event '{event.title}' on {event.date} deleted", user=current_user)
    db.delete(event)
    db.commit()


@router.get("/events/{id}/availability")
def get_availability(id: int, db: Session = Depends(get_db)):
    event = db.query(Event).filter(Event.id == id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    members = db.query(Member).filter(Member.is_active == True).order_by(Member.name).all()
    avail_map = {a.member_id: a.status for a in event.availability}
    return [
        {
            "member_id": m.id,
            "member_name": m.jersey_name or m.name,
            "status": avail_map.get(m.id, "unknown"),
        }
        for m in members
    ]


@router.put("/events/{id}/availability/{member_id}", status_code=200)
def set_availability(id: int, member_id: int, data: AvailabilitySet, db: Session = Depends(get_db)):
    if data.status not in ("available", "unavailable", "maybe"):
        raise HTTPException(status_code=400, detail="status must be available, unavailable, or maybe")
    event = db.query(Event).filter(Event.id == id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    rec = db.query(EventAvailability).filter(
        EventAvailability.event_id == id,
        EventAvailability.member_id == member_id,
    ).first()
    if rec:
        rec.status = data.status
    else:
        rec = EventAvailability(event_id=id, member_id=member_id, status=data.status)
        db.add(rec)
    db.commit()
    return {"status": data.status}


@router.delete("/events/{id}/availability/{member_id}", status_code=204)
def clear_availability(id: int, member_id: int, db: Session = Depends(get_db)):
    rec = db.query(EventAvailability).filter(
        EventAvailability.event_id == id,
        EventAvailability.member_id == member_id,
    ).first()
    if rec:
        db.delete(rec)
        db.commit()


# ── Squad (Playing XI / Match Squad, up to 15) ────────────────────────────────

class SquadPlayer(BaseModel):
    member_id:    int
    batting_order: int

class SquadSet(BaseModel):
    squad: List[SquadPlayer]


@router.get("/events/{id}/squad")
def get_squad(id: int, db: Session = Depends(get_db)):
    rows = db.query(EventSquad).filter(EventSquad.event_id == id).order_by(EventSquad.batting_order).all()
    if not rows:
        return []
    member_map = {m.id: m for m in db.query(Member).filter(Member.id.in_([r.member_id for r in rows])).all()}
    return [
        {
            "member_id":     r.member_id,
            "name":          (member_map[r.member_id].jersey_name or member_map[r.member_id].name),
            "role":          member_map[r.member_id].role,
            "jersey_number": member_map[r.member_id].jersey_number,
            "batting_order": r.batting_order,
        }
        for r in rows if r.member_id in member_map
    ]


@router.put("/events/{id}/squad", status_code=200)
def set_squad(id: int, data: SquadSet, db: Session = Depends(get_db)):
    if not db.query(Event).filter(Event.id == id).first():
        raise HTTPException(status_code=404, detail="Event not found")
    if len(data.squad) > 15:
        raise HTTPException(status_code=400, detail="Squad cannot exceed 15 players")
    active_ids = {row[0] for row in db.query(Member.id).filter(Member.is_active == True).all()}
    invalid = [p.member_id for p in data.squad if p.member_id not in active_ids]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Invalid or inactive member IDs: {invalid}")
    db.query(EventSquad).filter(EventSquad.event_id == id).delete()
    for p in data.squad:
        db.add(EventSquad(event_id=id, member_id=p.member_id, batting_order=p.batting_order))
    db.commit()
    return {"ok": True}


@router.delete("/events/{id}/squad", status_code=204)
def clear_squad(id: int, db: Session = Depends(get_db)):
    db.query(EventSquad).filter(EventSquad.event_id == id).delete()
    db.commit()

