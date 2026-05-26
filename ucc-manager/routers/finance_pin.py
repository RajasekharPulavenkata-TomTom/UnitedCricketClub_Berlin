import bcrypt
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db
from models.setting import ClubSetting

router = APIRouter(prefix="/api/finance/pin", tags=["finance-pin"])

_KEY = "finance_pin_hash"


def _get_hash(db: Session) -> Optional[str]:
    row = db.query(ClubSetting).filter(ClubSetting.key == _KEY).first()
    return row.value if row else None


def _save_hash(db: Session, hashed: str):
    row = db.query(ClubSetting).filter(ClubSetting.key == _KEY).first()
    if row:
        row.value = hashed
    else:
        db.add(ClubSetting(key=_KEY, value=hashed))
    db.commit()


class PinVerify(BaseModel):
    pin: str

class PinSet(BaseModel):
    pin: str
    current_pin: Optional[str] = None


@router.get("/status")
def pin_status(db: Session = Depends(get_db)):
    return {"set": _get_hash(db) is not None}


@router.post("/verify")
def verify_pin(data: PinVerify, db: Session = Depends(get_db)):
    h = _get_hash(db)
    if not h:
        return {"ok": True}
    return {"ok": bcrypt.checkpw(data.pin.encode(), h.encode())}


@router.post("/set")
def set_pin(data: PinSet, db: Session = Depends(get_db)):
    if not data.pin.isdigit() or not (4 <= len(data.pin) <= 6):
        raise HTTPException(status_code=400, detail="PIN must be 4–6 digits")
    h = _get_hash(db)
    if h:
        if not data.current_pin or not bcrypt.checkpw(data.current_pin.encode(), h.encode()):
            raise HTTPException(status_code=403, detail="Current PIN is incorrect")
    _save_hash(db, bcrypt.hashpw(data.pin.encode(), bcrypt.gensalt()).decode())
    return {"ok": True}


@router.delete("")
def remove_pin(data: PinVerify, db: Session = Depends(get_db)):
    h = _get_hash(db)
    if not h:
        return {"ok": True}
    if not bcrypt.checkpw(data.pin.encode(), h.encode()):
        raise HTTPException(status_code=403, detail="Incorrect PIN")
    db.query(ClubSetting).filter(ClubSetting.key == _KEY).delete()
    db.commit()
    return {"ok": True}
