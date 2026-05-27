import logging
from datetime import datetime, timezone, timedelta
from database import SessionLocal
from models.event import Event
from models.member import Member
from models.notification import NotificationLog
from services.email import send_email, reminder_html

logger = logging.getLogger(__name__)


def send_scheduled_reminders():
    db = SessionLocal()
    try:
        today = datetime.now(timezone.utc).date()
        checks = [
            (2, "reminder_48h", "Reminder: 2 days to go"),
            (1, "reminder_24h", "Reminder: tomorrow"),
        ]
        for delta, notif_type, label in checks:
            target_date = today + timedelta(days=delta)
            events = db.query(Event).filter(Event.date == target_date).all()
            for event in events:
                members = db.query(Member).filter(
                    Member.is_active == True,
                    Member.email != None,
                    Member.email != "",
                ).all()
                for member in members:
                    already = db.query(NotificationLog).filter_by(
                        event_id=event.id, member_id=member.id, type=notif_type
                    ).first()
                    if already:
                        continue
                    subject = f"[UCC] {label} – {event.title}"
                    if send_email(member.email, subject, reminder_html(member.name, event)):
                        db.add(NotificationLog(event_id=event.id, member_id=member.id, type=notif_type))
                        db.commit()
    except Exception as e:
        logger.error("Reminder job error: %s", e)
    finally:
        db.close()
