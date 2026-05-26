from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, DateTime
from database import Base


def _now():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), nullable=False, unique=True)
    full_name = Column(String(150))
    hashed_password = Column(String(200), nullable=False)
    role = Column(String(10), nullable=False)  # root | admin | user
    is_active = Column(Boolean, nullable=False, default=True)
    status = Column(String(10), nullable=False, default="active")  # active | pending | rejected
    created_at = Column(DateTime, default=_now)
