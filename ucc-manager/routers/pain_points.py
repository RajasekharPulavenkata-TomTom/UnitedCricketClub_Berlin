from typing import Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models.pain_point import PainPoint
from models.auth import User
from dependencies.auth import get_current_user

router = APIRouter(prefix="/api/pain-points", tags=["pain-points"])

_CATEGORIES = {"gameplay", "facilities", "communication", "scheduling", "equipment", "other"}
_STATUSES = {"open", "discussed", "resolved"}


def _user_map(db: Session, items: list) -> dict:
    ids = {p.submitted_by_id for p in items if p.submitted_by_id}
    if not ids:
        return {}
    return {u.id: u for u in db.query(User).filter(User.id.in_(ids)).all()}


def _out(pp: PainPoint, current_user: User, umap: dict) -> dict:
    is_admin = current_user.role in ("manager", "developer")
    is_mine = pp.submitted_by_id == current_user.id
    u = umap.get(pp.submitted_by_id)
    if pp.is_anonymous:
        submitter = None
    else:
        submitter = (u.full_name or u.username) if u else None
    return {
        "id":              pp.id,
        "title":           pp.title,
        "description":     pp.description,
        "category":        pp.category,
        "is_anonymous":    pp.is_anonymous,
        "is_mine":         is_mine,
        "submitted_by":    submitter,
        "status":          pp.status,
        "discussion_note": pp.discussion_note,
        "resolution_note": pp.resolution_note,
        "created_at":      pp.created_at.isoformat() if pp.created_at else None,
        "resolved_at":     pp.resolved_at.isoformat() if pp.resolved_at else None,
    }


class PainPointCreate(BaseModel):
    title: str
    description: Optional[str] = None
    category: Optional[str] = None
    is_anonymous: bool = False


class PainPointUpdate(BaseModel):
    status: Optional[str] = None
    discussion_note: Optional[str] = None
    resolution_note: Optional[str] = None


@router.get("")
def list_pain_points(
    status: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(PainPoint)
    if status and status in _STATUSES:
        q = q.filter(PainPoint.status == status)
    if category and category in _CATEGORIES:
        q = q.filter(PainPoint.category == category)
    items = q.order_by(PainPoint.created_at.desc()).all()
    umap = _user_map(db, items)
    return [_out(pp, current_user, umap) for pp in items]


@router.post("", status_code=201)
def create_pain_point(
    data: PainPointCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    title = (data.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")
    pp = PainPoint(
        title=title,
        description=(data.description or "").strip() or None,
        category=data.category if data.category in _CATEGORIES else None,
        submitted_by_id=current_user.id,
        is_anonymous=data.is_anonymous,
    )
    db.add(pp)
    db.commit()
    db.refresh(pp)
    umap = _user_map(db, [pp])
    return _out(pp, current_user, umap)


@router.patch("/{pp_id}")
def update_pain_point(
    pp_id: int,
    data: PainPointUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("manager", "developer"):
        raise HTTPException(status_code=403, detail="Admin access required")
    pp = db.query(PainPoint).filter(PainPoint.id == pp_id).first()
    if not pp:
        raise HTTPException(status_code=404, detail="Pain point not found")
    if data.status is not None:
        if data.status not in _STATUSES:
            raise HTTPException(status_code=400, detail=f"Invalid status: {data.status}")
        pp.status = data.status
        pp.resolved_at = datetime.now(timezone.utc) if data.status == "resolved" else None
    if data.discussion_note is not None:
        pp.discussion_note = (data.discussion_note or "").strip() or None
    if data.resolution_note is not None:
        pp.resolution_note = (data.resolution_note or "").strip() or None
    db.commit()
    db.refresh(pp)
    umap = _user_map(db, [pp])
    return _out(pp, current_user, umap)


@router.delete("/{pp_id}", status_code=204)
def delete_pain_point(
    pp_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pp = db.query(PainPoint).filter(PainPoint.id == pp_id).first()
    if not pp:
        raise HTTPException(status_code=404, detail="Pain point not found")
    is_admin = current_user.role in ("manager", "developer")
    is_mine = pp.submitted_by_id == current_user.id
    if not is_admin and not (is_mine and pp.status == "open"):
        raise HTTPException(status_code=403, detail="You can only delete your own open pain points")
    db.delete(pp)
    db.commit()
