from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, Date, DateTime, ForeignKey, UniqueConstraint, Numeric, Time
from sqlalchemy.orm import relationship
from database import Base


def _now():
    return datetime.now(timezone.utc)


class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(Date, nullable=False)
    title = Column(String(150), nullable=False)
    type = Column(String(20), nullable=False, default="other")  # match, training, other
    location = Column(String(150))
    notes = Column(Text)
    match_fee = Column(Numeric(10, 2))
    reporting_time = Column(Time)
    remarks = Column(Text)
    match_type = Column(String(20))   # T20, 40-Overs, 50-Overs, etc.
    home_away = Column(String(10))    # home, away
    match_time = Column(Time)
    created_at = Column(DateTime, default=_now)

    availability = relationship("EventAvailability", back_populates="event", cascade="all, delete-orphan")


class EventAvailability(Base):
    __tablename__ = "event_availability"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    member_id = Column(Integer, ForeignKey("members.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(15), nullable=False)  # available, unavailable, maybe

    event = relationship("Event", back_populates="availability")
    member = relationship("Member")

    __table_args__ = (UniqueConstraint("event_id", "member_id"),)
