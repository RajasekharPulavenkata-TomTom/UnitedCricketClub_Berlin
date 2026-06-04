from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from database import Base


def _now():
    return datetime.now(timezone.utc)


class Violation(Base):
    __tablename__ = "violations"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    member_id       = Column(Integer, ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True)
    rule_ref        = Column(String(50), nullable=False)
    description     = Column(Text)
    logged_by_id    = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    acknowledged_at = Column(DateTime(timezone=True))
    created_at      = Column(DateTime(timezone=True), default=_now)
