from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from database import get_db
from models.accounting import Transaction
from models.auth import User
from schemas.accounting import TransactionOut
from routers.audit import log
from dependencies.auth import require_admin
from models.member import Member
from services.notification_service import notify_transaction_decision as _notify_tx

router = APIRouter(prefix="/api/approvals", tags=["approvals"])


@router.get("/pending")
def get_pending(db: Session = Depends(get_db), _=Depends(require_admin)):
    tx_count = db.query(Transaction).filter(Transaction.status == "pending").count()
    user_count = db.query(User).filter(User.status == "pending").count()
    return {"transactions": tx_count, "users": user_count, "total": tx_count + user_count}


@router.get("/transactions/pending", response_model=List[TransactionOut])
def get_pending_transactions(db: Session = Depends(get_db), _=Depends(require_admin)):
    return (
        db.query(Transaction)
        .options(joinedload(Transaction.category))
        .filter(Transaction.status == "pending")
        .order_by(Transaction.created_at.asc())
        .limit(200)
        .all()
    )


@router.put("/transactions/{id}/approve", response_model=TransactionOut)
def approve_transaction(id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    tx = db.query(Transaction).filter(Transaction.id == id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if tx.status != "pending":
        raise HTTPException(status_code=400, detail=f"Transaction is already {tx.status}")
    tx.status = "approved"
    log(db, "approved", "transaction", id, f"{tx.type.capitalize()} '{tx.description or '—'}' (€{tx.amount}) approved", user=current_user)
    db.commit()
    db.refresh(tx)
    if tx.created_by and tx.created_by.member_id:
        m = db.query(Member).filter(Member.id == tx.created_by.member_id).first()
        if m and m.email:
            _notify_tx(tx.description or "", str(tx.amount), tx.type, "approved", m.jersey_name or m.name, m.email)
    return tx


@router.put("/transactions/{id}/reject", response_model=TransactionOut)
def reject_transaction(id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    tx = db.query(Transaction).filter(Transaction.id == id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if tx.status != "pending":
        raise HTTPException(status_code=400, detail=f"Transaction is already {tx.status}")
    tx.status = "rejected"
    log(db, "rejected", "transaction", id, f"{tx.type.capitalize()} '{tx.description or '—'}' (€{tx.amount}) rejected", user=current_user)
    db.commit()
    db.refresh(tx)
    if tx.created_by and tx.created_by.member_id:
        m = db.query(Member).filter(Member.id == tx.created_by.member_id).first()
        if m and m.email:
            _notify_tx(tx.description or "", str(tx.amount), tx.type, "rejected", m.jersey_name or m.name, m.email)
    return tx
