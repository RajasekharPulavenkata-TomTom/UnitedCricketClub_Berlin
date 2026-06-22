from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session
from database import get_db
from dependencies.auth import get_current_user
from models.page_view import PageView

router = APIRouter(prefix="/api/page-views", tags=["page-views"])


class PageViewCreate(BaseModel):
    page: str
    nav_ms: Optional[int] = None
    device: Optional[str] = None


@router.post("", status_code=204)
def track_view(body: PageViewCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    db.add(PageView(
        page=body.page[:100],
        user_id=user.id,
        nav_ms=body.nav_ms if body.nav_ms and 50 <= body.nav_ms <= 60_000 else None,
        device=body.device if body.device in ("mobile", "desktop") else None,
    ))
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


@router.get("/perf")
def get_perf(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if current_user.role not in ("admin", "root"):
        raise HTTPException(status_code=403, detail="Admin access required")

    now = datetime.now(timezone.utc)
    since_30d = now - timedelta(days=30)
    since_7d  = now - timedelta(days=7)
    since_14d = now - timedelta(days=14)

    rows = (
        db.query(PageView)
        .filter(PageView.visited_at >= since_30d, PageView.nav_ms.isnot(None))
        .all()
    )

    def _avg(lst):
        return round(sum(lst) / len(lst)) if lst else None

    def _p75(lst):
        if not lst:
            return None
        s = sorted(lst)
        return s[min(int(len(s) * 0.75), len(s) - 1)]

    # Aggregate per page
    page_buckets = defaultdict(lambda: {"all": [], "mobile": [], "desktop": []})
    all_ms, mobile_ms, desktop_ms = [], [], []
    this_week, last_week = [], []

    for r in rows:
        page_buckets[r.page]["all"].append(r.nav_ms)
        all_ms.append(r.nav_ms)
        if r.device == "mobile":
            page_buckets[r.page]["mobile"].append(r.nav_ms)
            mobile_ms.append(r.nav_ms)
        elif r.device == "desktop":
            page_buckets[r.page]["desktop"].append(r.nav_ms)
            desktop_ms.append(r.nav_ms)
        if r.visited_at.replace(tzinfo=timezone.utc) >= since_7d:
            this_week.append(r.nav_ms)
        elif r.visited_at.replace(tzinfo=timezone.utc) >= since_14d:
            last_week.append(r.nav_ms)

    pages = sorted(
        [
            {
                "page": page,
                "visits": len(d["all"]),
                "avg_ms": _avg(d["all"]),
                "p75_ms": _p75(d["all"]),
                "mobile_avg_ms": _avg(d["mobile"]),
                "desktop_avg_ms": _avg(d["desktop"]),
            }
            for page, d in page_buckets.items()
        ],
        key=lambda x: -x["visits"],
    )[:25]

    tw_avg = _avg(this_week)
    lw_avg = _avg(last_week)
    trend_pct = (
        round((lw_avg - tw_avg) / lw_avg * 100) if tw_avg and lw_avg else None
    )

    return {
        "summary": {
            "total_navigations": len(all_ms),
            "avg_ms": _avg(all_ms),
            "p75_ms": _p75(all_ms),
            "mobile_avg_ms": _avg(mobile_ms),
            "desktop_avg_ms": _avg(desktop_ms),
            "mobile_pct": round(len(mobile_ms) / len(all_ms) * 100) if all_ms else 0,
        },
        "pages": pages,
        "trend": {
            "this_week_avg": tw_avg,
            "last_week_avg": lw_avg,
            "improvement_pct": trend_pct,
        },
    }
