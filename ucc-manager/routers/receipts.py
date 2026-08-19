from datetime import date as date_type
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session
from database import get_db
from models.receipt import Receipt
from models.event import Event
from models.auth import User
from dependencies.auth import get_current_user, require_admin

router = APIRouter(prefix="/api/receipts", tags=["receipts"])


class ReceiptCreate(BaseModel):
    date: date_type
    recipient_name: str = Field(min_length=2, max_length=150)
    amount: Decimal = Field(gt=0)
    purpose: str = Field(min_length=2, max_length=300)
    location: str = Field(default="Berlin", min_length=2, max_length=100)
    event_id: Optional[int] = None
    signature: str

    @field_validator("signature")
    @classmethod
    def validate_signature(cls, v: str) -> str:
        if not v.startswith("data:image/"):
            raise ValueError("signature must be an image data URL")
        return v


def _receipt_no(r: Receipt) -> str:
    return f"UCC-{r.date.year}-{r.id:03d}"


def _out(r: Receipt, db: Session, with_signature: bool) -> dict:
    paid_by = db.query(User).filter(User.id == r.paid_by_id).first() if r.paid_by_id else None
    event = db.query(Event).filter(Event.id == r.event_id).first() if r.event_id else None
    out = {
        "id":             r.id,
        "receipt_no":     _receipt_no(r),
        "date":           str(r.date),
        "recipient_name": r.recipient_name,
        "amount":         float(r.amount),
        "purpose":        r.purpose,
        "location":       r.location,
        "event_id":       r.event_id,
        "event_title":    event.title if event else None,
        "paid_by":        (paid_by.full_name or paid_by.username) if paid_by else None,
        "created_at":     r.created_at.isoformat() if r.created_at else None,
    }
    if with_signature:
        out["signature"] = r.signature
    return out


@router.post("", status_code=201)
def create_receipt(
    data: ReceiptCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if data.event_id and not db.query(Event).filter(Event.id == data.event_id).first():
        raise HTTPException(status_code=404, detail="Event not found")
    r = Receipt(
        date=data.date,
        recipient_name=data.recipient_name.strip(),
        amount=data.amount,
        purpose=data.purpose.strip(),
        location=data.location.strip(),
        event_id=data.event_id,
        paid_by_id=current_user.id,
        signature=data.signature,
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return _out(r, db, with_signature=True)


@router.get("")
def list_receipts(db: Session = Depends(get_db)):
    # signatures excluded: they are ~10-20 KB each and only the detail view needs them
    rows = db.query(Receipt).order_by(Receipt.date.desc(), Receipt.id.desc()).limit(200).all()
    return [_out(r, db, with_signature=False) for r in rows]


@router.get("/{id}")
def get_receipt(id: int, db: Session = Depends(get_db)):
    r = db.query(Receipt).filter(Receipt.id == id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Receipt not found")
    return _out(r, db, with_signature=True)


@router.delete("/{id}", status_code=204)
def delete_receipt(id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    r = db.query(Receipt).filter(Receipt.id == id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Receipt not found")
    db.delete(r)
    db.commit()
