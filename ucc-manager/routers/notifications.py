from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
from database import get_db
from models.event import Event
from models.member import Member
from models.notification import NotificationLog
from services.email import send_email, availability_request_html
from services.scheduler import send_scheduled_reminders

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


class NotificationLogOut(BaseModel):
    id: int
    member_id: int
    type: str
    sent_at: str
    model_config = {"from_attributes": True}


@router.post("/availability/{event_id}")
def send_availability_request(event_id: int, db: Session = Depends(get_db)):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    members = db.query(Member).filter(
        Member.is_active == True,
        Member.email != None,
        Member.email != "",
    ).all()

    sent, skipped = 0, 0
    for member in members:
        already = db.query(NotificationLog).filter_by(
            event_id=event_id, member_id=member.id, type="availability_request"
        ).first()
        if already:
            skipped += 1
            continue
        subject = f"[UCC] Availability Request – {event.title}"
        if send_email(member.email, subject, availability_request_html(member.name, event)):
            db.add(NotificationLog(event_id=event_id, member_id=member.id, type="availability_request"))
            db.commit()
            sent += 1

    return {"sent": sent, "skipped": skipped, "total_with_email": len(members)}


@router.get("/log/{event_id}")
def get_log(event_id: int, db: Session = Depends(get_db)):
    logs = db.query(NotificationLog).filter(NotificationLog.event_id == event_id).all()
    result = []
    for log in logs:
        member = db.query(Member).filter(Member.id == log.member_id).first()
        result.append({
            "id": log.id,
            "member": member.name if member else "—",
            "type": log.type,
            "sent_at": log.sent_at.isoformat() if log.sent_at else None,
        })
    return result


@router.post("/trigger-reminders")
def trigger_reminders():
    send_scheduled_reminders()
    return {"status": "done"}
