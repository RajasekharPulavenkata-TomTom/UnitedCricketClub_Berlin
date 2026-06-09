from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, Date, DateTime, Numeric, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from database import Base


def _now():
    return datetime.now(timezone.utc)


class ExternalTournament(Base):
    __tablename__ = "external_tournaments"

    id                    = Column(Integer, primary_key=True, autoincrement=True)
    name                  = Column(String(150), nullable=False)
    organiser             = Column(String(100))
    format                = Column(String(20))
    venue                 = Column(String(150))
    start_date            = Column(Date, nullable=False)
    end_date              = Column(Date)
    registration_deadline = Column(Date)
    registration_fee      = Column(Numeric(10, 2), default=0)
    status                = Column(String(20), default="upcoming")  # upcoming, ongoing, completed
    result                = Column(String(100))
    website_url           = Column(String(500))
    notes                 = Column(Text)
    created_at            = Column(DateTime, default=_now)

    players = relationship("ExternalTournamentPlayer", back_populates="tournament", cascade="all, delete-orphan")


class ExternalTournamentPlayer(Base):
    __tablename__ = "external_tournament_players"

    id             = Column(Integer, primary_key=True, autoincrement=True)
    tournament_id  = Column(Integer, ForeignKey("external_tournaments.id", ondelete="CASCADE"), nullable=False)
    member_id      = Column(Integer, ForeignKey("members.id", ondelete="CASCADE"), nullable=False)
    matches_played = Column(Integer, default=1, nullable=False)
    paid           = Column(Boolean, default=False, nullable=False)

    tournament = relationship("ExternalTournament", back_populates="players")
    member     = relationship("Member")

    __table_args__ = (UniqueConstraint("tournament_id", "member_id", name="uq_ext_tournament_player"),)
