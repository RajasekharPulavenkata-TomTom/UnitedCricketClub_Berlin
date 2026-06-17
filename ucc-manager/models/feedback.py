from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from database import Base


def _now():
    return datetime.now(timezone.utc)


PILLARS = [
    (1, "Strategic Leadership & Vision",   "bi-compass",             "#1e40af"),
    (2, "People, Culture & Community",     "bi-people-fill",         "#c2410c"),
    (3, "Operational Excellence",          "bi-gear-wide-connected", "#166534"),
    (4, "External Relations & Growth",     "bi-globe2",              "#5b21b6"),
]


class FeedbackSession(Base):
    __tablename__ = "feedback_sessions"
    id            = Column(Integer, primary_key=True)
    title         = Column(String(200), nullable=False)
    election_id   = Column(Integer, ForeignKey("elections.id", ondelete="SET NULL"), nullable=True)
    status        = Column(String(20), default="open", nullable=False)  # open | closed
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at    = Column(DateTime(timezone=True), default=_now)
    closed_at     = Column(DateTime(timezone=True), nullable=True)

    ratings    = relationship("FeedbackRating",    back_populates="session", cascade="all, delete-orphan")
    submitters = relationship("FeedbackSubmitter", back_populates="session", cascade="all, delete-orphan")


class FeedbackRating(Base):
    """One row per pillar per submission — no submitter identity stored (anonymous)."""
    __tablename__ = "feedback_ratings"
    id           = Column(Integer, primary_key=True)
    session_id   = Column(Integer, ForeignKey("feedback_sessions.id", ondelete="CASCADE"), nullable=False)
    pillar       = Column(Integer, nullable=False)   # 1–4
    rating       = Column(Integer, nullable=False)   # 1–5
    submitted_at = Column(DateTime(timezone=True), default=_now)

    session = relationship("FeedbackSession", back_populates="ratings")


class FeedbackSubmitter(Base):
    """Tracks *who* has submitted — but NOT what they rated (preserves anonymity)."""
    __tablename__ = "feedback_submitters"
    id           = Column(Integer, primary_key=True)
    session_id   = Column(Integer, ForeignKey("feedback_sessions.id", ondelete="CASCADE"), nullable=False)
    user_id      = Column(Integer, ForeignKey("users.id",              ondelete="CASCADE"), nullable=False)
    submitted_at = Column(DateTime(timezone=True), default=_now)

    session = relationship("FeedbackSession", back_populates="submitters")

    __table_args__ = (UniqueConstraint("session_id", "user_id", name="uq_feedback_submitter"),)
