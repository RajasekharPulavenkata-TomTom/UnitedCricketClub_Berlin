from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date as Date


class MemberRef(BaseModel):
    id: int
    name: str
    model_config = {"from_attributes": True}


class ParticipantCreate(BaseModel):
    member_id: int
    matches_played: int


class ParticipantUpdate(BaseModel):
    matches_played: Optional[int] = None
    paid: Optional[bool] = None


class ParticipantOut(BaseModel):
    id: int
    member_id: int
    matches_played: int
    paid: bool
    fee_share: Optional[float] = None
    member: MemberRef
    model_config = {"from_attributes": True}


class TournamentCreate(BaseModel):
    name: str
    total_fee: float
    date: Optional[Date] = None


class TournamentUpdate(BaseModel):
    name: Optional[str] = None
    total_fee: Optional[float] = None
    date: Optional[Date] = None


class TournamentOut(BaseModel):
    id: int
    name: str
    total_fee: float
    date: Optional[Date] = None
    created_at: datetime
    updated_at: datetime
    participants: List[ParticipantOut] = []
    model_config = {"from_attributes": True}
