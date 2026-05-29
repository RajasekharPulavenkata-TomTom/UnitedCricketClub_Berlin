from sqlalchemy import Column, Integer, ForeignKey, Boolean, Time, UniqueConstraint
from database import Base


class PlayerReporting(Base):
    __tablename__ = "player_reporting"
    id            = Column(Integer, primary_key=True, autoincrement=True)
    event_id      = Column(Integer, ForeignKey("events.id",  ondelete="CASCADE"), nullable=False)
    member_id     = Column(Integer, ForeignKey("members.id", ondelete="CASCADE"), nullable=False)
    reported      = Column(Boolean, nullable=False, default=False)
    reported_time = Column(Time)
    __table_args__ = (UniqueConstraint("event_id", "member_id", name="uq_player_reporting"),)
