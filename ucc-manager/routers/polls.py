from typing import List, Optional
from collections import Counter
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload
from database import get_db
from models.poll import Poll, PollOption, PollVote, PollAnonymousVoter
from models.auth import User
from models.member import Member
from dependencies.auth import get_current_user
from services.notification_service import notify_poll_published as _notify_poll

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


def _vote_aggregates(db: Session, poll_ids: list[int], user_id: int) -> dict:
    """Per-poll vote counts, voter counts and this-user's votes, computed in
    SQL — never loads a row per vote."""
    agg = {
        pid: {
            "option_counts": Counter(), "named_voter_count": 0, "anon_voter_count": 0,
            "anon_has_voted": False, "voted_option_ids": [],
        }
        for pid in poll_ids
    }
    if not poll_ids:
        return agg
    for pid, oid, count in (
        db.query(PollVote.poll_id, PollVote.option_id, func.count())
        .filter(PollVote.poll_id.in_(poll_ids))
        .group_by(PollVote.poll_id, PollVote.option_id)
    ):
        agg[pid]["option_counts"][oid] = count
    for pid, count in (
        db.query(PollVote.poll_id, func.count(func.distinct(PollVote.user_id)))
        .filter(PollVote.poll_id.in_(poll_ids), PollVote.user_id.isnot(None))
        .group_by(PollVote.poll_id)
    ):
        agg[pid]["named_voter_count"] = count
    for pid, count in (
        db.query(PollAnonymousVoter.poll_id, func.count())
        .filter(PollAnonymousVoter.poll_id.in_(poll_ids))
        .group_by(PollAnonymousVoter.poll_id)
    ):
        agg[pid]["anon_voter_count"] = count
    for (pid,) in (
        db.query(PollAnonymousVoter.poll_id)
        .filter(PollAnonymousVoter.poll_id.in_(poll_ids), PollAnonymousVoter.user_id == user_id)
    ):
        agg[pid]["anon_has_voted"] = True
    for pid, oid in (
        db.query(PollVote.poll_id, PollVote.option_id)
        .filter(PollVote.poll_id.in_(poll_ids), PollVote.user_id == user_id)
    ):
        agg[pid]["voted_option_ids"].append(oid)
    return agg


def _poll_out(poll: Poll, current_user: User, creator_map: dict, agg: dict) -> dict:
    closed = _is_closed(poll)

    if poll.is_anonymous:
        has_voted        = agg["anon_has_voted"]
        voted_option_ids = []
        voter_count      = agg["anon_voter_count"]
    else:
        voted_option_ids = agg["voted_option_ids"]
        has_voted        = len(voted_option_ids) > 0
        voter_count      = agg["named_voter_count"]

    reveal = has_voted or closed

    u       = creator_map.get(poll.created_by_id)
    creator = (u.full_name or u.username) if u else None

    options = []
    for opt in poll.options:
        count = agg["option_counts"][opt.id] if reveal else None
        pct   = round(count / voter_count * 100) if (reveal and voter_count > 0 and count is not None) else 0
        options.append({
            "id":         opt.id,
            "text":       opt.text,
            "position":   opt.position,
            "vote_count": count,
            "pct":        pct,
        })

    return {
        "id":               poll.id,
        "title":            poll.title,
        "description":      poll.description,
        "is_anonymous":     poll.is_anonymous,
        "allow_multiple":   poll.allow_multiple,
        "created_at":       poll.created_at.isoformat(),
        "closes_at":        poll.closes_at.isoformat() if poll.closes_at else None,
        "is_closed":        closed,
        "has_voted":        has_voted,
        "voted_option_ids": voted_option_ids,
        "voter_count":      voter_count,
        "created_by":       creator,
        "options":          options,
    }


def _load_poll(db: Session, poll_id: int) -> Poll | None:
    return (
        db.query(Poll)
        .options(selectinload(Poll.options))
        .filter(Poll.id == poll_id)
        .first()
    )


