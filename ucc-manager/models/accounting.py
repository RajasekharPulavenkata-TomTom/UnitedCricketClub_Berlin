from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, Numeric, Date, DateTime, ForeignKey
from sqlalchemy.orm import relationship, declared_attr
from database import Base


def _now():
    return datetime.now(timezone.utc)


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False, unique=True)
    type = Column(String(10), nullable=False)  # "income" | "expense"
    description = Column(Text)
    created_at = Column(DateTime, default=_now)

    transactions = relationship("Transaction", back_populates="category")


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(Date, nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    type = Column(String(10), nullable=False)  # "income" | "expense"
    category_id = Column(Integer, ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    description = Column(Text)
    reference = Column(String(100))
    status = Column(String(10), nullable=False, default="approved")  # approved | pending | rejected
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)

    category = relationship("Category", back_populates="transactions")
    created_by = relationship("User", foreign_keys=[created_by_id])
