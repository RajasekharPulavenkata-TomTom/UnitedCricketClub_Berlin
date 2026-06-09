from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, Date, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from database import Base


def _now():
    return datetime.now(timezone.utc)


class InternalTournament(Base):
    __tablename__ = "internal_tournaments"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    name       = Column(String(150), nullable=False)
    format     = Column(String(20))
    venue      = Column(String(150))
    start_date = Column(Date, nullable=False)
    end_date   = Column(Date)
    status     = Column(String(20), default="upcoming")  # upcoming, ongoing, completed
    champion   = Column(String(100))
    notes      = Column(Text)
    created_at = Column(DateTime, default=_now)

    teams = relationship("InternalTournamentTeam", back_populates="tournament", cascade="all, delete-orphan")


class InternalTournamentTeam(Base):
    __tablename__ = "internal_tournament_teams"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    tournament_id = Column(Integer, ForeignKey("internal_tournaments.id", ondelete="CASCADE"), nullable=False)
    name          = Column(String(100), nullable=False)

    tournament = relationship("InternalTournament", back_populates="teams")
    players    = relationship("InternalTournamentTeamPlayer", back_populates="team", cascade="all, delete-orphan")


class InternalTournamentTeamPlayer(Base):
    __tablename__ = "internal_tournament_team_players"

    id        = Column(Integer, primary_key=True, autoincrement=True)
    team_id   = Column(Integer, ForeignKey("internal_tournament_teams.id", ondelete="CASCADE"), nullable=False)
    member_id = Column(Integer, ForeignKey("members.id", ondelete="CASCADE"), nullable=False)

    team   = relationship("InternalTournamentTeam", back_populates="players")
    member = relationship("Member")

    __table_args__ = (UniqueConstraint("team_id", "member_id", name="uq_int_team_player"),)
