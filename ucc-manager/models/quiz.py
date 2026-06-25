from sqlalchemy import Column, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSON
from database import Base


class QuizQuestion(Base):
    __tablename__ = "quiz_questions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    question = Column(Text, nullable=False)
    options = Column(JSON, nullable=False)          # list of 4 option strings
    correct = Column(String(300), nullable=False)   # one of the options strings
    difficulty = Column(String(10), nullable=False) # easy | medium | hard
    question_type = Column(String(20), nullable=False, default="general")  # general | field
    category = Column(String(50), nullable=False, default="Cricket")
    field_position = Column(String(100), nullable=True)  # set for field-type questions
