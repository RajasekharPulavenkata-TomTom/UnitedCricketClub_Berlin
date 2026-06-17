from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, Date, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from database import Base


def _now():
    return datetime.now(timezone.utc)


class Meeting(Base):
    __tablename__ = "meetings"
    id            = Column(Integer, primary_key=True)
    title         = Column(String(200), nullable=False)
    meeting_date  = Column(Date, nullable=False)
    status        = Column(String(20), default="upcoming", nullable=False)  # upcoming | in_progress | completed
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at    = Column(DateTime(timezone=True), default=_now)

    items = relationship(
        "MeetingAgendaItem",
        back_populates="meeting",
        cascade="all, delete-orphan",
        order_by="MeetingAgendaItem.created_at",
    )


class MeetingAgendaItem(Base):
    __tablename__ = "meeting_agenda_items"
    id           = Column(Integer, primary_key=True)
    meeting_id   = Column(Integer, ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False)
    title        = Column(String(300), nullable=False)
    description  = Column(Text, nullable=True)
    raised_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    status       = Column(String(20), default="pending", nullable=False)  # pending | discussed | deferred | dropped
    decision     = Column(Text, nullable=True)
    created_at   = Column(DateTime(timezone=True), default=_now)

    meeting   = relationship("Meeting", back_populates="items")
    seconds   = relationship("MeetingItemSecond", back_populates="item", cascade="all, delete-orphan")
    raised_by = relationship("User", foreign_keys=[raised_by_id])


class MeetingItemSecond(Base):
    """A member seconding (upvoting) an agenda item to signal priority."""
    __tablename__ = "meeting_item_seconds"
    id         = Column(Integer, primary_key=True)
    item_id    = Column(Integer, ForeignKey("meeting_agenda_items.id", ondelete="CASCADE"), nullable=False)
    user_id    = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now)

    item = relationship("MeetingAgendaItem", back_populates="seconds")

    __table_args__ = (UniqueConstraint("item_id", "user_id", name="uq_meeting_item_second"),)
