from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, Date, DateTime, Numeric, ForeignKey
from database import Base


def _now():
    return datetime.now(timezone.utc)


class Receipt(Base):
    """Digital Quittung — proof that cash (e.g. an umpire fee) was paid and
    received on match day. The recipient signs on screen; the signature is
    stored as a base64 PNG data URL."""
    __tablename__ = "receipts"

    id             = Column(Integer, primary_key=True, autoincrement=True)
    date           = Column(Date, nullable=False)
    recipient_name = Column(String(150), nullable=False)
    amount         = Column(Numeric(10, 2), nullable=False)
    purpose        = Column(String(300), nullable=False)
    location       = Column(String(100), nullable=False, default="Berlin")  # "Ort" on the printed form
    event_id       = Column(Integer, ForeignKey("events.id", ondelete="SET NULL"), nullable=True, index=True)
    paid_by_id     = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    signature      = Column(Text, nullable=False)  # data:image/png;base64,...
    created_at     = Column(DateTime(timezone=True), default=_now)
