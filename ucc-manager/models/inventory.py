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

    maintenance_notes = relationship("MaintenanceNote", back_populates="equipment", order_by="MaintenanceNote.date.desc()")


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
