from typing import Optional
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database import get_db
from models.audit import AuditLog
from models.auth import User
from dependencies.auth import get_current_user

router = APIRouter(prefix="/api", tags=["audit"])


def log(db: Session, action: str, entity_type: str, entity_id: Optional[int], description: str, user=None):
    """Add an audit entry to the current session (committed by the caller)."""
    db.add(AuditLog(
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        description=description,
        user_id=user.id if user else None,
        user_name=user.full_name or user.username if user else None,
    ))


@router.get("/history")
def get_history(
    entity_type: Optional[str] = None,
    limit: int = Query(default=100, le=500),
    days: int = Query(default=90, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("manager", "developer"):
        raise HTTPException(status_code=403, detail="Admin access required")
    q = db.query(AuditLog)
    if entity_type:
        q = q.filter(AuditLog.entity_type == entity_type)
    if days > 0:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        q = q.filter(AuditLog.created_at >= cutoff)
    rows = q.order_by(AuditLog.created_at.desc()).limit(limit).all()
    return [
        {
            "id":          r.id,
            "created_at":  r.created_at.isoformat(),
            "action":      r.action,
            "entity_type": r.entity_type,
            "entity_id":   r.entity_id,
            "description": r.description,
            "user_name":   r.user_name,
        }
        for r in rows
    ]
