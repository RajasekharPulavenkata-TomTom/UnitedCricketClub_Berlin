from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from dependencies.auth import get_current_user
from models.auth import User
from models.tournament_feedback import TournamentFeedback
from models.member import Member
from models.external_tournament import ExternalTournament, ExternalTournamentPlayer
from models.internal_tournament import InternalTournament, InternalTournamentTeam, InternalTournamentTeamPlayer

router = APIRouter(prefix="/api/tournament-feedback", tags=["tournament-feedback"])

VALID_TYPES = {"external", "internal"}


class CaptainFeedbackIn(BaseModel):
    rating: int
    comment: Optional[str] = None


class PlayerFeedbackIn(BaseModel):
    rating: Optional[int] = None
    comment: Optional[str] = None


def _validate_type(t_type: str):
    if t_type not in VALID_TYPES:
        raise HTTPException(status_code=400, detail="Invalid tournament type")


def _get_tournament(db, t_type, t_id):
    if t_type == "external":
        t = db.query(ExternalTournament).filter(ExternalTournament.id == t_id).first()
    else:
        t = db.query(InternalTournament).filter(InternalTournament.id == t_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tournament not found")
    return t


def _get_player_ids(db, t_type, t_id) -> set:
    if t_type == "external":
        rows = db.query(ExternalTournamentPlayer).filter(ExternalTournamentPlayer.tournament_id == t_id).all()
        return {r.member_id for r in rows}
    else:
        team_ids = [r.id for r in db.query(InternalTournamentTeam).filter(InternalTournamentTeam.tournament_id == t_id).all()]
        if not team_ids:
            return set()
        rows = db.query(InternalTournamentTeamPlayer).filter(InternalTournamentTeamPlayer.team_id.in_(team_ids)).all()
        return {r.member_id for r in rows}


@router.get("/{t_type}/{t_id}/captain")
def get_captain_feedback(
    t_type: str,
    t_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _validate_type(t_type)
    _get_tournament(db, t_type, t_id)  # 404 check
    entries = db.query(TournamentFeedback).filter(
        TournamentFeedback.tournament_type == t_type,
        TournamentFeedback.tournament_id == t_id,
        TournamentFeedback.feedback_type == "captain",
    ).all()
    ratings = [e.rating for e in entries if e.rating]
    avg = round(sum(ratings) / len(ratings), 1) if ratings else None
    comments = [e.comment for e in entries if e.comment]
    my_entry = next((e for e in entries if e.reviewer_id == user.member_id), None)
    return {
        "avg_rating": avg,
        "count": len(entries),
        "comments": comments,
        "my_rating": my_entry.rating if my_entry else None,
        "my_comment": my_entry.comment if my_entry else None,
    }


@router.post("/{t_type}/{t_id}/captain", status_code=204)
def submit_captain_feedback(
    t_type: str,
    t_id: int,
    body: CaptainFeedbackIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _validate_type(t_type)
    if not user.member_id:
        raise HTTPException(status_code=400, detail="Your account is not linked to a member profile")
    if not (1 <= body.rating <= 5):
        raise HTTPException(status_code=400, detail="Rating must be 1–5")
    _get_tournament(db, t_type, t_id)
    entry = db.query(TournamentFeedback).filter(
        TournamentFeedback.tournament_type == t_type,
        TournamentFeedback.tournament_id == t_id,
        TournamentFeedback.feedback_type == "captain",
        TournamentFeedback.reviewer_id == user.member_id,
    ).first()
    if entry:
        entry.rating = body.rating
        entry.comment = body.comment
    else:
        db.add(TournamentFeedback(
            tournament_type=t_type,
            tournament_id=t_id,
            feedback_type="captain",
            reviewer_id=user.member_id,
            rating=body.rating,
            comment=body.comment,
        ))
    db.commit()


@router.get("/{t_type}/{t_id}/players")
def get_player_feedback(
    t_type: str,
    t_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _validate_type(t_type)
    _get_tournament(db, t_type, t_id)  # 404 check
    entries = db.query(TournamentFeedback).filter(
        TournamentFeedback.tournament_type == t_type,
        TournamentFeedback.tournament_id == t_id,
        TournamentFeedback.feedback_type == "player",
    ).all()
    player_ids = _get_player_ids(db, t_type, t_id)
    name_map = {m.id: m.name for m in db.query(Member).filter(Member.id.in_(player_ids)).all()}
    fb_map = {e.reviewed_id: e for e in entries}
    result = []
    for pid in player_ids:
        e = fb_map.get(pid)
        result.append({
            "member_id": pid,
            "member_name": name_map.get(pid, "Unknown"),
            "rating": e.rating if e else None,
            "comment": e.comment if e else None,
        })
    return sorted(result, key=lambda x: x["member_name"])


@router.put("/{t_type}/{t_id}/players/{member_id}", status_code=204)
def save_player_feedback(
    t_type: str,
    t_id: int,
    member_id: int,
    body: PlayerFeedbackIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _validate_type(t_type)
    t = _get_tournament(db, t_type, t_id)
    if user.role not in ("manager", "developer") and user.member_id != t.captain_id:
        raise HTTPException(status_code=403, detail="Only the captain can submit player reviews")
    if body.rating is not None and not (1 <= body.rating <= 5):
        raise HTTPException(status_code=400, detail="Rating must be 1–5")
    entry = db.query(TournamentFeedback).filter(
        TournamentFeedback.tournament_type == t_type,
        TournamentFeedback.tournament_id == t_id,
        TournamentFeedback.feedback_type == "player",
        TournamentFeedback.reviewed_id == member_id,
    ).first()
    if entry:
        entry.rating = body.rating
        entry.comment = body.comment
        entry.reviewer_id = user.member_id
    else:
        db.add(TournamentFeedback(
            tournament_type=t_type,
            tournament_id=t_id,
            feedback_type="player",
            reviewer_id=user.member_id,
            reviewed_id=member_id,
            rating=body.rating,
            comment=body.comment,
        ))
    db.commit()
