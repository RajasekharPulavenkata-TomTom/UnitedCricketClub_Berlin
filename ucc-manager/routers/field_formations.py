from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models.field_formation import FieldFormation
from models.event import Event
from models.auth import User
from dependencies.auth import get_current_user

router = APIRouter(prefix="/api/field-formations", tags=["field-formations"])


def _out(f: FieldFormation, event: Event | None = None) -> dict:
    return {
        "id":            f.id,
        "name":          f.name,
        "event_id":      f.event_id,
        "event_title":   event.title if event else None,
        "positions":     f.positions or [],
        "notes":         f.notes,
        "created_by_id": f.created_by_id,
        "created_at":    f.created_at.isoformat() if f.created_at else None,
        "updated_at":    f.updated_at.isoformat() if f.updated_at else None,
    }


class PlayerPosition(BaseModel):
    member_id:   Optional[int] = None
    jersey_name: str
    x:           float
    y:           float


class FormationIn(BaseModel):
    name:      str
    event_id:  Optional[int] = None
    positions: List[PlayerPosition] = []
    notes:     Optional[str] = None


@router.get("")
def list_formations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    formations = db.query(FieldFormation).order_by(FieldFormation.updated_at.desc()).all()
    event_ids = {f.event_id for f in formations if f.event_id}
    events = (
        {e.id: e for e in db.query(Event).filter(Event.id.in_(event_ids)).all()}
        if event_ids else {}
    )
    return [_out(f, events.get(f.event_id)) for f in formations]


@router.post("", status_code=201)
def create_formation(
    data: FormationIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if data.event_id:
        if not db.query(Event).filter(Event.id == data.event_id).first():
            raise HTTPException(404, "Event not found")
    f = FieldFormation(
        name=data.name.strip(),
        event_id=data.event_id,
        positions=[p.model_dump() for p in data.positions],
        notes=(data.notes or "").strip() or None,
        created_by_id=current_user.id,
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return _out(f)


@router.put("/{fid}")
def update_formation(
    fid: int,
    data: FormationIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    f = db.query(FieldFormation).filter(FieldFormation.id == fid).first()
    if not f:
        raise HTTPException(404, "Formation not found")
    is_admin = current_user.role in ("admin", "root")
    if f.created_by_id != current_user.id and not is_admin:
        raise HTTPException(403, "Not allowed")
    if data.event_id and data.event_id != f.event_id:
        if not db.query(Event).filter(Event.id == data.event_id).first():
            raise HTTPException(404, "Event not found")
    f.name      = data.name.strip()
    f.event_id  = data.event_id
    f.positions = [p.model_dump() for p in data.positions]
    f.notes     = (data.notes or "").strip() or None
    db.commit()
    db.refresh(f)
    return _out(f)


@router.delete("/{fid}", status_code=204)
def delete_formation(
    fid: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    f = db.query(FieldFormation).filter(FieldFormation.id == fid).first()
    if not f:
        raise HTTPException(404, "Formation not found")
    is_admin = current_user.role in ("admin", "root")
    if f.created_by_id != current_user.id and not is_admin:
        raise HTTPException(403, "Not allowed")
    db.delete(f)
    db.commit()
