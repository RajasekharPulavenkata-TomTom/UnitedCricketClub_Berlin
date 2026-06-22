from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models.sponsor import Sponsor
from models.auth import User
from dependencies.auth import get_current_user

router = APIRouter(prefix="/api/sponsors", tags=["sponsors"])


class SponsorCreate(BaseModel):
    name:          str
    logo_url:      Optional[str] = None
    website_url:   Optional[str] = None
    description:   Optional[str] = None
    since_year:    Optional[int] = None
    is_active:     bool = True
    display_order: int  = 0


class SponsorUpdate(BaseModel):
    name:          Optional[str] = None
    logo_url:      Optional[str] = None
    website_url:   Optional[str] = None
    description:   Optional[str] = None
    since_year:    Optional[int] = None
    is_active:     Optional[bool] = None
    display_order: Optional[int] = None


class SponsorOut(BaseModel):
    id:            int
    name:          str
    logo_url:      Optional[str]
    website_url:   Optional[str]
    description:   Optional[str]
    since_year:    Optional[int]
    is_active:     bool
    display_order: int

    model_config = {"from_attributes": True}


@router.get("", response_model=List[SponsorOut])
def list_sponsors(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Sponsor)
    if current_user.role not in ("manager", "developer"):
        q = q.filter(Sponsor.is_active == True)
    return q.order_by(Sponsor.display_order, Sponsor.created_at).all()


@router.post("", response_model=SponsorOut, status_code=201)
def create_sponsor(
    data: SponsorCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("manager", "developer"):
        raise HTTPException(status_code=403, detail="Admin only")
    s = Sponsor(**data.model_dump())
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@router.put("/{id}", response_model=SponsorOut)
def update_sponsor(
    id: int,
    data: SponsorUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("manager", "developer"):
        raise HTTPException(status_code=403, detail="Admin only")
    s = db.query(Sponsor).filter(Sponsor.id == id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Sponsor not found")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(s, k, v)
    db.commit()
    db.refresh(s)
    return s


@router.delete("/{id}", status_code=204)
def delete_sponsor(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("manager", "developer"):
        raise HTTPException(status_code=403, detail="Admin only")
    s = db.query(Sponsor).filter(Sponsor.id == id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Sponsor not found")
    db.delete(s)
    db.commit()
