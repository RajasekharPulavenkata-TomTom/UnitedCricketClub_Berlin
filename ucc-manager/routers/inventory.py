from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, selectinload
from database import get_db
from models.inventory import EquipmentItem
from schemas.inventory import (
    EquipmentCreate, EquipmentUpdate, EquipmentOut,
)
from routers.audit import log
from models.auth import User
from dependencies.auth import get_current_user

router = APIRouter(prefix="/api", tags=["inventory"])


# ── Equipment ──────────────────────────────────────────────────────────────────

@router.get("/equipment", response_model=List[EquipmentOut])
def list_equipment(
    type: Optional[str] = None,
    condition: Optional[str] = None,
    search: Optional[str] = None,
    active_only: bool = True,
    db: Session = Depends(get_db),
):
    # eager-load: EquipmentOut serializes maintenance_notes, one lazy query per item otherwise
    q = db.query(EquipmentItem).options(selectinload(EquipmentItem.maintenance_notes))
    if active_only:
        q = q.filter(EquipmentItem.is_active == True)
    if type:
        q = q.filter(EquipmentItem.type == type)
    if condition:
        q = q.filter(EquipmentItem.condition == condition)
    if search:
        q = q.filter(EquipmentItem.name.ilike(f"%{search}%"))
    return q.order_by(EquipmentItem.type, EquipmentItem.name).all()


@router.post("/equipment", response_model=EquipmentOut, status_code=201)
def create_equipment(data: EquipmentCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = EquipmentItem(**data.model_dump(), quantity_available=data.quantity_total)
    db.add(item)
    db.flush()
    log(db, "added", "equipment", item.id, f"Equipment '{item.name}' ({item.quantity_total}x {item.type}) added", user=current_user)
    db.commit()
    db.refresh(item)
    return item


@router.get("/equipment/{id}", response_model=EquipmentOut)
def get_equipment(id: int, db: Session = Depends(get_db)):
    item = db.query(EquipmentItem).filter(EquipmentItem.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Equipment not found")
    return item


@router.put("/equipment/{id}", response_model=EquipmentOut)
def update_equipment(id: int, data: EquipmentUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = db.query(EquipmentItem).filter(EquipmentItem.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Equipment not found")
    updates = data.model_dump(exclude_none=True)
    if "quantity_total" in updates:
        diff = updates["quantity_total"] - item.quantity_total
        item.quantity_available = max(0, item.quantity_available + diff)
    for field, value in updates.items():
        setattr(item, field, value)
    log(db, "updated", "equipment", id, f"Equipment '{item.name}' updated", user=current_user)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/equipment/{id}", status_code=204)
def delete_equipment(id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = db.query(EquipmentItem).filter(EquipmentItem.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Equipment not found")
    item.is_active = False
    log(db, "archived", "equipment", id, f"Equipment '{item.name}' archived", user=current_user)
    db.commit()
