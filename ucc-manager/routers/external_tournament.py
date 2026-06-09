from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, selectinload
from database import get_db
from dependencies.auth import get_current_user
from models.auth import User
from models.external_tournament import ExternalTournament, ExternalTournamentPlayer
from schemas.external_tournament import (
    ExtTournamentCreate, ExtTournamentUpdate, ExtTournamentOut,
    ExtParticipantCreate, ExtParticipantUpdate,
)


class CaptainSet(BaseModel):
    captain_id: Optional[int] = None


def _require_captain_or_admin(user: User, captain_id) -> None:
    if user.role in ("admin", "root"):
        return
    if captain_id is None:
        return  # No captain set — any logged-in user can edit
    if user.member_id == captain_id:
        return
    raise HTTPException(status_code=403, detail="Only the captain or an admin can perform this action")

router = APIRouter(prefix="/api/ext-tournaments", tags=["ext-tournaments"])


def _get_or_404(db: Session, id: int) -> ExternalTournament:
    t = (
        db.query(ExternalTournament)
        .options(selectinload(ExternalTournament.players))
        .filter(ExternalTournament.id == id)
        .first()
    )
    if not t:
        raise HTTPException(status_code=404, detail="Tournament not found")
    return t


def _enrich(t: ExternalTournament) -> ExternalTournament:
    total_matches = sum(p.matches_played for p in t.players)
    cost_per_match = float(t.registration_fee or 0) / total_matches if total_matches else 0
    for p in t.players:
        p.fee_share = round(p.matches_played * cost_per_match, 2)
    return t


@router.get("", response_model=List[ExtTournamentOut])
def list_tournaments(db: Session = Depends(get_db)):
    return [_enrich(t) for t in (
        db.query(ExternalTournament)
        .options(selectinload(ExternalTournament.players))
        .order_by(ExternalTournament.start_date.desc())
        .all()
    )]


@router.post("", response_model=ExtTournamentOut, status_code=201)
def create_tournament(body: ExtTournamentCreate, db: Session = Depends(get_db)):
    t = ExternalTournament(**body.model_dump())
    db.add(t)
    db.commit()
    return _enrich(_get_or_404(db, t.id))


@router.get("/{id}", response_model=ExtTournamentOut)
def get_tournament(id: int, db: Session = Depends(get_db)):
    return _enrich(_get_or_404(db, id))


@router.put("/{id}", response_model=ExtTournamentOut)
def update_tournament(id: int, body: ExtTournamentUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    t = _get_or_404(db, id)
    _require_captain_or_admin(user, t.captain_id)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(t, field, value)
    db.commit()
    return _enrich(_get_or_404(db, id))


@router.delete("/{id}", status_code=204)
def delete_tournament(id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    t = _get_or_404(db, id)
    _require_captain_or_admin(user, t.captain_id)
    db.delete(t)
    db.commit()


@router.patch("/{id}/captain", response_model=ExtTournamentOut)
def set_captain(id: int, body: CaptainSet, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role not in ("admin", "root"):
        raise HTTPException(status_code=403, detail="Only an admin can assign the captain")
    t = _get_or_404(db, id)
    if body.captain_id is not None and not any(p.member_id == body.captain_id for p in t.players):
        raise HTTPException(status_code=400, detail="Captain must be a tournament player")
    t.captain_id = body.captain_id
    db.commit()
    return _enrich(_get_or_404(db, id))


@router.post("/{id}/players", response_model=ExtTournamentOut, status_code=201)
def add_player(id: int, body: ExtParticipantCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    t = _get_or_404(db, id)
    _require_captain_or_admin(user, t.captain_id)
    if any(p.member_id == body.member_id for p in t.players):
        raise HTTPException(status_code=400, detail="Player already in this tournament")
    db.add(ExternalTournamentPlayer(
        tournament_id=id,
        member_id=body.member_id,
        matches_played=body.matches_played,
    ))
    db.commit()
    return _enrich(_get_or_404(db, id))


@router.put("/{id}/players/{pid}", response_model=ExtTournamentOut)
def update_player(id: int, pid: int, body: ExtParticipantUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    t = _get_or_404(db, id)
    _require_captain_or_admin(user, t.captain_id)
    p = next((p for p in t.players if p.id == pid), None)
    if not p:
        raise HTTPException(status_code=404, detail="Player not found")
    if body.matches_played is not None:
        p.matches_played = body.matches_played
    db.commit()
    return _enrich(_get_or_404(db, id))


@router.patch("/{id}/players/{pid}/paid", response_model=ExtTournamentOut)
def toggle_paid(id: int, pid: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    t = _get_or_404(db, id)
    _require_captain_or_admin(user, t.captain_id)
    p = next((p for p in t.players if p.id == pid), None)
    if not p:
        raise HTTPException(status_code=404, detail="Player not found")
    p.paid = not p.paid
    db.commit()
    return _enrich(_get_or_404(db, id))


@router.delete("/{id}/players/{pid}", response_model=ExtTournamentOut)
def remove_player(id: int, pid: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    t = _get_or_404(db, id)
    _require_captain_or_admin(user, t.captain_id)
    p = next((p for p in t.players if p.id == pid), None)
    if not p:
        raise HTTPException(status_code=404, detail="Player not found")
    db.delete(p)
    db.commit()
    return _enrich(_get_or_404(db, id))
