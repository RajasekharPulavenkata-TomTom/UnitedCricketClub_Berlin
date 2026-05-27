from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from database import Base


def _now():
    return datetime.now(timezone.utc)


class NotificationLog(Base):
    __tablename__ = "notification_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    member_id = Column(Integer, ForeignKey("members.id", ondelete="CASCADE"), nullable=False)
    type = Column(String(30), nullable=False)  # reminder_48h, reminder_24h, availability_request
    sent_at = Column(DateTime(timezone=True), default=_now)
