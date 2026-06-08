from typing import List, Optional
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import extract
from pydantic import BaseModel
from database import get_db
from models.scoreboard import MatchResult
from models.auth import User
from dependencies.auth import get_current_user

router = APIRouter(prefix="/api/scoreboard", tags=["scoreboard"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class MatchResultCreate(BaseModel):
    date: date
    opponent: str
    venue: Optional[str] = None
    match_type: Optional[str] = None
    home_away: Optional[str] = None
    our_score: Optional[str] = None
    opponent_score: Optional[str] = None
    result: Optional[str] = None
    margin: Optional[str] = None
    cricclubs_url: Optional[str] = None
    notes: Optional[str] = None


class MatchResultUpdate(BaseModel):
    date: Optional[date] = None
    opponent: Optional[str] = None
    venue: Optional[str] = None
    match_type: Optional[str] = None
    home_away: Optional[str] = None
    our_score: Optional[str] = None
    opponent_score: Optional[str] = None
    result: Optional[str] = None
    margin: Optional[str] = None
    cricclubs_url: Optional[str] = None
    notes: Optional[str] = None


class MatchResultOut(BaseModel):
    id: int
    date: date
    opponent: str
    venue: Optional[str]
    match_type: Optional[str]
    home_away: Optional[str]
    our_score: Optional[str]
    opponent_score: Optional[str]
    result: Optional[str]
    margin: Optional[str]
    cricclubs_url: Optional[str]
    notes: Optional[str]

    model_config = {"from_attributes": True}


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("", response_model=List[MatchResultOut])
def list_results(
    year: Optional[int] = None,
    db: Session = Depends(get_db),
):
    q = db.query(MatchResult)
    if year:
        q = q.filter(extract("year", MatchResult.date) == year)
    return q.order_by(MatchResult.date.desc()).all()


@router.post("", response_model=MatchResultOut, status_code=201)
def create_result(
    data: MatchResultCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "root"):
        raise HTTPException(status_code=403, detail="Admin only")
    mr = MatchResult(**data.model_dump())
    db.add(mr)
    db.commit()
    db.refresh(mr)
    return mr


@router.put("/{id}", response_model=MatchResultOut)
def update_result(
    id: int,
    data: MatchResultUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "root"):
        raise HTTPException(status_code=403, detail="Admin only")
    mr = db.query(MatchResult).filter(MatchResult.id == id).first()
    if not mr:
        raise HTTPException(status_code=404, detail="Not found")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(mr, k, v)
    db.commit()
    db.refresh(mr)
    return mr


@router.delete("/{id}", status_code=204)
def delete_result(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "root"):
        raise HTTPException(status_code=403, detail="Admin only")
    mr = db.query(MatchResult).filter(MatchResult.id == id).first()
    if not mr:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(mr)
    db.commit()
