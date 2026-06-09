from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date as Date


class ExtMemberRef(BaseModel):
    id: int
    name: str
    model_config = {"from_attributes": True}


class ExtParticipantCreate(BaseModel):
    member_id: int
    matches_played: int = 1


class ExtParticipantUpdate(BaseModel):
    matches_played: Optional[int] = None


class ExtParticipantOut(BaseModel):
    id: int
    member_id: int
    matches_played: int
    paid: bool
    fee_share: Optional[float] = None
    member: ExtMemberRef
    model_config = {"from_attributes": True}


class ExtTournamentCreate(BaseModel):
    name: str
    organiser: Optional[str] = None
    format: Optional[str] = None
    venue: Optional[str] = None
    start_date: Date
    end_date: Optional[Date] = None
    registration_deadline: Optional[Date] = None
    registration_fee: Optional[float] = None
    website_url: Optional[str] = None
    notes: Optional[str] = None


class ExtTournamentUpdate(BaseModel):
    name: Optional[str] = None
    organiser: Optional[str] = None
    format: Optional[str] = None
    venue: Optional[str] = None
    start_date: Optional[Date] = None
    end_date: Optional[Date] = None
    registration_deadline: Optional[Date] = None
    registration_fee: Optional[float] = None
    status: Optional[str] = None
    result: Optional[str] = None
    website_url: Optional[str] = None
    notes: Optional[str] = None


class ExtTournamentOut(BaseModel):
    id: int
    name: str
    organiser: Optional[str] = None
    format: Optional[str] = None
    venue: Optional[str] = None
    start_date: Date
    end_date: Optional[Date] = None
    registration_deadline: Optional[Date] = None
    registration_fee: Optional[float] = None
    status: str
    result: Optional[str] = None
    website_url: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    players: List[ExtParticipantOut] = []
    model_config = {"from_attributes": True}
