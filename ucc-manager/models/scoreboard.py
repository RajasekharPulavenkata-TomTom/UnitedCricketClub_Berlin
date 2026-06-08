from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, Date, DateTime
from database import Base


def _now():
    return datetime.now(timezone.utc)


class MatchResult(Base):
    __tablename__ = "match_results"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    date          = Column(Date, nullable=False)
    opponent      = Column(String(150), nullable=False)
    venue         = Column(String(150))
    match_type    = Column(String(20))   # T10, T20, 50-Overs
    home_away     = Column(String(10))   # home, away, neutral
    our_score     = Column(String(60))   # e.g. "185/6 (20)"
    opponent_score = Column(String(60))
    result        = Column(String(15))   # won, lost, tied, no-result
    margin        = Column(String(80))   # e.g. "43 runs" | "4 wickets"
    cricclubs_url = Column(String(500))
    notes         = Column(Text)
    created_at    = Column(DateTime, default=_now)
