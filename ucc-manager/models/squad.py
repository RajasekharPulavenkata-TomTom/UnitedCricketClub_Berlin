from sqlalchemy import Column, Integer, UniqueConstraint, ForeignKey
from database import Base


class EventSquad(Base):
    __tablename__ = "event_squads"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    event_id      = Column(Integer, ForeignKey("events.id",  ondelete="CASCADE"), nullable=False)
    member_id     = Column(Integer, ForeignKey("members.id", ondelete="CASCADE"), nullable=False)
    batting_order = Column(Integer)

    __table_args__ = (UniqueConstraint("event_id", "member_id", name="uq_event_squad"),)