def _poll_out_single(db: Session, poll: Poll, current_user: User) -> dict:
    creators = _creator_map(db, [poll])
    agg = _vote_aggregates(db, [poll.id], current_user.id)[poll.id]
    return _poll_out(poll, current_user, creators, agg)


def _creator_map(db: Session, polls: list) -> dict:
    ids = {p.created_by_id for p in polls if p.created_by_id}
    if not ids:
        return {}
    return {u.id: u for u in db.query(User).filter(User.id.in_(ids)).all()}


class PollOptionCreate(BaseModel):
    text: str
    position: int = 0


class PollCreate(BaseModel):
    title:          str
    description:    Optional[str] = None
    closes_at:      Optional[datetime] = None
    is_anonymous:   bool = False
    allow_multiple: bool = False
    options:        List[PollOptionCreate]


class VoteCast(BaseModel):
    option_ids: List[int]


class PollOptionUpdate(BaseModel):
    text: str
    position: int = 0


class PollUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    closes_at: Optional[datetime] = None
    options: Optional[List[PollOptionUpdate]] = None


@router.get("")
def list_polls(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    polls = (
        db.query(Poll)
        .options(selectinload(Poll.options))
        .order_by(Poll.created_at.desc())
        .all()
    )
    creators = _creator_map(db, polls)
    agg = _vote_aggregates(db, [p.id for p in polls], current_user.id)
    return [_poll_out(p, current_user, creators, agg[p.id]) for p in polls]


@router.post("", status_code=201)
def create_poll(data: PollCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role not in ("manager", "developer"):
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
        is_anonymous=data.is_anonymous,
        allow_multiple=data.allow_multiple,
        created_by_id=current_user.id,
    )
    db.add(poll)
    db.flush()
    for i, opt in enumerate(data.options):
        if opt.text.strip():
            db.add(PollOption(poll_id=poll.id, text=opt.text.strip(), position=i))
    db.commit()
    poll = _load_poll(db, poll.id)
    members = db.query(Member).filter(Member.is_active == True, Member.email.isnot(None)).all()
    _notify_poll(
        poll.title, poll.description,
        [opt.text for opt in poll.options],
        [m.email for m in members],
    )
    return _poll_out_single(db, poll, current_user)


@router.get("/{poll_id}")
def get_poll(poll_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    poll = _load_poll(db, poll_id)
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    return _poll_out_single(db, poll, current_user)


@router.post("/{poll_id}/vote", status_code=200)
def cast_vote(poll_id: int, data: VoteCast, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    poll = db.query(Poll).filter(Poll.id == poll_id).first()
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    if _is_closed(poll):
        raise HTTPException(status_code=400, detail="This poll is closed")
    option_ids = list(dict.fromkeys(data.option_ids))  # deduplicate, preserve order
    if not option_ids:
        raise HTTPException(status_code=400, detail="Select at least one option")
    if not poll.allow_multiple and len(option_ids) > 1:
        raise HTTPException(status_code=400, detail="This poll only allows one selection")

    valid_ids = {o.id for o in db.query(PollOption).filter(PollOption.poll_id == poll_id).all()}
    for oid in option_ids:
        if oid not in valid_ids:
            raise HTTPException(status_code=404, detail=f"Option {oid} not found in this poll")

    if poll.is_anonymous:
        if db.query(PollAnonymousVoter).filter_by(poll_id=poll_id, user_id=current_user.id).first():
            raise HTTPException(status_code=400, detail="You have already voted in this poll")
        db.add(PollAnonymousVoter(poll_id=poll_id, user_id=current_user.id))
        for oid in option_ids:
            db.add(PollVote(poll_id=poll_id, option_id=oid, user_id=None))
    else:
        if db.query(PollVote).filter(PollVote.poll_id == poll_id, PollVote.user_id == current_user.id).first():
            raise HTTPException(status_code=400, detail="You have already voted in this poll")
        for oid in option_ids:
            db.add(PollVote(poll_id=poll_id, option_id=oid, user_id=current_user.id))

    db.commit()
    poll = _load_poll(db, poll_id)
    return _poll_out_single(db, poll, current_user)


@router.put("/{poll_id}/vote", status_code=200)
def change_vote(poll_id: int, data: VoteCast, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    poll = db.query(Poll).filter(Poll.id == poll_id).first()
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    if _is_closed(poll):
        raise HTTPException(status_code=400, detail="This poll is closed")
    if poll.is_anonymous:
        raise HTTPException(status_code=400, detail="Cannot change vote on an anonymous poll")

    option_ids = list(dict.fromkeys(data.option_ids))
    if not option_ids:
        raise HTTPException(status_code=400, detail="Select at least one option")
    if not poll.allow_multiple and len(option_ids) > 1:
        raise HTTPException(status_code=400, detail="This poll only allows one selection")

    valid_ids = {o.id for o in db.query(PollOption).filter(PollOption.poll_id == poll_id).all()}
    for oid in option_ids:
        if oid not in valid_ids:
            raise HTTPException(status_code=404, detail=f"Option {oid} not found in this poll")

    existing = db.query(PollVote).filter(PollVote.poll_id == poll_id, PollVote.user_id == current_user.id).all()
    if not existing:
        raise HTTPException(status_code=400, detail="You haven't voted in this poll yet")

    for vote in existing:
        db.delete(vote)
    db.flush()
    for oid in option_ids:
        db.add(PollVote(poll_id=poll_id, option_id=oid, user_id=current_user.id))

    db.commit()
    poll = _load_poll(db, poll_id)
    return _poll_out_single(db, poll, current_user)


@router.patch("/{poll_id}", status_code=200)
def update_poll(poll_id: int, data: PollUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role not in ("manager", "developer"):
        raise HTTPException(status_code=403, detail="Admin access required")
    poll = db.query(Poll).filter(Poll.id == poll_id).first()
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    if _is_closed(poll):
        raise HTTPException(status_code=400, detail="Cannot edit a closed poll")

    if "title" in data.model_fields_set and data.title:
        poll.title = data.title.strip()
    if "description" in data.model_fields_set:
        poll.description = data.description or None
    if "closes_at" in data.model_fields_set:
        poll.closes_at = data.closes_at

    if data.options is not None:
        vote_count = db.query(PollVote).filter(PollVote.poll_id == poll_id).count()
        if vote_count > 0:
            raise HTTPException(status_code=400, detail="Cannot change options after voting has started")
        texts = [o.text.strip() for o in data.options if o.text.strip()]
        if len(texts) < 2:
            raise HTTPException(status_code=400, detail="A poll must have at least 2 non-empty options")
        db.query(PollOption).filter(PollOption.poll_id == poll_id).delete()
        db.flush()
        for i, opt in enumerate(data.options):
            if opt.text.strip():
                db.add(PollOption(poll_id=poll_id, text=opt.text.strip(), position=i))

    db.commit()
    poll = _load_poll(db, poll_id)
    return _poll_out_single(db, poll, current_user)


@router.patch("/{poll_id}/close", status_code=200)
def close_poll(poll_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role not in ("manager", "developer"):
        raise HTTPException(status_code=403, detail="Admin access required")
    poll = db.query(Poll).filter(Poll.id == poll_id).first()
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    poll.is_closed = True
    db.commit()
    poll = _load_poll(db, poll_id)
    return _poll_out_single(db, poll, current_user)


@router.delete("/{poll_id}", status_code=204)
def delete_poll(poll_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role not in ("manager", "developer"):
        raise HTTPException(status_code=403, detail="Admin access required")
    poll = db.query(Poll).filter(Poll.id == poll_id).first()
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    db.delete(poll)
    db.commit()
