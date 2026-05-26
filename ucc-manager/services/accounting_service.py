from decimal import Decimal
from typing import Optional
from sqlalchemy import func, extract
from sqlalchemy.orm import Session
from models.accounting import Transaction, Category


def get_dashboard(db: Session) -> dict:
    totals = db.query(
        Transaction.type,
        func.sum(Transaction.amount).label("total"),
        func.count(Transaction.id).label("count"),
    ).filter(Transaction.status == "approved").group_by(Transaction.type).all()

    income = Decimal("0")
    expense = Decimal("0")
    count = 0
    for row in totals:
        if row.type == "income":
            income = Decimal(str(row.total or 0))
        elif row.type == "expense":
            expense = Decimal(str(row.total or 0))
        count += row.count

    recent = (
        db.query(Transaction)
        .filter(Transaction.status == "approved")
        .order_by(Transaction.date.desc(), Transaction.id.desc())
        .limit(5)
        .all()
    )

    return {
        "total_income": income,
        "total_expense": expense,
        "balance": income - expense,
        "transaction_count": count,
        "recent_transactions": recent,
    }


def get_monthly_report(db: Session, year: int) -> list:
    rows = (
        db.query(
            func.to_char(Transaction.date, 'MM').label("month"),
            Transaction.type,
            func.sum(Transaction.amount).label("total"),
        )
        .filter(Transaction.status == "approved")
        .filter(func.to_char(Transaction.date, 'YYYY') == str(year))
        .group_by("month", Transaction.type)
        .all()
    )

    monthly: dict[str, dict] = {}
    for i in range(1, 13):
        key = f"{i:02d}"
        monthly[key] = {"month": key, "income": Decimal("0"), "expense": Decimal("0")}

    for row in rows:
        if row.month in monthly:
            monthly[row.month][row.type] = Decimal(str(row.total or 0))

    result = []
    running = Decimal("0")
    for key in sorted(monthly):
        m = monthly[key]
        net = m["income"] - m["expense"]
        running += net
        result.append({
            "month": key,
            "income": m["income"],
            "expense": m["expense"],
            "net": net,
            "running_balance": running,
        })
    return result


def get_category_report(db: Session, month: Optional[str] = None) -> list:
    q = (
        db.query(
            Category.id,
            Category.name,
            Category.type,
            func.sum(Transaction.amount).label("total"),
            func.count(Transaction.id).label("count"),
        )
        .join(Transaction, Transaction.category_id == Category.id)
        .filter(Transaction.status == "approved")
    )
    if month:
        q = q.filter(func.to_char(Transaction.date, 'YYYY-MM') == month)
    q = q.group_by(Category.id, Category.name, Category.type)

    return [
        {
            "category_id": row.id,
            "category_name": row.name,
            "type": row.type,
            "total": Decimal(str(row.total or 0)),
            "count": row.count,
        }
        for row in q.all()
    ]
