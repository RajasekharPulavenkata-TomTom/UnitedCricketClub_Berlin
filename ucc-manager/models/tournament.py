from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Boolean, Date
from sqlalchemy.orm import relationship
from database import Base


def _now():
    return datetime.now(timezone.utc)


class Tournament(Base):
    __tablename__ = "tournaments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False)
    total_fee = Column(Float, nullable=False)
    date = Column(Date, nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)

    participants = relationship(
        "TournamentParticipant",
        back_populates="tournament",
        cascade="all, delete-orphan",
        order_by="TournamentParticipant.id",
    )


class TournamentParticipant(Base):
    __tablename__ = "tournament_participants"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tournament_id = Column(Integer, ForeignKey("tournaments.id", ondelete="CASCADE"), nullable=False)
    member_id = Column(Integer, ForeignKey("members.id", ondelete="CASCADE"), nullable=False)
    matches_played = Column(Integer, nullable=False, default=1)
    paid = Column(Boolean, nullable=False, default=False)

    tournament = relationship("Tournament", back_populates="participants")
    member = relationship("Member")
