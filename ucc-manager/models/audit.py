from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime
from database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id          = Column(Integer, primary_key=True, index=True)
    created_at  = Column(DateTime, default=datetime.utcnow)
    action      = Column(String)       # added | updated | deleted | archived | returned
    entity_type = Column(String)       # member | event | transaction | equipment | assignment
    entity_id   = Column(Integer, nullable=True)
    description = Column(String)
