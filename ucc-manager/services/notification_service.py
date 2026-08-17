import logging
import os
import threading
from html import escape as _esc

logger = logging.getLogger(__name__)

_SENDGRID_KEY = os.getenv("UCC_NOTIFICATION", "")
_SENDER = os.getenv("NOTIFICATION_SENDER_EMAIL", "unitedcc.berlin@gmail.com")
_APP_URL = os.getenv("APP_URL", "").rstrip("/")


def _do_send(recipients: list[str], subject: str, html: str) -> None:
    try:
        from sendgrid import SendGridAPIClient
        from sendgrid.helpers.mail import Mail
        msg = Mail(from_email=_SENDER, to_emails=recipients, subject=subject, html_content=html)
        resp = SendGridAPIClient(_SENDGRID_KEY).send(msg)
        if resp.status_code not in (200, 202):
            logger.warning("SendGrid returned %s for subject '%s'", resp.status_code, subject)
    except Exception as exc:
        logger.warning("Notification send failed: %s", exc)


def _send(recipients: list[str], subject: str, html: str) -> None:
    recipients = [e for e in recipients if e]
    if not _SENDGRID_KEY or not _SENDER or not recipients:
        return
    threading.Thread(target=_do_send, args=(recipients, subject, html), daemon=True).start()


def _html(subtitle: str, body: str) -> str:
    link = _APP_URL or "#"
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6fa;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr>
          <td style="background:linear-gradient(135deg,#a03a06 0%,#f47920 45%,#1a3a8b 100%);padding:28px 32px;border-radius:8px 8px 0 0;">
            <p style="margin:0;color:#fff;font-size:22px;font-weight:bold;letter-spacing:.3px;">United Cricket Club</p>
            <p style="margin:6px 0 0;color:rgba(255,255,255,.85);font-size:13px;">{subtitle}</p>
          </td>
        </tr>
        <tr>
          <td style="background:#fff;padding:32px;">
            {body}
          </td>
        </tr>
        <tr>
          <td style="background:#1a3a8b;padding:16px 32px;border-radius:0 0 8px 8px;">
            <p style="margin:0;color:rgba(255,255,255,.7);font-size:11px;text-align:center;">
              United Cricket Club &nbsp;&middot;&nbsp; Automated notification &nbsp;&middot;&nbsp;
              <a href="{link}" style="color:rgba(255,255,255,.7);">Open UCC Manager</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _btn(text: str, url: str) -> str:
    return (
        f'<a href="{url}" style="display:inline-block;background:#f47920;color:#fff;'
        f'text-decoration:none;padding:11px 28px;border-radius:6px;font-size:14px;'
        f'font-weight:bold;margin-top:16px;">{text}</a>'
    )


def _row(label: str, value: str) -> str:
    return (
        f'<tr>'
        f'<td style="padding:6px 0;color:#6c757d;font-size:13px;width:130px;">{label}</td>'
        f'<td style="padding:6px 0;color:#212529;font-size:14px;font-weight:600;">{value}</td>'
        f'</tr>'
    )


def notify_event_created(
    title: str,
    date: str,
    event_type: str,
    location: str | None,
    match_time: str | None,
    notes: str | None,
    recipients: list[str],
) -> None:
    type_label = _esc(event_type.replace("_", " ").title()) if event_type else "Event"
    rows = [_row("Type", type_label), _row("Date", _esc(date))]
    if location:
        rows.append(_row("Location", _esc(location)))
    if match_time:
        rows.append(_row("Time", _esc(match_time)))
    if notes:
        rows.append(_row("Notes", _esc(notes)))

    body = f"""
    <p style="margin:0 0 20px;color:#212529;font-size:16px;">
      A new <strong>{type_label}</strong> has been added to the calendar.
    </p>
    <table cellpadding="0" cellspacing="0" style="width:100%;border-top:2px solid #f47920;padding-top:12px;">
      {"".join(rows)}
    </table>
    <p style="margin:20px 0 0;">{_btn("Mark Your Availability", _APP_URL or "#")}</p>
    """
    _send(recipients, f"[UCC] New event: {title} on {date}", _html(f"New Event: {_esc(title)}", body))


