from typing import Optional
from datetime import datetime, timezone
from collections import Counter
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models.violation import Violation
from models.member import Member
from models.auth import User
from dependencies.auth import get_current_user

router = APIRouter(prefix="/api/violations", tags=["violations"])

RULE_REFS = {"MISCONDUCT", "PUNCTUALITY", "EQUIPMENT", "FINANCIAL", "COMMUNICATION", "OTHER"}


def _resolve(db: Session, violations: list, all_for_strikes: list | None = None) -> tuple:
    member_ids = {v.member_id for v in violations if v.member_id}
    user_ids   = {v.logged_by_id for v in violations if v.logged_by_id}
    members   = {m.id: m for m in db.query(Member).filter(Member.id.in_(member_ids)).all()} if member_ids else {}
    logged_by = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()} if user_ids else {}
    src       = all_for_strikes if all_for_strikes is not None else violations
    strikes   = dict(Counter(v.member_id for v in src))
    return members, logged_by, strikes


def _out(v: Violation, members: dict, logged_by: dict, strikes: dict) -> dict:
    m  = members.get(v.member_id)
    lb = logged_by.get(v.logged_by_id)
    return {
        "id":              v.id,
        "member_id":       v.member_id,
        "member_name":     (m.jersey_name or m.name) if m else "Unknown",
        "member_strikes":  strikes.get(v.member_id, 1),
        "rule_ref":        v.rule_ref,
        "description":     v.description,
        "logged_by":       (lb.full_name or lb.username) if lb else None,
        "acknowledged_at": v.acknowledged_at.isoformat() if v.acknowledged_at else None,
        "created_at":      v.created_at.isoformat() if v.created_at else None,
    }


class ViolationCreate(BaseModel):
    member_id: int
    rule_ref: str
    description: Optional[str] = None


@router.get("")
def list_violations(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    is_admin = current_user.role in ("manager", "developer")
    if is_admin:
        violations = db.query(Violation).order_by(Violation.created_at.desc()).all()
        members, logged_by, strikes = _resolve(db, violations)
    else:
        if not current_user.member_id:
            return []
        violations = db.query(Violation).filter(
            Violation.member_id == current_user.member_id
        ).order_by(Violation.created_at.desc()).all()
        members, logged_by, strikes = _resolve(db, violations)
    return [_out(v, members, logged_by, strikes) for v in violations]


@router.post("", status_code=201)
def create_violation(
    data: ViolationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("manager", "developer"):
        raise HTTPException(status_code=403, detail="Admin access required")
    if data.rule_ref not in RULE_REFS:
        raise HTTPException(status_code=400, detail=f"Invalid rule: {data.rule_ref}")
    member = db.query(Member).filter(Member.id == data.member_id, Member.is_active == True).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    v = Violation(
        member_id=data.member_id,
        rule_ref=data.rule_ref,
        description=(data.description or "").strip() or None,
        logged_by_id=current_user.id,
    )
    db.add(v)
    db.commit()
    db.refresh(v)
    all_mv = db.query(Violation).filter(Violation.member_id == member.id).all()
    members, logged_by, strikes = _resolve(db, all_mv)
    return _out(v, members, logged_by, strikes)


@router.post("/{v_id}/acknowledge")
def acknowledge_violation(
    v_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    v = db.query(Violation).filter(Violation.id == v_id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Violation not found")
    is_admin = current_user.role in ("manager", "developer")
    is_mine  = bool(current_user.member_id) and current_user.member_id == v.member_id
    if not is_admin and not is_mine:
        raise HTTPException(status_code=403, detail="Cannot acknowledge this violation")
    if v.acknowledged_at:
        raise HTTPException(status_code=400, detail="Already acknowledged")
    v.acknowledged_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(v)
    all_mv = db.query(Violation).filter(Violation.member_id == v.member_id).all()
    members, logged_by, strikes = _resolve(db, all_mv)
    return _out(v, members, logged_by, strikes)


@router.delete("/{v_id}", status_code=204)
def delete_violation(
    v_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("manager", "developer"):
        raise HTTPException(status_code=403, detail="Admin access required")
    v = db.query(Violation).filter(Violation.id == v_id).first()
    if not v:
        raise HTTPException(status_code=404, detail="Violation not found")
    db.delete(v)
    db.commit()
