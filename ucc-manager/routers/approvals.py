from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models.accounting import Transaction
from models.inventory import Assignment, EquipmentItem
from schemas.accounting import TransactionOut
from schemas.inventory import AssignmentOut
from dependencies.auth import require_admin

router = APIRouter(prefix="/api/approvals", tags=["approvals"])


@router.get("/pending")
def get_pending(db: Session = Depends(get_db), _=Depends(require_admin)):
    pending_tx = db.query(Transaction).filter(Transaction.status == "pending").count()
    pending_assign = db.query(Assignment).filter(Assignment.status == "pending").count()
    return {
        "transactions": pending_tx,
        "assignments": pending_assign,
        "total": pending_tx + pending_assign,
    }


@router.post("/transactions/{id}/approve", response_model=TransactionOut)
def approve_transaction(id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    tx = db.query(Transaction).filter(Transaction.id == id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if tx.status != "pending":
        raise HTTPException(status_code=400, detail=f"Transaction is already {tx.status}")
    tx.status = "approved"
    db.commit()
    db.refresh(tx)
    return tx


@router.post("/transactions/{id}/reject", response_model=TransactionOut)
def reject_transaction(id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    tx = db.query(Transaction).filter(Transaction.id == id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if tx.status != "pending":
        raise HTTPException(status_code=400, detail=f"Transaction is already {tx.status}")
    tx.status = "rejected"
    db.commit()
    db.refresh(tx)
    return tx


@router.post("/assignments/{id}/approve", response_model=AssignmentOut)
def approve_assignment(id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    assignment = db.query(Assignment).filter(Assignment.id == id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if assignment.status != "pending":
        raise HTTPException(status_code=400, detail=f"Assignment is already {assignment.status}")
    item = db.query(EquipmentItem).filter(EquipmentItem.id == assignment.equipment_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Equipment not found")
    if item.quantity_available < assignment.quantity_assigned:
        raise HTTPException(
            status_code=400,
            detail=f"Only {item.quantity_available} available, need {assignment.quantity_assigned}",
        )
    item.quantity_available -= assignment.quantity_assigned
    assignment.status = "approved"
    db.commit()
    db.refresh(assignment)
    return assignment


@router.post("/assignments/{id}/reject", response_model=AssignmentOut)
def reject_assignment(id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    assignment = db.query(Assignment).filter(Assignment.id == id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if assignment.status != "pending":
        raise HTTPException(status_code=400, detail=f"Assignment is already {assignment.status}")
    assignment.status = "rejected"
    db.commit()
    db.refresh(assignment)
    return assignment