def notify_task_assigned(
    task_title: str,
    priority: str,
    due_date: str | None,
    description: str | None,
    member_name: str,
    recipient_email: str,
) -> None:
    rows = [_row("Task", _esc(task_title)), _row("Priority", _esc(priority.title()))]
    if due_date:
        rows.append(_row("Due", _esc(due_date)))
    if description:
        rows.append(_row("Details", _esc(description)))

    badge_color = {"high": "#dc3545", "medium": "#f47920", "low": "#198754"}.get(priority, "#6c757d")
    body = f"""
    <p style="margin:0 0 20px;color:#212529;font-size:16px;">
      Hi <strong>{_esc(member_name)}</strong>, a task has been assigned to you.
    </p>
    <table cellpadding="0" cellspacing="0" style="width:100%;border-top:2px solid #f47920;padding-top:12px;">
      {"".join(rows)}
    </table>
    <p style="margin:16px 0 0;">
      Priority: <span style="display:inline-block;background:{badge_color};color:#fff;
      padding:3px 10px;border-radius:4px;font-size:12px;font-weight:bold;">{_esc(priority.upper())}</span>
    </p>
    <p style="margin:20px 0 0;">{_btn("View Tasks", _APP_URL or "#")}</p>
    """
    _send([recipient_email], f"[UCC] Task assigned: {task_title}", _html(f"Task Assigned: {_esc(task_title)}", body))


def notify_transaction_decision(
    tx_description: str,
    tx_amount: str,
    tx_type: str,
    decision: str,
    member_name: str,
    recipient_email: str,
) -> None:
    approved = decision == "approved"
    badge_color = "#198754" if approved else "#dc3545"
    badge_text = "APPROVED" if approved else "REJECTED"
    body = f"""
    <p style="margin:0 0 20px;color:#212529;font-size:16px;">
      Hi <strong>{_esc(member_name)}</strong>, your transaction submission has been reviewed.
    </p>
    <table cellpadding="0" cellspacing="0" style="width:100%;border-top:2px solid #f47920;padding-top:12px;">
      {_row("Description", _esc(tx_description) or "—")}
      {_row("Amount", f"&euro;{_esc(tx_amount)}")}
      {_row("Type", _esc(tx_type.title()))}
    </table>
    <p style="margin:16px 0 0;">
      Status: <span style="display:inline-block;background:{badge_color};color:#fff;
      padding:3px 10px;border-radius:4px;font-size:12px;font-weight:bold;">{badge_text}</span>
    </p>
    <p style="margin:20px 0 0;">{_btn("View Finance Dashboard", _APP_URL or "#")}</p>
    """
    subject = f"[UCC] Transaction {decision}: {tx_description or tx_amount}"
    _send([recipient_email], subject, _html(f"Transaction {badge_text.title()}", body))


def notify_user_approved(
    username: str,
    full_name: str | None,
    recipient_email: str,
) -> None:
    display = _esc(full_name or username)
    body = f"""
    <p style="margin:0 0 16px;color:#212529;font-size:16px;">
      Welcome to United Cricket Club, <strong>{display}</strong>!
    </p>
    <p style="margin:0 0 24px;color:#6c757d;font-size:14px;line-height:1.6;">
      Your account has been approved. You can now log in to UCC Manager to access the
      calendar, mark your availability, and stay up to date with the club.
    </p>
    <p style="margin:0;">{_btn("Log In to UCC Manager", _APP_URL or "#")}</p>
    """
    _send([recipient_email], "[UCC] Your account has been approved", _html("Account Approved", body))


def notify_password_reset(
    username: str,
    reset_url: str,
    recipient_email: str,
) -> None:
    body = f"""
    <p style="margin:0 0 16px;color:#212529;font-size:16px;">
      Hi <strong>{_esc(username)}</strong>,
    </p>
    <p style="margin:0 0 24px;color:#6c757d;font-size:14px;line-height:1.6;">
      We received a request to reset your UCC Manager password. Click the button
      below to choose a new one. The link is valid for 30 minutes and can be
      used once.
    </p>
    <p style="margin:0;">{_btn("Reset Password", reset_url)}</p>
    <p style="margin:24px 0 0;color:#adb5bd;font-size:12px;line-height:1.6;">
      If you didn't request this, you can safely ignore this email — your
      password is unchanged.
    </p>
    """
    _send([recipient_email], "[UCC] Password reset", _html("Password Reset", body))


