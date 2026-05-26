from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    status: str = "todo"
    priority: str = "medium"
    due_date: Optional[date] = None
    assigned_to_id: Optional[int] = None
    event_id: Optional[int] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[date] = None
    assigned_to_id: Optional[int] = None
    event_id: Optional[int] = None


class AssignedMemberOut(BaseModel):
    id: int
    name: str
    model_config = {"from_attributes": True}


class EventRefOut(BaseModel):
    id: int
    title: str
    date: date
    model_config = {"from_attributes": True}


class TaskOut(BaseModel):
    id: int
    title: str
    description: Optional[str]
    status: str
    priority: str
    due_date: Optional[date]
    assigned_to_id: Optional[int]
    assigned_to: Optional[AssignedMemberOut]
    event_id: Optional[int]
    event: Optional[EventRefOut]
    created_by_id: Optional[int]
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}
