from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from database import get_db
from models.accounting import Category, Transaction
from schemas.accounting import (
    CategoryCreate, CategoryUpdate, CategoryOut,
    TransactionCreate, TransactionUpdate, TransactionOut,
)
from services import accounting_service
from routers.audit import log
from models.auth import User
from dependencies.auth import get_current_user

router = APIRouter(prefix="/api", tags=["accounting"])


# ── Categories ─────────────────────────────────────────────────────────────────

@router.get("/categories", response_model=List[CategoryOut])
def list_categories(type: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(Category)
    if type:
        q = q.filter(Category.type == type)
    return q.order_by(Category.type, Category.name).all()


@router.post("/categories", response_model=CategoryOut, status_code=201)
def create_category(data: CategoryCreate, db: Session = Depends(get_db)):
    if db.query(Category).filter(Category.name == data.name).first():
        raise HTTPException(status_code=409, detail="Category name already exists")
    cat = Category(**data.model_dump())
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@router.put("/categories/{id}", response_model=CategoryOut)
def update_category(id: int, data: CategoryUpdate, db: Session = Depends(get_db)):
    cat = db.query(Category).filter(Category.id == id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(cat, field, value)
    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/categories/{id}", status_code=204)
def delete_category(id: int, db: Session = Depends(get_db)):
    cat = db.query(Category).filter(Category.id == id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    if cat.transactions:
        raise HTTPException(status_code=400, detail="Cannot delete category with existing transactions")
    db.delete(cat)
    db.commit()


# ── Transactions ───────────────────────────────────────────────────────────────

@router.get("/transactions", response_model=List[TransactionOut])
def list_transactions(
    type: Optional[str] = None,
    category_id: Optional[int] = None,
    month: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(default=100, le=500),
    offset: int = 0,
    db: Session = Depends(get_db),
):
    from sqlalchemy import func
    q = db.query(Transaction)
    if type:
        q = q.filter(Transaction.type == type)
    if category_id:
        q = q.filter(Transaction.category_id == category_id)
    if month:
        q = q.filter(func.to_char(Transaction.date, 'YYYY-MM') == month)
    if search:
        like = f"%{search}%"
        q = q.filter(or_(Transaction.description.ilike(like), Transaction.reference.ilike(like)))
    return q.order_by(Transaction.date.desc(), Transaction.id.desc()).offset(offset).limit(limit).all()


@router.post("/transactions", response_model=TransactionOut, status_code=201)
def create_transaction(data: TransactionCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if data.category_id:
        cat = db.query(Category).filter(Category.id == data.category_id).first()
        if not cat:
            raise HTTPException(status_code=404, detail="Category not found")
        if cat.type != data.type:
            raise HTTPException(status_code=400, detail="Category type does not match transaction type")
    tx = Transaction(**data.model_dump(), status="approved")
    db.add(tx)
    db.flush()
    log(db, "added", "transaction", tx.id, f"{tx.type.capitalize()} '{tx.description or '—'}' (€{tx.amount}) added", user=current_user)
    db.commit()
    db.refresh(tx)
    return tx


@router.get("/transactions/{id}", response_model=TransactionOut)
def get_transaction(id: int, db: Session = Depends(get_db)):
    tx = db.query(Transaction).filter(Transaction.id == id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return tx


@router.put("/transactions/{id}", response_model=TransactionOut)
def update_transaction(id: int, data: TransactionUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    tx = db.query(Transaction).filter(Transaction.id == id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(tx, field, value)
    log(db, "updated", "transaction", id, f"Transaction '{tx.description or '—'}' (€{tx.amount}) updated", user=current_user)
    db.commit()
    db.refresh(tx)
    return tx


@router.delete("/transactions/{id}", status_code=204)
def delete_transaction(id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    tx = db.query(Transaction).filter(Transaction.id == id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    log(db, "deleted", "transaction", id, f"{tx.type.capitalize()} '{tx.description or '—'}' (€{tx.amount}) deleted", user=current_user)
    db.delete(tx)
    db.commit()


# ── Reports ────────────────────────────────────────────────────────────────────

@router.get("/reports/dashboard")
def dashboard(db: Session = Depends(get_db)):
    data = accounting_service.get_dashboard(db)
    data["recent_transactions"] = [TransactionOut.model_validate(t) for t in data["recent_transactions"]]
    data["total_income"] = float(data["total_income"])
    data["total_expense"] = float(data["total_expense"])
    data["balance"] = float(data["balance"])
    return data


@router.get("/reports/monthly")
def monthly_report(year: int = None, db: Session = Depends(get_db)):
    from datetime import date
    if not year:
        year = date.today().year
    rows = accounting_service.get_monthly_report(db, year)
    return [
        {**r, "income": float(r["income"]), "expense": float(r["expense"]),
         "net": float(r["net"]), "running_balance": float(r["running_balance"])}
        for r in rows
    ]


@router.get("/reports/by-category")
def category_report(month: Optional[str] = None, db: Session = Depends(get_db)):
    rows = accounting_service.get_category_report(db, month)
    return [{**r, "total": float(r["total"])} for r in rows]
