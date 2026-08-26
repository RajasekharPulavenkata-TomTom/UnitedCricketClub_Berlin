from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, UniqueConstraint
from database import Base


def _now():
    return datetime.now(timezone.utc)


class MemberDocument(Base):
    """A file attached to a member (currently the DCB Spielerpass PDF). Stored as
    base64 in the DB and kept in its own table so the large blob never loads with
    the normal members list. One document per (member, kind)."""
    __tablename__ = "member_documents"

    id           = Column(Integer, primary_key=True, autoincrement=True)
    member_id    = Column(Integer, ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True)
    kind         = Column(String(30), nullable=False, default="spielerpass")
    filename     = Column(String(200), nullable=False)
    content_type = Column(String(100), nullable=False, default="application/pdf")
    size         = Column(Integer, nullable=False, default=0)
    data_b64     = Column(Text, nullable=False)   # base64-encoded file bytes
    uploaded_at  = Column(DateTime(timezone=True), default=_now)

    __table_args__ = (UniqueConstraint("member_id", "kind", name="uq_member_document_kind"),)
