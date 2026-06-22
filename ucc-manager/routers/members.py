from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from database import get_db
from models.member import Member
from models.auth import User
from schemas.member import MemberCreate, MemberUpdate, MemberOut
from routers.audit import log
from dependencies.auth import get_current_user, require_admin

router = APIRouter(prefix="/api", tags=["members"])


@router.get("/members/summary")
def list_members_summary(db: Session = Depends(get_db)):
    """Lightweight list — id, name, is_active only.  Use for dropdowns and counts."""
    rows = db.query(Member.id, Member.name, Member.is_active).order_by(Member.name).all()
    return [{"id": r.id, "name": r.name, "is_active": r.is_active} for r in rows]


@router.get("/members", response_model=List[MemberOut])
def list_members(
    active_only: bool = False,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Member)
    if active_only:
        q = q.filter(Member.is_active == True)
    if search:
        q = q.filter(Member.name.ilike(f"%{search}%"))
    return q.order_by(Member.name).all()


@router.post("/members", response_model=MemberOut, status_code=201)
def create_member(data: MemberCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    existing = db.query(Member).filter(Member.name == data.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="A member with this name already exists")
    if data.email:
        clash = db.query(Member).filter(func.lower(Member.email) == data.email.lower()).first()
        if clash:
            raise HTTPException(status_code=400, detail=f"Email already registered to '{clash.name}'")
    if data.phone:
        clash = db.query(Member).filter(Member.phone == data.phone).first()
        if clash:
            raise HTTPException(status_code=400, detail=f"Phone number already registered to '{clash.name}'")
    member = Member(**data.model_dump())
    db.add(member)
    db.flush()
    log(db, "added", "member", member.id, f"Member '{member.name}' added", user=current_user)
    db.commit()
    db.refresh(member)
    return member


@router.put("/members/{id}", response_model=MemberOut)
def update_member(id: int, data: MemberUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    member = db.query(Member).filter(Member.id == id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    updates = data.model_dump(exclude_none=True)
    if "name" in updates:
        clash = db.query(Member).filter(Member.name == updates["name"], Member.id != id).first()
        if clash:
            raise HTTPException(status_code=400, detail="A member with this name already exists")
    if updates.get("email"):
        clash = db.query(Member).filter(func.lower(Member.email) == updates["email"].lower(), Member.id != id).first()
        if clash:
            raise HTTPException(status_code=400, detail=f"Email already registered to '{clash.name}'")
    if updates.get("phone"):
        clash = db.query(Member).filter(Member.phone == updates["phone"], Member.id != id).first()
        if clash:
            raise HTTPException(status_code=400, detail=f"Phone number already registered to '{clash.name}'")
    for field, value in updates.items():
        setattr(member, field, value)
    log(db, "updated", "member", id, f"Member '{member.name}' updated", user=current_user)
    db.commit()
    db.refresh(member)
    return member


@router.delete("/members/{id}", status_code=204)
def deactivate_member(id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    member = db.query(Member).filter(Member.id == id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    member.is_active = False
    log(db, "archived", "member", id, f"Member '{member.name}' archived", user=current_user)
    db.commit()


@router.delete("/members/{id}/purge", status_code=204)
def purge_member(id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    member = db.query(Member).filter(Member.id == id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    name = member.name
    db.delete(member)
    log(db, "deleted", "member", id, f"Member '{name}' permanently deleted", user=current_user)
    db.commit()
