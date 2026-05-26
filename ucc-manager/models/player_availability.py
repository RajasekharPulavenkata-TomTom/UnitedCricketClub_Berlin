from sqlalchemy import Column, Integer, String, Date, UniqueConstraint, ForeignKey
from database import Base


class PlayerAvailability(Base):
    __tablename__ = "player_availability"

    id        = Column(Integer, primary_key=True, autoincrement=True)
    member_id = Column(Integer, ForeignKey("members.id", ondelete="CASCADE"), nullable=False)
    date      = Column(Date, nullable=False)
    status    = Column(String(20), nullable=False)  # available | unavailable

    __table_args__ = (UniqueConstraint("member_id", "date", name="uq_player_avail"),)
