from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, selectinload
from database import get_db
from dependencies.auth import get_current_user
from models.auth import User
from models.internal_tournament import InternalTournament, InternalTournamentTeam, InternalTournamentTeamPlayer
from schemas.internal_tournament import (
    IntTournamentCreate, IntTournamentUpdate, IntTournamentOut,
    IntTeamCreate, IntTeamPlayerCreate,
)


class TournamentCaptainSet(BaseModel):
    captain_id: Optional[int] = None


class TeamCaptainSet(BaseModel):
    captain_id: Optional[int] = None


def _require_captain_or_admin(user: User, captain_id) -> None:
    if user.role in ("admin", "root"):
        return
    if captain_id is None:
        return
    if user.member_id == captain_id:
        return
    raise HTTPException(status_code=403, detail="Only the captain or an admin can perform this action")

router = APIRouter(prefix="/api/int-tournaments", tags=["int-tournaments"])


def _get_or_404(db: Session, id: int) -> InternalTournament:
    t = (
        db.query(InternalTournament)
        .options(selectinload(InternalTournament.teams).selectinload(InternalTournamentTeam.players))
        .filter(InternalTournament.id == id)
        .first()
    )
    if not t:
        raise HTTPException(status_code=404, detail="Tournament not found")
    return t


@router.get("", response_model=List[IntTournamentOut])
def list_tournaments(db: Session = Depends(get_db)):
    return (
        db.query(InternalTournament)
        .options(selectinload(InternalTournament.teams).selectinload(InternalTournamentTeam.players))
        .order_by(InternalTournament.start_date.desc())
        .all()
    )


@router.post("", response_model=IntTournamentOut, status_code=201)
def create_tournament(body: IntTournamentCreate, db: Session = Depends(get_db)):
    t = InternalTournament(**body.model_dump())
    db.add(t)
    db.commit()
    db.refresh(t)
    return _get_or_404(db, t.id)


@router.get("/{id}", response_model=IntTournamentOut)
def get_tournament(id: int, db: Session = Depends(get_db)):
    return _get_or_404(db, id)


@router.put("/{id}", response_model=IntTournamentOut)
def update_tournament(id: int, body: IntTournamentUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    t = _get_or_404(db, id)
    _require_captain_or_admin(user, t.captain_id)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(t, field, value)
    db.commit()
    return _get_or_404(db, id)


@router.delete("/{id}", status_code=204)
def delete_tournament(id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    t = _get_or_404(db, id)
    _require_captain_or_admin(user, t.captain_id)
    db.delete(t)
    db.commit()


@router.patch("/{id}/captain", response_model=IntTournamentOut)
def set_tournament_captain(id: int, body: TournamentCaptainSet, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role not in ("admin", "root"):
        raise HTTPException(status_code=403, detail="Only an admin can assign the captain")
    t = _get_or_404(db, id)
    t.captain_id = body.captain_id
    db.commit()
    return _get_or_404(db, id)


# ── Teams ─────────────────────────────────────────────────────────────────────

@router.post("/{id}/teams", response_model=IntTournamentOut, status_code=201)
def add_team(id: int, body: IntTeamCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    t = _get_or_404(db, id)
    _require_captain_or_admin(user, t.captain_id)
    if any(team.name.lower() == body.name.lower() for team in t.teams):
        raise HTTPException(status_code=400, detail="A team with this name already exists")
    db.add(InternalTournamentTeam(tournament_id=id, name=body.name.strip()))
    db.commit()
    return _get_or_404(db, id)


@router.delete("/{id}/teams/{tid}", response_model=IntTournamentOut)
def remove_team(id: int, tid: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    t = _get_or_404(db, id)
    _require_captain_or_admin(user, t.captain_id)
    team = next((team for team in t.teams if team.id == tid), None)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    db.delete(team)
    db.commit()
    return _get_or_404(db, id)


@router.patch("/{id}/teams/{tid}/captain", response_model=IntTournamentOut)
def set_team_captain(id: int, tid: int, body: TeamCaptainSet, db: Session = Depends(get_db)):
    t = _get_or_404(db, id)
    team = next((team for team in t.teams if team.id == tid), None)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    if body.captain_id is not None and not any(p.member_id == body.captain_id for p in team.players):
        raise HTTPException(status_code=400, detail="Captain must be a team player")
    team.captain_id = body.captain_id
    db.commit()
    return _get_or_404(db, id)


# ── Team players ──────────────────────────────────────────────────────────────

@router.post("/{id}/teams/{tid}/players", response_model=IntTournamentOut, status_code=201)
def add_team_player(id: int, tid: int, body: IntTeamPlayerCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    t = _get_or_404(db, id)
    _require_captain_or_admin(user, t.captain_id)
    team = next((team for team in t.teams if team.id == tid), None)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    for other_team in t.teams:
        if any(p.member_id == body.member_id for p in other_team.players):
            raise HTTPException(status_code=400, detail="Player already assigned to a team in this tournament")
    db.add(InternalTournamentTeamPlayer(team_id=tid, member_id=body.member_id))
    db.commit()
    return _get_or_404(db, id)


@router.delete("/{id}/teams/{tid}/players/{pid}", response_model=IntTournamentOut)
def remove_team_player(id: int, tid: int, pid: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    t = _get_or_404(db, id)
    _require_captain_or_admin(user, t.captain_id)
    team = next((team for team in t.teams if team.id == tid), None)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    player = next((p for p in team.players if p.id == pid), None)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    db.delete(player)
    db.commit()
    return _get_or_404(db, id)
