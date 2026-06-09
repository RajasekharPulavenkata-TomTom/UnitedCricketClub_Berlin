from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from database import Base


def _now():
    return datetime.now(timezone.utc)


class TournamentFeedback(Base):
    __tablename__ = "tournament_feedback"
    id              = Column(Integer, primary_key=True, autoincrement=True)
    tournament_type = Column(String(10), nullable=False)   # "external" | "internal"
    tournament_id   = Column(Integer, nullable=False)
    feedback_type   = Column(String(10), nullable=False)   # "captain" | "player"
    reviewer_id     = Column(Integer, ForeignKey("members.id", ondelete="SET NULL"), nullable=True)
    reviewed_id     = Column(Integer, ForeignKey("members.id", ondelete="SET NULL"), nullable=True)
    rating          = Column(Integer)                      # 1–5
    comment         = Column(Text)
    created_at      = Column(DateTime, default=_now)
