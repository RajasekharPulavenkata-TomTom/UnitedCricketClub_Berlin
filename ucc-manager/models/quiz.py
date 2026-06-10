from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from database import Base


def _now():
    return datetime.now(timezone.utc)


class QuizQuestion(Base):
    __tablename__ = "quiz_questions"

    id               = Column(Integer, primary_key=True, autoincrement=True)
    question         = Column(Text, nullable=False)
    correct_answer   = Column(Text, nullable=False)
    incorrect_answers = Column(JSONB, nullable=False)   # list[str] of 3 wrong answers
    difficulty       = Column(String(10))               # easy | medium | hard
    category         = Column(String(100))
    question_type    = Column(String(20), default="text")   # text | field
    field_position   = Column(String(50), nullable=True)    # position key for field questions
    fetched_at       = Column(DateTime(timezone=True), default=_now, nullable=False)
