from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database import get_db
from models.inventory import EquipmentItem, Assignment, MaintenanceNote
from schemas.inventory import (
    EquipmentCreate, EquipmentUpdate, EquipmentOut,
    AssignmentCreate, AssignmentOut,
    MaintenanceNoteCreate, MaintenanceNoteUpdate, MaintenanceNoteOut,
)
from services import inventory_service
from routers.audit import log

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
def create_equipment(data: EquipmentCreate, db: Session = Depends(get_db)):
    item = EquipmentItem(**data.model_dump(), quantity_available=data.quantity_total)
    db.add(item)
    db.flush()
    log(db, "added", "equipment", item.id, f"Equipment '{item.name}' ({item.quantity_total}x {item.type}) added")
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
def update_equipment(id: int, data: EquipmentUpdate, db: Session = Depends(get_db)):
    item = db.query(EquipmentItem).filter(EquipmentItem.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Equipment not found")
    updates = data.model_dump(exclude_none=True)
    if "quantity_total" in updates:
        diff = updates["quantity_total"] - item.quantity_total
        item.quantity_available = max(0, item.quantity_available + diff)
    for field, value in updates.items():
        setattr(item, field, value)
    log(db, "updated", "equipment", id, f"Equipment '{item.name}' updated")
    db.commit()
    db.refresh(item)
    return item


@router.delete("/equipment/{id}", status_code=204)
def delete_equipment(id: int, db: Session = Depends(get_db)):
    item = db.query(EquipmentItem).filter(EquipmentItem.id == id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Equipment not found")
    item.is_active = False
    log(db, "archived", "equipment", id, f"Equipment '{item.name}' archived")
    db.commit()


# ── Assignments ────────────────────────────────────────────────────────────────

@router.get("/assignments/members/names")
def member_names(db: Session = Depends(get_db)):
    return inventory_service.get_member_names(db)


@router.get("/assignments/by-member")
def assignments_by_member(db: Session = Depends(get_db)):
    rows = (
        db.query(Assignment)
        .filter(Assignment.returned_date == None, Assignment.status == "approved")
        .order_by(Assignment.member_name, Assignment.assigned_date)
        .all()
    )
    grouped: dict = {}
    for a in rows:
        grouped.setdefault(a.member_name, []).append({
            "assignment_id": a.id,
            "equipment_name": a.equipment.name if a.equipment else str(a.equipment_id),
            "equipment_type": a.equipment.type if a.equipment else "",
            "quantity": a.quantity_assigned,
            "assigned_date": str(a.assigned_date),
            "expected_return_date": str(a.expected_return_date) if a.expected_return_date else None,
        })
    return [{"member_name": name, "items": items} for name, items in sorted(grouped.items())]


@router.get("/assignments", response_model=List[AssignmentOut])
def list_assignments(
    equipment_id: Optional[int] = None,
    member_name: Optional[str] = None,
    active_only: bool = False,
    db: Session = Depends(get_db),
):
    q = db.query(Assignment)
    if equipment_id:
        q = q.filter(Assignment.equipment_id == equipment_id)
    if member_name:
        q = q.filter(Assignment.member_name.ilike(f"%{member_name}%"))
    if active_only:
        q = q.filter(Assignment.returned_date == None)
    return q.order_by(Assignment.assigned_date.desc()).all()


@router.post("/assignments", response_model=AssignmentOut, status_code=201)
def create_assignment(data: AssignmentCreate, db: Session = Depends(get_db)):
    result = inventory_service.assign_equipment(
        db,
        equipment_id=data.equipment_id,
        quantity=data.quantity_assigned,
        member_name=data.member_name,
        assigned_date=data.assigned_date,
        expected_return_date=data.expected_return_date,
        notes=data.notes,
        status="approved",
        created_by_id=None,
    )
    item = db.query(EquipmentItem).filter(EquipmentItem.id == data.equipment_id).first()
    item_name = item.name if item else f"item #{data.equipment_id}"
    log(db, "added", "assignment", result.id, f"{data.quantity_assigned}x '{item_name}' assigned to {data.member_name}")
    db.commit()
    return result


@router.get("/assignments/{id}", response_model=AssignmentOut)
def get_assignment(id: int, db: Session = Depends(get_db)):
    a = db.query(Assignment).filter(Assignment.id == id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return a


@router.put("/assignments/{id}/return", response_model=AssignmentOut)
def return_assignment(id: int, db: Session = Depends(get_db)):
    a = db.query(Assignment).filter(Assignment.id == id).first()
    result = inventory_service.return_equipment(db, id)
    if a:
        item = db.query(EquipmentItem).filter(EquipmentItem.id == a.equipment_id).first()
        item_name = item.name if item else f"item #{a.equipment_id}"
        log(db, "returned", "assignment", id, f"{a.quantity_assigned}x '{item_name}' returned by {a.member_name}")
        db.commit()
    return result


@router.delete("/assignments/{id}", status_code=204)
def delete_assignment(id: int, db: Session = Depends(get_db)):
    a = db.query(Assignment).filter(Assignment.id == id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if a.status == "approved" and a.returned_date is None:
        item = db.query(EquipmentItem).filter(EquipmentItem.id == a.equipment_id).first()
        if item:
            item.quantity_available = min(item.quantity_available + a.quantity_assigned, item.quantity_total)
    item = db.query(EquipmentItem).filter(EquipmentItem.id == a.equipment_id).first()
    item_name = item.name if item else f"item #{a.equipment_id}"
    log(db, "deleted", "assignment", id, f"Assignment of {a.quantity_assigned}x '{item_name}' to {a.member_name} removed")
    db.delete(a)
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
