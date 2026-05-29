from sqlalchemy import Column, Integer, ForeignKey, String, Time, UniqueConstraint
from database import Base


class PlayerReporting(Base):
    __tablename__ = "player_reporting"
    id            = Column(Integer, primary_key=True, autoincrement=True)
    event_id      = Column(Integer, ForeignKey("events.id",  ondelete="CASCADE"), nullable=False)
    member_id     = Column(Integer, ForeignKey("members.id", ondelete="CASCADE"), nullable=False)
    status        = Column(String(20), nullable=False, default="unknown")  # unknown, reported, absent
    reported_time = Column(Time)
    __table_args__ = (UniqueConstraint("event_id", "member_id", name="uq_player_reporting"),)
