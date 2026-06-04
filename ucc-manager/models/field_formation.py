from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.types import JSON
from database import Base


def _now():
    return datetime.now(timezone.utc)


class FieldFormation(Base):
    __tablename__ = "field_formations"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    name          = Column(String(150), nullable=False)
    event_id      = Column(Integer, ForeignKey("events.id", ondelete="SET NULL"), nullable=True, index=True)
    positions     = Column(JSON, nullable=False, default=list)
    notes         = Column(Text)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at    = Column(DateTime(timezone=True), default=_now)
    updated_at    = Column(DateTime(timezone=True), default=_now, onupdate=_now)
