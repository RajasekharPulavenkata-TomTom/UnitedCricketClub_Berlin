from typing import Optional
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, selectinload
from database import get_db
from models.meeting import Meeting, MeetingAgendaItem, MeetingItemSecond
from models.auth import User
from dependencies.auth import get_current_user

router = APIRouter(prefix="/api/meetings", tags=["meetings"])


def _load(db: Session, meeting_id: int) -> Meeting | None:
    return (
        db.query(Meeting)
        .options(
            selectinload(Meeting.items)
            .selectinload(MeetingAgendaItem.seconds),
            selectinload(Meeting.items)
            .selectinload(MeetingAgendaItem.raised_by),
        )
        .filter(Meeting.id == meeting_id)
        .first()
    )


def _item_out(item: MeetingAgendaItem, current_user: User) -> dict:
    rb = item.raised_by
    return {
        "id":            item.id,
        "title":         item.title,
        "description":   item.description,
        "raised_by_id":  item.raised_by_id,
        "raised_by":     (rb.full_name or rb.username) if rb else "Unknown",
        "status":        item.status,
        "decision":      item.decision,
        "seconds_count": len(item.seconds),
        "has_seconded":  any(s.user_id == current_user.id for s in item.seconds),
        "created_at":    item.created_at.isoformat(),
    }


def _out(meeting: Meeting, current_user: User) -> dict:
    # Sort by seconds desc, then created_at asc
    items = sorted(meeting.items, key=lambda i: (-len(i.seconds), i.created_at))
    return {
        "id":           meeting.id,
        "title":        meeting.title,
        "meeting_date": meeting.meeting_date.isoformat(),
        "status":       meeting.status,
        "created_at":   meeting.created_at.isoformat(),
        "items":        [_item_out(i, current_user) for i in items],
    }


# ── Schemas ───────────────────────────────────────────────────────────────────

class MeetingCreate(BaseModel):
    title:        str
    meeting_date: date


class ItemCreate(BaseModel):
    title:       str
    description: Optional[str] = None


class ItemUpdate(BaseModel):
    status:   Optional[str] = None   # discussed | deferred | dropped | pending
    decision: Optional[str] = None
    title:    Optional[str] = None
    description: Optional[str] = None


# ── Meeting CRUD ──────────────────────────────────────────────────────────────

