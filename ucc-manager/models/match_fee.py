from datetime import datetime, timezone
from sqlalchemy import Column, Integer, Boolean, DateTime, ForeignKey, UniqueConstraint
from database import Base


def _now():
    return datetime.now(timezone.utc)


class MatchFeePayment(Base):
    __tablename__ = "match_fee_payments"

    id        = Column(Integer, primary_key=True, autoincrement=True)
    event_id  = Column(Integer, ForeignKey("events.id",  ondelete="CASCADE"), nullable=False)
    member_id = Column(Integer, ForeignKey("members.id", ondelete="CASCADE"), nullable=False)
    paid      = Column(Boolean, nullable=False, default=False)
    paid_at   = Column(DateTime(timezone=True))

    __table_args__ = (UniqueConstraint("event_id", "member_id", name="uq_match_fee_payment"),)
