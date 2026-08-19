from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from database import Base


def _now():
    return datetime.now(timezone.utc)


class PageView(Base):
    __tablename__ = "page_views"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    page       = Column(String(100), nullable=False)
    user_id    = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    visited_at = Column(DateTime, default=_now)
    nav_ms     = Column(Integer, nullable=True)   # full navigation time in ms (router start → init done)
    device     = Column(String(10), nullable=True) # "mobile" | "desktop"
    is_first   = Column(Boolean, nullable=True)    # first SPA navigation of the visit; NULL = recorded before this existed
