from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, Integer, String, Text, DateTime
from database import Base


def _now():
    return datetime.now(timezone.utc)


class Sponsor(Base):
    __tablename__ = "sponsors"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    name          = Column(String(150), nullable=False)
    logo_url      = Column(String(500))
    website_url   = Column(String(500))
    description   = Column(Text)
    since_year    = Column(Integer)
    is_active     = Column(Boolean, default=True, nullable=False)
    display_order = Column(Integer, default=0)
    created_at    = Column(DateTime, default=_now)
