from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models.tournament import Tournament, TournamentParticipant
from schemas.tournament import (
    TournamentCreate, TournamentUpdate, TournamentOut,
    ParticipantCreate, ParticipantUpdate,
)

router = APIRouter(prefix="/api/tournaments", tags=["tournaments"])


def _get_or_404(db: Session, id: int) -> Tournament:
    t = db.query(Tournament).filter(Tournament.id == id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tournament not found")
    return t


def _enrich(t: Tournament) -> Tournament:
    total_matches = sum(p.matches_played for p in t.participants)
    cost_per_match = t.total_fee / total_matches if total_matches else 0
    for p in t.participants:
        p.fee_share = round(p.matches_played * cost_per_match, 2)
    return t


@router.get("", response_model=List[TournamentOut])
def list_tournaments(db: Session = Depends(get_db)):
    return [_enrich(t) for t in db.query(Tournament).order_by(Tournament.created_at.desc()).all()]


@router.post("", response_model=TournamentOut, status_code=201)
def create_tournament(body: TournamentCreate, db: Session = Depends(get_db)):
    t = Tournament(name=body.name, total_fee=body.total_fee)
    db.add(t)
    db.commit()
    db.refresh(t)
    return _enrich(t)


@router.get("/{id}", response_model=TournamentOut)
def get_tournament(id: int, db: Session = Depends(get_db)):
    return _enrich(_get_or_404(db, id))


@router.put("/{id}", response_model=TournamentOut)
def update_tournament(id: int, body: TournamentUpdate, db: Session = Depends(get_db)):
    t = _get_or_404(db, id)
    if body.name is not None:
        t.name = body.name
    if body.total_fee is not None:
        t.total_fee = body.total_fee
    db.commit()
    db.refresh(t)
    return _enrich(t)


@router.delete("/{id}", status_code=204)
def delete_tournament(id: int, db: Session = Depends(get_db)):
    db.delete(_get_or_404(db, id))
    db.commit()


@router.post("/{id}/participants", response_model=TournamentOut, status_code=201)
def add_participant(id: int, body: ParticipantCreate, db: Session = Depends(get_db)):
    t = _get_or_404(db, id)
    if any(p.member_id == body.member_id for p in t.participants):
        raise HTTPException(status_code=400, detail="Player already added to this tournament")
    db.add(TournamentParticipant(
        tournament_id=id,
        member_id=body.member_id,
        matches_played=body.matches_played,
    ))
    db.commit()
    db.refresh(t)
    return _enrich(t)


@router.put("/{id}/participants/{pid}", response_model=TournamentOut)
def update_participant(id: int, pid: int, body: ParticipantUpdate, db: Session = Depends(get_db)):
    t = _get_or_404(db, id)
    p = next((p for p in t.participants if p.id == pid), None)
    if not p:
        raise HTTPException(status_code=404, detail="Participant not found")
    if body.matches_played is not None:
        p.matches_played = body.matches_played
    db.commit()
    db.refresh(t)
    return _enrich(t)


@router.delete("/{id}/participants/{pid}", response_model=TournamentOut)
def remove_participant(id: int, pid: int, db: Session = Depends(get_db)):
    t = _get_or_404(db, id)
    p = next((p for p in t.participants if p.id == pid), None)
    if not p:
        raise HTTPException(status_code=404, detail="Participant not found")
    db.delete(p)
    db.commit()
    db.refresh(t)
    return _enrich(t)
