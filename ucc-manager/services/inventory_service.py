from datetime import date
from sqlalchemy.orm import Session
from fastapi import HTTPException
from models.inventory import EquipmentItem, Assignment
from models.member import Member


def assign_equipment(db: Session, equipment_id: int, quantity: int, member_name: str,
                     assigned_date: date, expected_return_date=None, notes=None,
                     status: str = "approved", created_by_id: int = None) -> Assignment:
    item = db.query(EquipmentItem).filter(EquipmentItem.id == equipment_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Equipment not found")

    # Only deduct availability for approved assignments; pending waits for explicit approval
    if status == "approved":
        if item.quantity_available < quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Only {item.quantity_available} unit(s) available, requested {quantity}",
            )
        item.quantity_available -= quantity

    assignment = Assignment(
        equipment_id=equipment_id,
        member_name=member_name,
        quantity_assigned=quantity,
        assigned_date=assigned_date,
        expected_return_date=expected_return_date,
        notes=notes,
        status=status,
        created_by_id=created_by_id,
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return assignment


def return_equipment(db: Session, assignment_id: int) -> Assignment:
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if assignment.status != "approved":
        raise HTTPException(status_code=400, detail="Can only return an approved assignment")
    if assignment.returned_date is not None:
        raise HTTPException(status_code=400, detail="Item already returned")

    assignment.returned_date = date.today()
    item = db.query(EquipmentItem).filter(EquipmentItem.id == assignment.equipment_id).first()
    if item:
        item.quantity_available = min(
            item.quantity_available + assignment.quantity_assigned,
            item.quantity_total,
        )
    db.commit()
    db.refresh(assignment)
    return assignment


def get_member_names(db: Session) -> list[str]:
    members = db.query(Member).filter(Member.is_active == True).all()
    if members:
        return sorted(m.jersey_name if m.jersey_name else m.name for m in members)
    # fallback: derive from existing assignments when no members are registered
    rows = db.query(Assignment.member_name).distinct().all()
    return sorted({r.member_name for r in rows})
