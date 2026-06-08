from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from database import Base


class Poll(Base):
    __tablename__ = "polls"
    id            = Column(Integer, primary_key=True)
    title         = Column(String(200), nullable=False)
    description   = Column(Text, nullable=True)
    is_anonymous  = Column(Boolean, default=False, nullable=False)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at    = Column(DateTime, default=datetime.utcnow)
    closes_at     = Column(DateTime, nullable=True)
    is_closed     = Column(Boolean, default=False, nullable=False)
    options            = relationship("PollOption",          back_populates="poll", cascade="all, delete-orphan", order_by="PollOption.position")
    votes              = relationship("PollVote",            back_populates="poll", cascade="all, delete-orphan")
    anonymous_voters   = relationship("PollAnonymousVoter",  back_populates="poll", cascade="all, delete-orphan")


class PollOption(Base):
    __tablename__ = "poll_options"
    id       = Column(Integer, primary_key=True)
    poll_id  = Column(Integer, ForeignKey("polls.id", ondelete="CASCADE"), nullable=False)
    text     = Column(String(200), nullable=False)
    position = Column(Integer, default=0)
    poll     = relationship("Poll", back_populates="options")
    votes    = relationship("PollVote", back_populates="option", cascade="all, delete-orphan")


class PollVote(Base):
    __tablename__ = "poll_votes"
    id        = Column(Integer, primary_key=True)
    poll_id   = Column(Integer, ForeignKey("polls.id", ondelete="CASCADE"), nullable=False)
    option_id = Column(Integer, ForeignKey("poll_options.id", ondelete="CASCADE"), nullable=False)
    user_id   = Column(Integer, ForeignKey("users.id"), nullable=True)   # NULL for anonymous votes
    voted_at  = Column(DateTime, default=datetime.utcnow)
    poll      = relationship("Poll", back_populates="votes")
    option    = relationship("PollOption", back_populates="votes")
    # Uniqueness enforced via partial index in migration (only when user_id IS NOT NULL)


class PollAnonymousVoter(Base):
    """Tracks *who* has voted in an anonymous poll — but NOT which option they chose."""
    __tablename__ = "poll_anonymous_voters"
    id        = Column(Integer, primary_key=True)
    poll_id   = Column(Integer, ForeignKey("polls.id", ondelete="CASCADE"), nullable=False)
    user_id   = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    voted_at  = Column(DateTime, default=datetime.utcnow)
    poll      = relationship("Poll", back_populates="anonymous_voters")
    __table_args__ = (UniqueConstraint("poll_id", "user_id", name="uq_anon_poll_user"),)
