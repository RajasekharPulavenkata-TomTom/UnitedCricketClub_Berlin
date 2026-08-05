from datetime import datetime
from typing import Optional
from pydantic import BaseModel, field_validator


class MemberBase(BaseModel):
    name: str
    jersey_name: Optional[str] = None
    jersey_number: Optional[int] = None
    role: Optional[str] = None
    ball_type: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None

    @field_validator("email", mode="before")
    @classmethod
    def normalise_email(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip().lower()
        return v or None
    dcb_id: Optional[str] = None
    membership_no: Optional[str] = None
    id_card_received: bool = False
    spielerpass: Optional[str] = None
    cricheroes: bool = False
    cricclubs: bool = False
    notes: Optional[str] = None


class MemberCreate(MemberBase):
    pass


class MemberUpdate(BaseModel):
    name: Optional[str] = None
    jersey_name: Optional[str] = None
    jersey_number: Optional[int] = None
    role: Optional[str] = None
    ball_type: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    dcb_id: Optional[str] = None
    membership_no: Optional[str] = None
    id_card_received: Optional[bool] = None
    spielerpass: Optional[str] = None
    cricheroes: Optional[bool] = None
    cricclubs: Optional[bool] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class MemberOut(MemberBase):
    id: int
    is_active: bool
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
