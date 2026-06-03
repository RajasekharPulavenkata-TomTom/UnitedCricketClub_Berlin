from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models.accounting import Transaction
from schemas.accounting import TransactionOut
from dependencies.auth import require_admin

router = APIRouter(prefix="/api/approvals", tags=["approvals"])


@router.get("/pending")
def get_pending(db: Session = Depends(get_db), _=Depends(require_admin)):
    pending_tx = db.query(Transaction).filter(Transaction.status == "pending").count()
    return {
        "transactions": pending_tx,
        "total": pending_tx,
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