def notify_election_nominations_open(
    title: str,
    description: str | None,
    seats: int,
    nominations_close_at: str | None,
    recipients: list[str],
) -> None:
    rows = [_row("Election", _esc(title)), _row("Seats available", str(seats))]
    if nominations_close_at:
        rows.append(_row("Nominations close", _esc(nominations_close_at)))
    desc_html = (
        f'<p style="margin:0 0 20px;color:#6c757d;font-size:14px;">{_esc(description)}</p>'
        if description else ""
    )
    body = f"""
    <p style="margin:0 0 8px;color:#212529;font-size:16px;">Nominations are now open for a new manager election.</p>
    <p style="margin:0 0 20px;font-size:20px;font-weight:bold;color:#1a3a8b;">{_esc(title)}</p>
    {desc_html}
    <table cellpadding="0" cellspacing="0" style="width:100%;border-top:2px solid #f47920;padding-top:12px;">
      {"".join(rows)}
    </table>
    <p style="margin:16px 0 0;color:#6c757d;font-size:14px;">
      Log in to UCC Manager and go to <strong>Manager Election</strong> to nominate yourself.
    </p>
    <p style="margin:20px 0 0;">{_btn("Nominate Yourself", _APP_URL or "#")}</p>
    """
    _send(recipients, f"[UCC] Nominations open: {title}", _html(f"Nominations Open: {_esc(title)}", body))


def notify_election_voting_open(
    title: str,
    candidate_names: list[str],
    seats: int,
    recipients: list[str],
) -> None:
    required = min(seats, len(candidate_names))
    cands_html = "".join(
        f'<li style="padding:4px 0;color:#212529;font-size:14px;">&middot; {_esc(name)}</li>'
        for name in candidate_names
    )
    body = f"""
    <p style="margin:0 0 8px;color:#212529;font-size:16px;">Nominations have closed and voting is now open.</p>
    <p style="margin:0 0 20px;font-size:20px;font-weight:bold;color:#1a3a8b;">{_esc(title)}</p>
    <p style="margin:0 0 8px;color:#6c757d;font-size:13px;">CANDIDATES</p>
    <ul style="margin:0 0 16px;padding:0;list-style:none;">
      {cands_html}
    </ul>
    <p style="margin:0 0 20px;color:#6c757d;font-size:14px;">
      You must vote for exactly <strong>{required}</strong> candidate{'s' if required != 1 else ''}.
      Log in to UCC Manager to cast your vote.
    </p>
    <p style="margin:0;">{_btn("Cast Your Vote", _APP_URL or "#")}</p>
    """
    _send(recipients, f"[UCC] Voting open: {title}", _html(f"Voting Open: {_esc(title)}", body))


def notify_election_closed(
    title: str,
    winners: list[str],
    recipients: list[str],
) -> None:
    winners_html = "".join(
        f'<li style="padding:6px 0;color:#212529;font-size:15px;font-weight:bold;">'
        f'&#127942; {_esc(name)}</li>'
        for name in winners
    )
    body = f"""
    <p style="margin:0 0 8px;color:#212529;font-size:16px;">The election has closed. Here are the results.</p>
    <p style="margin:0 0 20px;font-size:20px;font-weight:bold;color:#1a3a8b;">{_esc(title)}</p>
    <p style="margin:0 0 8px;color:#6c757d;font-size:13px;">ELECTED</p>
    <ul style="margin:0 0 24px;padding:0;list-style:none;border-top:2px solid #f47920;padding-top:12px;">
      {winners_html}
    </ul>
    <p style="margin:0;">{_btn("View Full Results", _APP_URL or "#")}</p>
    """
    _send(recipients, f"[UCC] Election results: {title}", _html(f"Election Results: {_esc(title)}", body))


def notify_poll_published(
    poll_title: str,
    description: str | None,
    options: list[str],
    recipients: list[str],
) -> None:
    opts_html = "".join(
        f'<li style="padding:4px 0;color:#212529;font-size:14px;">&middot; {_esc(opt)}</li>'
        for opt in options[:5]
    )
    more = (
        f'<li style="color:#6c757d;font-size:13px;">...and {len(options) - 5} more</li>'
        if len(options) > 5 else ""
    )
    desc_html = (
        f'<p style="margin:0 0 16px;color:#6c757d;font-size:14px;">{_esc(description)}</p>'
        if description else ""
    )
    body = f"""
    <p style="margin:0 0 8px;color:#212529;font-size:16px;">A new poll is live and waiting for your vote.</p>
    <p style="margin:0 0 20px;font-size:20px;font-weight:bold;color:#1a3a8b;">{_esc(poll_title)}</p>
    {desc_html}
    <ul style="margin:0 0 16px;padding:0;list-style:none;">
      {opts_html}
      {more}
    </ul>
    <p style="margin:20px 0 0;">{_btn("Cast Your Vote", _APP_URL or "#")}</p>
    """
    _send(recipients, f"[UCC] New poll: {poll_title}", _html(f"New Poll: {_esc(poll_title)}", body))
