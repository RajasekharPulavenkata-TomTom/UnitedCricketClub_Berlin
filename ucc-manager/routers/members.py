from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models.member import Member
from models.auth import User
from schemas.member import MemberCreate, MemberUpdate, MemberOut
from routers.audit import log
from dependencies.auth import get_current_user, require_admin

router = APIRouter(prefix="/api", tags=["members"])


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
