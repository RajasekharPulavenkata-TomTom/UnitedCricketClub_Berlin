import os
import logging
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

logger = logging.getLogger(__name__)

SENDGRID_API_KEY = os.environ.get("SENDGRID_API_KEY")
FROM_EMAIL = os.environ.get("FROM_EMAIL", "noreply@unitedcricketclub.de")
APP_BASE_URL = os.environ.get("APP_BASE_URL", "https://united-cricket-club.fly.dev")


def send_email(to_email: str, subject: str, html: str) -> bool:
    if not SENDGRID_API_KEY:
        logger.warning("SENDGRID_API_KEY not set — skipping email to %s", to_email)
        return False
    try:
        sg = SendGridAPIClient(SENDGRID_API_KEY)
        sg.send(Mail(from_email=FROM_EMAIL, to_emails=to_email, subject=subject, html_content=html))
        logger.info("Email sent to %s: %s", to_email, subject)
        return True
    except Exception as e:
        logger.error("Failed to send email to %s: %s", to_email, e)
        return False


def _base(content: str) -> str:
    return f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8f9fa;padding:20px">
      <div style="background:linear-gradient(135deg,#1a3a8b,#1e4db7);padding:20px 24px;border-radius:8px 8px 0 0">
        <h2 style="color:#fff;margin:0;font-size:20px">United Cricket Club</h2>
      </div>
      <div style="background:#fff;padding:24px;border-radius:0 0 8px 8px;border:1px solid #dee2e6">
        {content}
        <hr style="border:none;border-top:1px solid #dee2e6;margin:24px 0"/>
        <p style="color:#6c757d;font-size:12px;margin:0">
          United Cricket Club · <a href="{APP_BASE_URL}" style="color:#1a3a8b">{APP_BASE_URL}</a>
        </p>
      </div>
    </div>"""


def reminder_html(member_name: str, event) -> str:
    event_type = event.type.capitalize() if event.type else "Event"
    date_str = event.date.strftime("%A, %d %B %Y") if event.date else "—"
    location = event.location or "TBC"
    return _base(f"""
        <p style="color:#333">Hi <strong>{member_name}</strong>,</p>
        <p style="color:#333">This is a reminder about your upcoming {event_type.lower()}:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px;color:#6c757d;width:30%">Event</td>
              <td style="padding:8px;font-weight:bold;color:#333">{event.title}</td></tr>
          <tr style="background:#f8f9fa">
              <td style="padding:8px;color:#6c757d">Date</td>
              <td style="padding:8px;color:#333">{date_str}</td></tr>
          <tr><td style="padding:8px;color:#6c757d">Location</td>
              <td style="padding:8px;color:#333">{location}</td></tr>
        </table>
        <p style="color:#333">See you on the pitch!</p>
        <a href="{APP_BASE_URL}" style="display:inline-block;background:#1a3a8b;color:#fff;
           padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold">
          Open Portal
        </a>""")


def availability_request_html(member_name: str, event) -> str:
    event_type = event.type.capitalize() if event.type else "Event"
    date_str = event.date.strftime("%A, %d %B %Y") if event.date else "—"
    location = event.location or "TBC"
    avail_url = f"{APP_BASE_URL}/avail.html"
    return _base(f"""
        <p style="color:#333">Hi <strong>{member_name}</strong>,</p>
        <p style="color:#333">Please confirm your availability for the upcoming {event_type.lower()}:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px;color:#6c757d;width:30%">Event</td>
              <td style="padding:8px;font-weight:bold;color:#333">{event.title}</td></tr>
          <tr style="background:#f8f9fa">
              <td style="padding:8px;color:#6c757d">Date</td>
              <td style="padding:8px;color:#333">{date_str}</td></tr>
          <tr><td style="padding:8px;color:#6c757d">Location</td>
              <td style="padding:8px;color:#333">{location}</td></tr>
        </table>
        <p style="color:#333">Click below to confirm your availability:</p>
        <a href="{avail_url}" style="display:inline-block;background:#198754;color:#fff;
           padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold">
          Confirm Availability
        </a>""")
