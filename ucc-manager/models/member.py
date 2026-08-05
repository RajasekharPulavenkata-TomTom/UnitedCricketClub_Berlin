from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean
from database import Base


def _now():
    return datetime.now(timezone.utc)


class Member(Base):
    __tablename__ = "members"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(150), nullable=False, unique=True)
    jersey_name = Column(String(100))
    jersey_number = Column(Integer)
    role = Column(String(50))
    ball_type = Column(String(20))  # Tennis, Leather, Both
    email = Column(String(200))
    phone = Column(String(30))
    dcb_id = Column(String(20))
    membership_no = Column(String(30))          # ACB registration no., e.g. CR1812250162
    id_card_received = Column(Boolean, nullable=False, default=False)
    spielerpass = Column(String(30))            # player-pass status, e.g. "All Set"
    cricheroes = Column(Boolean, nullable=False, default=False)
    cricclubs = Column(Boolean, nullable=False, default=False)
    is_active = Column(Boolean, nullable=False, default=True)
    notes = Column(Text)
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)
