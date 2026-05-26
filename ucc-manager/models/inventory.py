from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, Numeric, Date, DateTime, Boolean, ForeignKey, Index
from sqlalchemy.orm import relationship
from database import Base


def _now():
    return datetime.now(timezone.utc)


class EquipmentItem(Base):
    __tablename__ = "equipment_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(150), nullable=False)
    type = Column(String(50), nullable=False)  # bat, ball, helmet, pads, gloves, stumps, jersey, bag, other
    quantity_total = Column(Integer, nullable=False, default=1)
    quantity_available = Column(Integer, nullable=False, default=1)
    condition = Column(String(10), nullable=False, default="Good")  # Good, Fair, Poor
    supplier = Column(String(150))
    serial_number = Column(String(100))
    notes = Column(Text)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)

    assignments = relationship("Assignment", back_populates="equipment")
    maintenance_notes = relationship("MaintenanceNote", back_populates="equipment", order_by="MaintenanceNote.date.desc()")


class Assignment(Base):
    __tablename__ = "assignments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    equipment_id = Column(Integer, ForeignKey("equipment_items.id"), nullable=False)
    member_name = Column(String(150), nullable=False)
    quantity_assigned = Column(Integer, nullable=False, default=1)
    assigned_date = Column(Date, nullable=False)
    expected_return_date = Column(Date)
    returned_date = Column(Date)
    notes = Column(Text)
    status = Column(String(10), nullable=False, default="approved")  # approved | pending | rejected
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=_now)

    equipment = relationship("EquipmentItem", back_populates="assignments")
    created_by = relationship("User", foreign_keys=[created_by_id])

    __table_args__ = (
        Index("ix_assignments_equipment_returned", "equipment_id", "returned_date"),
    )


class MaintenanceNote(Base):
    __tablename__ = "maintenance_notes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    equipment_id = Column(Integer, ForeignKey("equipment_items.id"), nullable=False)
    date = Column(Date, nullable=False)
    description = Column(Text, nullable=False)
    cost = Column(Numeric(8, 2))
    done_by = Column(String(100))
    created_at = Column(DateTime, default=_now)

    equipment = relationship("EquipmentItem", back_populates="maintenance_notes")
