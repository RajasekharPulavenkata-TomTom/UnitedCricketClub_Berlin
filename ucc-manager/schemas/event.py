from datetime import date as _date, datetime, time as _time
from typing import Optional
from pydantic import BaseModel


class EventCreate(BaseModel):
    date: _date
    title: str
    type: str = "other"
    location: Optional[str] = None
    notes: Optional[str] = None
    reporting_time: Optional[_time] = None
    remarks: Optional[str] = None
    match_type: Optional[str] = None
    home_away: Optional[str] = None
    match_time: Optional[_time] = None


class EventUpdate(BaseModel):
    date: Optional[_date] = None
    title: Optional[str] = None
    type: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None
    reporting_time: Optional[_time] = None
    remarks: Optional[str] = None
    match_type: Optional[str] = None
    home_away: Optional[str] = None
    match_time: Optional[_time] = None


class AvailabilitySet(BaseModel):
    status: str


class EventOut(BaseModel):
    id: int
    date: _date
    title: str
    type: str
    location: Optional[str] = None
    notes: Optional[str] = None
    reporting_time: Optional[_time] = None
    remarks: Optional[str] = None
    match_type: Optional[str] = None
    home_away: Optional[str] = None
    match_time: Optional[_time] = None
    created_at: datetime
    available_count: int = 0
    unavailable_count: int = 0
    maybe_count: int = 0
    # requesting member's own status; only set when list_events gets ?member_id=
    my_status: Optional[str] = None

    model_config = {"from_attributes": True}