@router.get("")
def list_meetings(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    meetings = (
        db.query(Meeting)
        .options(
            selectinload(Meeting.items).selectinload(MeetingAgendaItem.seconds),
            selectinload(Meeting.items).selectinload(MeetingAgendaItem.raised_by),
        )
        .order_by(Meeting.meeting_date.desc())
        .all()
    )
    return [_out(m, current_user) for m in meetings]


@router.post("", status_code=201)
def create_meeting(
    data: MeetingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("manager", "developer"):
        raise HTTPException(status_code=403, detail="Admin access required")
    meeting = Meeting(
        title=data.title.strip(),
        meeting_date=data.meeting_date,
        status="upcoming",
        created_by_id=current_user.id,
    )
    db.add(meeting)
    db.commit()
    return _out(_load(db, meeting.id), current_user)


@router.get("/{meeting_id}")
def get_meeting(meeting_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    m = _load(db, meeting_id)
    if not m:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return _out(m, current_user)


@router.patch("/{meeting_id}/start")
def start_meeting(meeting_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role not in ("manager", "developer"):
        raise HTTPException(status_code=403, detail="Admin access required")
    m = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if m.status != "upcoming":
        raise HTTPException(status_code=400, detail="Meeting is not in upcoming status")
    m.status = "in_progress"
    db.commit()
    return _out(_load(db, meeting_id), current_user)


@router.patch("/{meeting_id}/complete")
def complete_meeting(meeting_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role not in ("manager", "developer"):
        raise HTTPException(status_code=403, detail="Admin access required")
    m = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if m.status != "in_progress":
        raise HTTPException(status_code=400, detail="Meeting is not in progress")
    m.status = "completed"
    db.commit()
    return _out(_load(db, meeting_id), current_user)


@router.delete("/{meeting_id}", status_code=204)
def delete_meeting(meeting_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role not in ("manager", "developer"):
        raise HTTPException(status_code=403, detail="Admin access required")
    m = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Meeting not found")
    db.delete(m)
    db.commit()


# ── Agenda items ──────────────────────────────────────────────────────────────

@router.post("/{meeting_id}/items", status_code=201)
def raise_item(
    meeting_id: int,
    data: ItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    m = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if m.status == "completed":
        raise HTTPException(status_code=400, detail="Cannot add items to a completed meeting")
    item = MeetingAgendaItem(
        meeting_id=meeting_id,
        title=data.title.strip(),
        description=data.description,
        raised_by_id=current_user.id,
        status="pending",
    )
    db.add(item)
    db.commit()
    return _out(_load(db, meeting_id), current_user)


@router.patch("/{meeting_id}/items/{item_id}")
def update_item(
    meeting_id: int,
    item_id: int,
    data: ItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    m = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Meeting not found")
    item = db.query(MeetingAgendaItem).filter_by(id=item_id, meeting_id=meeting_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Agenda item not found")

    is_admin = current_user.role in ("manager", "developer")
    is_owner = item.raised_by_id == current_user.id

    # Admins can update status/decision during or after meeting
    if data.status is not None or data.decision is not None:
        if not is_admin:
            raise HTTPException(status_code=403, detail="Admin access required to record decisions")
        if data.status is not None:
            if data.status not in ("pending", "discussed", "deferred", "dropped"):
                raise HTTPException(status_code=400, detail="Invalid status")
            item.status = data.status
        if data.decision is not None:
            item.decision = data.decision.strip() or None

    # Owners (or admin) can edit title/description while meeting is upcoming
    if data.title is not None or data.description is not None:
        if not (is_admin or is_owner):
            raise HTTPException(status_code=403, detail="You can only edit your own items")
        if m.status != "upcoming" and not is_admin:
            raise HTTPException(status_code=400, detail="Items can only be edited before the meeting starts")
        if data.title is not None:
            item.title = data.title.strip()
        if data.description is not None:
            item.description = data.description.strip() or None

    db.commit()
    return _out(_load(db, meeting_id), current_user)


@router.delete("/{meeting_id}/items/{item_id}", status_code=204)
def delete_item(
    meeting_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = db.query(MeetingAgendaItem).filter_by(id=item_id, meeting_id=meeting_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Agenda item not found")
    is_admin = current_user.role in ("manager", "developer")
    is_owner = item.raised_by_id == current_user.id
    if not (is_admin or is_owner):
        raise HTTPException(status_code=403, detail="You can only delete your own items")
    db.delete(item)
    db.commit()


# ── Seconding ─────────────────────────────────────────────────────────────────

@router.post("/{meeting_id}/items/{item_id}/second")
def second_item(
    meeting_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    m = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if m.status == "completed":
        raise HTTPException(status_code=400, detail="Meeting is already completed")
    item = db.query(MeetingAgendaItem).filter_by(id=item_id, meeting_id=meeting_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Agenda item not found")
    if item.raised_by_id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot second your own item")
    if db.query(MeetingItemSecond).filter_by(item_id=item_id, user_id=current_user.id).first():
        raise HTTPException(status_code=400, detail="You have already seconded this item")
    db.add(MeetingItemSecond(item_id=item_id, user_id=current_user.id))
    db.commit()
    return _out(_load(db, meeting_id), current_user)


@router.delete("/{meeting_id}/items/{item_id}/second")
def unsecond_item(
    meeting_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    second = db.query(MeetingItemSecond).filter_by(item_id=item_id, user_id=current_user.id).first()
    if not second:
        raise HTTPException(status_code=404, detail="You have not seconded this item")
    db.delete(second)
    db.commit()
    return _out(_load(db, meeting_id), current_user)
