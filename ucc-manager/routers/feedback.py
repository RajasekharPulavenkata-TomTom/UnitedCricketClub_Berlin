from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, selectinload
from database import get_db
from models.feedback import FeedbackSession, FeedbackRating, FeedbackSubmitter, PILLARS
from models.auth import User
from dependencies.auth import get_current_user

router = APIRouter(prefix="/api/feedback-sessions", tags=["feedback"])


def _load(db: Session, session_id: int) -> FeedbackSession | None:
    return (
        db.query(FeedbackSession)
        .options(selectinload(FeedbackSession.ratings), selectinload(FeedbackSession.submitters))
        .filter(FeedbackSession.id == session_id)
        .first()
    )


def _out(fs: FeedbackSession, current_user: User) -> dict:
    closed        = fs.status == "closed"
    has_submitted = any(s.user_id == current_user.id for s in fs.submitters)
    reveal        = closed  # results only after window closes

    pillars_out = []
    for num, label, icon, color in PILLARS:
        rows = [r for r in fs.ratings if r.pillar == num]
        if reveal and rows:
            avg  = round(sum(r.rating for r in rows) / len(rows), 1)
            dist = {i: sum(1 for r in rows if r.rating == i) for i in range(1, 6)}
        else:
            avg  = None
            dist = None
        pillars_out.append({
            "number": num,
            "label":  label,
            "icon":   icon,
            "color":  color,
            "avg":    avg,
            "dist":   dist,
        })

    return {
        "id":               fs.id,
        "title":            fs.title,
        "election_id":      fs.election_id,
        "status":           fs.status,
        "created_at":       fs.created_at.isoformat(),
        "closed_at":        fs.closed_at.isoformat() if fs.closed_at else None,
        "has_submitted":    has_submitted,
        "submission_count": len(fs.submitters),
        "pillars":          pillars_out,
    }


class SessionCreate(BaseModel):
    title:       str
    election_id: Optional[int] = None


class RatingsSubmit(BaseModel):
    ratings: List[int]   # exactly 4 values, one per pillar, each 1–5


@router.get("")
def list_sessions(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    sessions = (
        db.query(FeedbackSession)
        .options(selectinload(FeedbackSession.ratings), selectinload(FeedbackSession.submitters))
        .order_by(FeedbackSession.created_at.desc())
        .all()
    )
    return [_out(s, current_user) for s in sessions]


@router.post("", status_code=201)
def create_session(
    data: SessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "root"):
        raise HTTPException(status_code=403, detail="Admin access required")
    if db.query(FeedbackSession).filter(FeedbackSession.status == "open").first():
        raise HTTPException(status_code=400, detail="A feedback session is already open. Close it before starting a new one.")

    fs = FeedbackSession(
        title=data.title.strip(),
        election_id=data.election_id,
        status="open",
        created_by_id=current_user.id,
    )
    db.add(fs)
    db.commit()
    return _out(_load(db, fs.id), current_user)


@router.get("/{session_id}")
def get_session(session_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    fs = _load(db, session_id)
    if not fs:
        raise HTTPException(status_code=404, detail="Feedback session not found")
    return _out(fs, current_user)


@router.post("/{session_id}/submit")
def submit_ratings(
    session_id: int,
    data: RatingsSubmit,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fs = db.query(FeedbackSession).filter(FeedbackSession.id == session_id).first()
    if not fs:
        raise HTTPException(status_code=404, detail="Feedback session not found")
    if fs.status != "open":
        raise HTTPException(status_code=400, detail="This feedback session is closed")
    if db.query(FeedbackSubmitter).filter_by(session_id=session_id, user_id=current_user.id).first():
        raise HTTPException(status_code=400, detail="You have already submitted feedback for this session")
    if len(data.ratings) != len(PILLARS):
        raise HTTPException(status_code=400, detail=f"Expected {len(PILLARS)} ratings, one per pillar")
    if any(r < 1 or r > 5 for r in data.ratings):
        raise HTTPException(status_code=400, detail="Each rating must be between 1 and 5")

    # Submitter table: WHO submitted (no link to ratings — preserves anonymity)
    db.add(FeedbackSubmitter(session_id=session_id, user_id=current_user.id))
    # Ratings table: WHAT was rated (no link to submitter — preserves anonymity)
    for pillar_num, rating in enumerate(data.ratings, start=1):
        db.add(FeedbackRating(session_id=session_id, pillar=pillar_num, rating=rating))
    db.commit()
    return _out(_load(db, session_id), current_user)


@router.patch("/{session_id}/close")
def close_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "root"):
        raise HTTPException(status_code=403, detail="Admin access required")
    fs = db.query(FeedbackSession).filter(FeedbackSession.id == session_id).first()
    if not fs:
        raise HTTPException(status_code=404, detail="Feedback session not found")
    if fs.status == "closed":
        raise HTTPException(status_code=400, detail="Session is already closed")
    fs.status    = "closed"
    fs.closed_at = datetime.now(timezone.utc)
    db.commit()
    return _out(_load(db, session_id), current_user)


@router.delete("/{session_id}", status_code=204)
def delete_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "root":
        raise HTTPException(status_code=403, detail="Root access required")
    fs = db.query(FeedbackSession).filter(FeedbackSession.id == session_id).first()
    if not fs:
        raise HTTPException(status_code=404, detail="Feedback session not found")
    db.delete(fs)
    db.commit()
