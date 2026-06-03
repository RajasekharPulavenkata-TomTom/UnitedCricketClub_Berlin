from datetime import date, datetime
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel, field_validator

EQUIPMENT_TYPES = ("bat", "ball", "helmet", "pads", "gloves", "stumps", "jersey", "bag", "other")
CONDITIONS = ("Good", "Fair", "Poor")


class EquipmentBase(BaseModel):
    name: str
    type: str
    quantity_total: int = 1
    condition: str = "Good"
    supplier: Optional[str] = None
    serial_number: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        if v not in EQUIPMENT_TYPES:
            raise ValueError(f"type must be one of {EQUIPMENT_TYPES}")
        return v

    @field_validator("condition")
    @classmethod
    def validate_condition(cls, v: str) -> str:
        if v not in CONDITIONS:
            raise ValueError(f"condition must be one of {CONDITIONS}")
        return v


class EquipmentCreate(EquipmentBase):
    pass


class EquipmentUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    quantity_total: Optional[int] = None
    condition: Optional[str] = None
    supplier: Optional[str] = None
    serial_number: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class MaintenanceNoteBase(BaseModel):
    date: date
    description: str
    cost: Optional[Decimal] = None
    done_by: Optional[str] = None


class MaintenanceNoteCreate(MaintenanceNoteBase):
    equipment_id: int


class MaintenanceNoteUpdate(BaseModel):
    date: Optional[date] = None
    description: Optional[str] = None
    cost: Optional[Decimal] = None
    done_by: Optional[str] = None


class MaintenanceNoteOut(MaintenanceNoteBase):
    id: int
    equipment_id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class EquipmentOut(EquipmentBase):
    id: int
    quantity_available: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    maintenance_notes: List[MaintenanceNoteOut] = []

    model_config = {"from_attributes": True}
