from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from database import Base


def _now():
    return datetime.now(timezone.utc)


class PainPoint(Base):
    __tablename__ = "pain_points"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    title           = Column(String(200), nullable=False)
    description     = Column(Text)
    category        = Column(String(50))
    submitted_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    is_anonymous    = Column(Boolean, nullable=False, default=False)
    status          = Column(String(20), nullable=False, default="open", index=True)  # open | discussed | resolved
    resolution_note = Column(Text)
    created_at      = Column(DateTime(timezone=True), default=_now)
    resolved_at     = Column(DateTime(timezone=True))

    submitted_by = relationship("User")
