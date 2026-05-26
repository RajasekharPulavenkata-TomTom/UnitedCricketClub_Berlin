from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from database import get_db
from models.audit import AuditLog

router = APIRouter(prefix="/api", tags=["audit"])


def log(db: Session, action: str, entity_type: str, entity_id: Optional[int], description: str):
    """Add an audit entry to the current session (committed by the caller)."""
    db.add(AuditLog(action=action, entity_type=entity_type, entity_id=entity_id, description=description))


@router.get("/history")
def get_history(
    entity_type: Optional[str] = None,
    limit: int = Query(default=100, le=500),
    db: Session = Depends(get_db),
):
    q = db.query(AuditLog)
    if entity_type:
        q = q.filter(AuditLog.entity_type == entity_type)
    rows = q.order_by(AuditLog.created_at.desc()).limit(limit).all()
    return [
        {
            "id":          r.id,
            "created_at":  r.created_at.isoformat(),
            "action":      r.action,
            "entity_type": r.entity_type,
            "entity_id":   r.entity_id,
            "description": r.description,
        }
        for r in rows
    ]
