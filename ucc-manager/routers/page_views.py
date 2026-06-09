from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session
from database import get_db
from dependencies.auth import get_current_user
from models.page_view import PageView

router = APIRouter(prefix="/api/page-views", tags=["page-views"])


class PageViewCreate(BaseModel):
    page: str


@router.post("", status_code=204)
def track_view(body: PageViewCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    db.add(PageView(page=body.page[:100], user_id=user.id))
    db.commit()


@router.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    since = datetime.now(timezone.utc) - timedelta(days=30)
    rows = (
        db.query(PageView.page, func.count(PageView.id).label("count"))
        .filter(PageView.visited_at >= since)
        .group_by(PageView.page)
        .order_by(func.count(PageView.id).desc())
        .limit(8)
        .all()
    )
    total = sum(r.count for r in rows)
    return [
        {"page": r.page, "count": r.count, "pct": round(r.count / total * 100) if total else 0}
        for r in rows
    ]
