from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, Date, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from database import Base


def _now():
    return datetime.now(timezone.utc)


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(200), nullable=False)
    description = Column(Text)
    status = Column(String(20), nullable=False, default="todo")  # todo | in_progress | done
    priority = Column(String(10), nullable=False, default="medium")  # low | medium | high
    due_date = Column(Date)
    assigned_to_id = Column(Integer, ForeignKey("members.id", ondelete="SET NULL"))
    event_id = Column(Integer, ForeignKey("events.id", ondelete="SET NULL"))
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)

    assigned_to = relationship("Member")
    event = relationship("Event")
    created_by = relationship("User")
