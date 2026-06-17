from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from database import Base


def _now():
    return datetime.now(timezone.utc)


class Election(Base):
    __tablename__ = "elections"
    id            = Column(Integer, primary_key=True)
    title         = Column(String(200), nullable=False)
    description   = Column(Text, nullable=True)
    # nominating → voting → closed
    status        = Column(String(20), default="nominating", nullable=False)
    seats         = Column(Integer, default=3, nullable=False)
    created_by_id        = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at           = Column(DateTime(timezone=True), default=_now)
    nominations_close_at = Column(DateTime(timezone=True), nullable=True)
    closed_at            = Column(DateTime(timezone=True), nullable=True)

    candidates   = relationship("ElectionCandidate",  back_populates="election", cascade="all, delete-orphan")
    votes        = relationship("ElectionVote",        back_populates="election", cascade="all, delete-orphan")
    voters       = relationship("ElectionVoter",       back_populates="election", cascade="all, delete-orphan")
    nominations  = relationship("ElectionNomination",  back_populates="election", cascade="all, delete-orphan")


class ElectionCandidate(Base):
    __tablename__ = "election_candidates"
    id          = Column(Integer, primary_key=True)
    election_id = Column(Integer, ForeignKey("elections.id", ondelete="CASCADE"), nullable=False)
    member_id   = Column(Integer, ForeignKey("members.id",  ondelete="CASCADE"), nullable=False)

    election = relationship("Election",          back_populates="candidates")
    member   = relationship("Member")
    votes    = relationship("ElectionVote", back_populates="candidate", cascade="all, delete-orphan")

    __table_args__ = (UniqueConstraint("election_id", "member_id", name="uq_election_candidate"),)


class ElectionVote(Base):
    """One row per cast ballot — no voter identity stored (anonymous)."""
    __tablename__ = "election_votes"
    id           = Column(Integer, primary_key=True)
    election_id  = Column(Integer, ForeignKey("elections.id",           ondelete="CASCADE"), nullable=False)
    candidate_id = Column(Integer, ForeignKey("election_candidates.id", ondelete="CASCADE"), nullable=False)
    voted_at     = Column(DateTime(timezone=True), default=_now)

    election  = relationship("Election",          back_populates="votes")
    candidate = relationship("ElectionCandidate", back_populates="votes")


class ElectionVoter(Base):
    """Tracks *who* has voted — but NOT which candidate they chose (preserves anonymity)."""
    __tablename__ = "election_voters"
    id          = Column(Integer, primary_key=True)
    election_id = Column(Integer, ForeignKey("elections.id", ondelete="CASCADE"), nullable=False)
    user_id     = Column(Integer, ForeignKey("users.id",     ondelete="CASCADE"), nullable=False)
    voted_at    = Column(DateTime(timezone=True), default=_now)

    election = relationship("Election", back_populates="voters")

    __table_args__ = (UniqueConstraint("election_id", "user_id", name="uq_election_voter"),)


class ElectionNomination(Base):
    """Self-nomination during the 'nominating' phase."""
    __tablename__ = "election_nominations"
    id           = Column(Integer, primary_key=True)
    election_id  = Column(Integer, ForeignKey("elections.id", ondelete="CASCADE"), nullable=False)
    member_id    = Column(Integer, ForeignKey("members.id",   ondelete="CASCADE"), nullable=False)
    user_id      = Column(Integer, ForeignKey("users.id",     ondelete="CASCADE"), nullable=False)
    nominated_at = Column(DateTime(timezone=True), default=_now)

    election = relationship("Election", back_populates="nominations")
    member   = relationship("Member")

    __table_args__ = (UniqueConstraint("election_id", "user_id", name="uq_election_nomination_user"),)
