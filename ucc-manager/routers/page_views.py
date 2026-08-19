from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import case, func
from sqlalchemy.orm import Session
from database import get_db
from dependencies.auth import get_current_user
from models.page_view import PageView

router = APIRouter(prefix="/api/page-views", tags=["page-views"])


class PageViewCreate(BaseModel):
    page: str
    nav_ms: Optional[int] = None
    device: Optional[str] = None
    is_first: Optional[bool] = None


@router.post("", status_code=204)
def track_view(body: PageViewCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    db.add(PageView(
        page=body.page[:100],
        user_id=user.id,
        nav_ms=body.nav_ms if body.nav_ms and 50 <= body.nav_ms <= 60_000 else None,
        device=body.device if body.device in ("mobile", "desktop") else None,
        is_first=body.is_first,
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
def get_perf(days: int = 30, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if current_user.role not in ("manager", "developer"):
        raise HTTPException(status_code=403, detail="Admin access required")
    if days not in (7, 30, 90):
        raise HTTPException(status_code=422, detail="days must be 7, 30 or 90")

    now = datetime.now(timezone.utc)
    since     = now - timedelta(days=days)
    since_7d  = now - timedelta(days=7)
    since_14d = now - timedelta(days=14)

    def _round(v):
        return round(v) if v is not None else None

    base_filter = (PageView.visited_at >= since, PageView.nav_ms.isnot(None))
    mobile_ms  = case((PageView.device == "mobile", PageView.nav_ms))
    desktop_ms = case((PageView.device == "desktop", PageView.nav_ms))

    summary = (
        db.query(
            func.count().label("total"),
            func.avg(PageView.nav_ms).label("avg_ms"),
            func.percentile_cont(0.75).within_group(PageView.nav_ms).label("p75_ms"),
            func.percentile_cont(0.95).within_group(PageView.nav_ms).label("p95_ms"),
            func.avg(case((PageView.nav_ms >= 1200, 1.0), else_=0.0)).label("slow_rate"),
            func.avg(case((PageView.is_first == True, PageView.nav_ms))).label("first_avg_ms"),
            func.avg(case((PageView.is_first == False, PageView.nav_ms))).label("inapp_avg_ms"),
            func.avg(mobile_ms).label("mobile_avg_ms"),
            func.avg(desktop_ms).label("desktop_avg_ms"),
            func.count(mobile_ms).label("mobile_count"),
            func.avg(case((PageView.visited_at >= since_7d, PageView.nav_ms))).label("tw_avg"),
            func.avg(case(
                ((PageView.visited_at >= since_14d) & (PageView.visited_at < since_7d), PageView.nav_ms)
            )).label("lw_avg"),
        )
        .filter(*base_filter)
        .one()
    )

    # usage counts everything in the window, including views with no nav timing
    usage = (
        db.query(
            func.count(func.distinct(PageView.user_id)).label("active_users"),
            func.count().label("total_views"),
        )
        .filter(PageView.visited_at >= since)
        .one()
    )

    daily_rows = (
        db.query(
            func.date(PageView.visited_at).label("day"),
            func.count().label("count"),
            func.avg(PageView.nav_ms).label("avg_ms"),
        )
        .filter(*base_filter)
        .group_by(func.date(PageView.visited_at))
        .order_by(func.date(PageView.visited_at))
        .all()
    )

    page_rows = (
        db.query(
            PageView.page,
            func.count().label("visits"),
            func.avg(PageView.nav_ms).label("avg_ms"),
            func.percentile_cont(0.75).within_group(PageView.nav_ms).label("p75_ms"),
            func.avg(mobile_ms).label("mobile_avg_ms"),
            func.avg(desktop_ms).label("desktop_avg_ms"),
        )
        .filter(*base_filter)
        .group_by(PageView.page)
        .order_by(func.count().desc())
        .limit(25)
        .all()
    )

    pages = [
        {
            "page": r.page,
            "visits": r.visits,
            "avg_ms": _round(r.avg_ms),
            "p75_ms": _round(r.p75_ms),
            "mobile_avg_ms": _round(r.mobile_avg_ms),
            "desktop_avg_ms": _round(r.desktop_avg_ms),
        }
        for r in page_rows
    ]

    tw_avg = _round(summary.tw_avg)
    lw_avg = _round(summary.lw_avg)
    trend_pct = (
        round((lw_avg - tw_avg) / lw_avg * 100) if tw_avg and lw_avg else None
    )

    return {
        "summary": {
            "total_navigations": summary.total,
            "avg_ms": _round(summary.avg_ms),
            "p75_ms": _round(summary.p75_ms),
            "p95_ms": _round(summary.p95_ms),
            "slow_pct": round(summary.slow_rate * 100) if summary.slow_rate is not None else 0,
            "first_avg_ms": _round(summary.first_avg_ms),
            "inapp_avg_ms": _round(summary.inapp_avg_ms),
            "active_users": usage.active_users,
            "total_views": usage.total_views,
            "mobile_avg_ms": _round(summary.mobile_avg_ms),
            "desktop_avg_ms": _round(summary.desktop_avg_ms),
            "mobile_pct": round(summary.mobile_count / summary.total * 100) if summary.total else 0,
        },
        "daily": [
            {"date": str(r.day), "count": r.count, "avg_ms": _round(r.avg_ms)}
            for r in daily_rows
        ],
        "window_days": days,
        "pages": pages,
        "trend": {
            "this_week_avg": tw_avg,
            "last_week_avg": lw_avg,
            "improvement_pct": trend_pct,
        },
    }
