from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, field_validator


class CategoryBase(BaseModel):
    name: str
    type: str
    description: Optional[str] = None

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        if v not in ("income", "expense"):
            raise ValueError("type must be 'income' or 'expense'")
        return v


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class CategoryOut(CategoryBase):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class TransactionBase(BaseModel):
    date: date
    amount: Decimal
    type: str
    category_id: Optional[int] = None
    description: Optional[str] = None
    reference: Optional[str] = None

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        if v not in ("income", "expense"):
            raise ValueError("type must be 'income' or 'expense'")
        return v

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("amount must be positive")
        return v


class TransactionCreate(TransactionBase):
    pass


class TransactionUpdate(BaseModel):
    date: Optional[date] = None
    amount: Optional[Decimal] = None
    type: Optional[str] = None
    category_id: Optional[int] = None
    description: Optional[str] = None
    reference: Optional[str] = None


class TransactionOut(TransactionBase):
    id: int
    status: str
    created_by_id: Optional[int] = None
    category: Optional[CategoryOut] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
