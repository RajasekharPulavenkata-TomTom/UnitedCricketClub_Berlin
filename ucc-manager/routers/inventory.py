from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database import get_db
from models.inventory import EquipmentItem, MaintenanceNote
from schemas.inventory import (
    EquipmentCreate, EquipmentUpdate, EquipmentOut,
    MaintenanceNoteCreate, MaintenanceNoteUpdate, MaintenanceNoteOut,
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
    q = db.query(EquipmentItem)
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


# ── Maintenance ────────────────────────────────────────────────────────────────

@router.get("/maintenance", response_model=List[MaintenanceNoteOut])
def list_maintenance(equipment_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(MaintenanceNote)
    if equipment_id:
        q = q.filter(MaintenanceNote.equipment_id == equipment_id)
    return q.order_by(MaintenanceNote.date.desc()).all()


@router.post("/maintenance", response_model=MaintenanceNoteOut, status_code=201)
def create_maintenance(data: MaintenanceNoteCreate, db: Session = Depends(get_db)):
    item = db.query(EquipmentItem).filter(EquipmentItem.id == data.equipment_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Equipment not found")
    note = MaintenanceNote(**data.model_dump())
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.put("/maintenance/{id}", response_model=MaintenanceNoteOut)
def update_maintenance(id: int, data: MaintenanceNoteUpdate, db: Session = Depends(get_db)):
    note = db.query(MaintenanceNote).filter(MaintenanceNote.id == id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Maintenance note not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(note, field, value)
    db.commit()
    db.refresh(note)
    return note


@router.delete("/maintenance/{id}", status_code=204)
def delete_maintenance(id: int, db: Session = Depends(get_db)):
    note = db.query(MaintenanceNote).filter(MaintenanceNote.id == id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Maintenance note not found")
    db.delete(note)
    db.commit()
