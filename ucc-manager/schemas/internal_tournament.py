from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date as Date


class IntMemberRef(BaseModel):
    id: int
    name: str
    model_config = {"from_attributes": True}


class IntTeamPlayerCreate(BaseModel):
    member_id: int


class IntTeamPlayerOut(BaseModel):
    id: int
    member_id: int
    member: IntMemberRef
    model_config = {"from_attributes": True}


class IntTeamCreate(BaseModel):
    name: str


class IntTeamOut(BaseModel):
    id: int
    name: str
    captain_id: Optional[int] = None
    players: List[IntTeamPlayerOut] = []
    model_config = {"from_attributes": True}


class IntTournamentCreate(BaseModel):
    name: str
    format: Optional[str] = None
    venue: Optional[str] = None
    start_date: Date
    end_date: Optional[Date] = None
    notes: Optional[str] = None


class IntTournamentUpdate(BaseModel):
    name: Optional[str] = None
    format: Optional[str] = None
    venue: Optional[str] = None
    start_date: Optional[Date] = None
    end_date: Optional[Date] = None
    status: Optional[str] = None
    champion: Optional[str] = None
    notes: Optional[str] = None


class IntTournamentOut(BaseModel):
    id: int
    name: str
    format: Optional[str] = None
    venue: Optional[str] = None
    start_date: Date
    end_date: Optional[Date] = None
    status: str
    champion: Optional[str] = None
    captain_id: Optional[int] = None
    notes: Optional[str] = None
    created_at: datetime
    teams: List[IntTeamOut] = []
    model_config = {"from_attributes": True}
