from sqlalchemy import Column, Integer, Boolean, Text, ForeignKey, UniqueConstraint
from database import Base


class MemberPayment(Base):
    __tablename__ = "member_payments"
    __table_args__ = (UniqueConstraint("member_id", "year", name="uq_member_payment_year"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    member_id = Column(Integer, ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True)
    year = Column(Integer, nullable=False)
    anmeldung = Column(Boolean, nullable=False, default=False)   # €20 registration
    dezember = Column(Boolean, nullable=False, default=False)    # €13
    quarterly = Column(Boolean, nullable=False, default=False)   # €45
    yearly = Column(Boolean, nullable=False, default=False)      # €156
    sepa = Column(Boolean, nullable=False, default=False)        # direct-debit flag
    notes = Column(Text)
