from sqlalchemy import Column, String
from database import Base


class ClubSetting(Base):
    __tablename__ = "club_settings"
    key   = Column(String, primary_key=True)
    value = Column(String, nullable=True)
