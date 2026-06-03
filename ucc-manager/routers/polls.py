from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models.poll import Poll, PollOption, PollVote
from models.auth import User
from dependencies.auth import get_current_user

router = APIRouter(prefix="/api/polls", tags=["polls"])


def _is_closed(poll: Poll) -> bool:
    if poll.is_closed:
        return True
    if poll.closes_at:
        closes = poll.closes_at
        if closes.tzinfo is None:
            closes = closes.replace(tzinfo=timezone.utc)
        if closes < datetime.now(timezone.utc):
            return True
    return False


def _poll_out(poll: Poll, current_user: User, db: Session) -> dict:
    closed = _is_closed(poll)
    vote = db.query(PollVote).filter(
        PollVote.poll_id == poll.id,
        PollVote.user_id == current_user.id,
    ).first()
    has_voted = vote is not None
    reveal = has_voted or closed
    total_votes = db.query(PollVote).filter(PollVote.poll_id == poll.id).count()

    creator = None
    if poll.created_by_id:
        u = db.query(User).filter(User.id == poll.created_by_id).first()
        if u:
            creator = u.full_name or u.username

    options = []
    for opt in poll.options:
        count = db.query(PollVote).filter(PollVote.option_id == opt.id).count() if reveal else None
        pct = round(count / total_votes * 100) if (reveal and total_votes > 0 and count is not None) else 0
        options.append({
            "id":         opt.id,
            "text":       opt.text,
            "position":   opt.position,
            "vote_count": count,
            "pct":        pct,
        })

    return {
        "id":             poll.id,
        "title":          poll.title,
        "description":    poll.description,
        "created_at":     poll.created_at.isoformat(),
        "closes_at":      poll.closes_at.isoformat() if poll.closes_at else None,
        "is_closed":      closed,
        "has_voted":      has_voted,
        "voted_option_id": vote.option_id if vote else None,
        "total_votes":    total_votes,
        "created_by":     creator,
        "options":        options,
    }


class PollOptionCreate(BaseModel):
    text: str
    position: int = 0


class PollCreate(BaseModel):
    title: str
    description: Optional[str] = None
    closes_at: Optional[datetime] = None
    options: List[PollOptionCreate]


class VoteCast(BaseModel):
    option_id: int


@router.get("")
def list_polls(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    polls = db.query(Poll).order_by(Poll.created_at.desc()).all()
    return [_poll_out(p, current_user, db) for p in polls]


@router.post("", status_code=201)
def create_poll(data: PollCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role not in ("admin", "root"):
        raise HTTPException(status_code=403, detail="Admin access required to create polls")
    if len(data.options) < 2:
        raise HTTPException(status_code=400, detail="A poll must have at least 2 options")
    texts = [o.text.strip() for o in data.options if o.text.strip()]
    if len(texts) < 2:
        raise HTTPException(status_code=400, detail="A poll must have at least 2 non-empty options")
    poll = Poll(
        title=data.title.strip(),
        description=data.description,
        closes_at=data.closes_at,
        created_by_id=current_user.id,
    )
    db.add(poll)
    db.flush()
    for i, opt in enumerate(data.options):
        if opt.text.strip():
            db.add(PollOption(poll_id=poll.id, text=opt.text.strip(), position=i))
    db.commit()
    db.refresh(poll)
    return _poll_out(poll, current_user, db)


@router.get("/{poll_id}")
def get_poll(poll_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    poll = db.query(Poll).filter(Poll.id == poll_id).first()
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    return _poll_out(poll, current_user, db)


@router.post("/{poll_id}/vote", status_code=200)
def cast_vote(poll_id: int, data: VoteCast, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    poll = db.query(Poll).filter(Poll.id == poll_id).first()
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    if _is_closed(poll):
        raise HTTPException(status_code=400, detail="This poll is closed")
    option = db.query(PollOption).filter(
        PollOption.id == data.option_id,
        PollOption.poll_id == poll_id,
    ).first()
    if not option:
        raise HTTPException(status_code=404, detail="Option not found")
    if db.query(PollVote).filter(PollVote.poll_id == poll_id, PollVote.user_id == current_user.id).first():
        raise HTTPException(status_code=400, detail="You have already voted in this poll")
    db.add(PollVote(poll_id=poll_id, option_id=data.option_id, user_id=current_user.id))
    db.commit()
    db.refresh(poll)
    return _poll_out(poll, current_user, db)


@router.patch("/{poll_id}/close", status_code=200)
def close_poll(poll_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role not in ("admin", "root"):
        raise HTTPException(status_code=403, detail="Admin access required")
    poll = db.query(Poll).filter(Poll.id == poll_id).first()
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    poll.is_closed = True
    db.commit()
    db.refresh(poll)
    return _poll_out(poll, current_user, db)


@router.delete("/{poll_id}", status_code=204)
def delete_poll(poll_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role not in ("admin", "root"):
        raise HTTPException(status_code=403, detail="Admin access required")
    poll = db.query(Poll).filter(Poll.id == poll_id).first()
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    db.delete(poll)
    db.commit()
