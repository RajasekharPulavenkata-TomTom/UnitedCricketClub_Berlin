from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database import get_db
from models.task import Task
from models.member import Member
from models.event import Event
from schemas.task import TaskCreate, TaskUpdate, TaskOut
from models.auth import User
from dependencies.auth import get_current_user
from services.notification_service import notify_task_assigned as _notify_task

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

VALID_STATUSES = {"todo", "in_progress", "done"}
VALID_PRIORITIES = {"low", "medium", "high"}


def _get_task_or_404(task_id: int, db: Session) -> Task:
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.get("", response_model=List[TaskOut])
def list_tasks(
    member_id: Optional[int] = None,
    event_id: Optional[int] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Task)
    if member_id:
        q = q.filter(Task.assigned_to_id == member_id)
    if event_id:
        q = q.filter(Task.event_id == event_id)
    if status:
        q = q.filter(Task.status == status)
    if priority:
        q = q.filter(Task.priority == priority)
    return q.order_by(Task.due_date.asc().nullslast(), Task.priority.desc(), Task.created_at.desc()).all()


@router.post("", response_model=TaskOut, status_code=201)
def create_task(
    data: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if data.status not in VALID_STATUSES:
        raise HTTPException(status_code=422, detail=f"status must be one of {VALID_STATUSES}")
    if data.priority not in VALID_PRIORITIES:
        raise HTTPException(status_code=422, detail=f"priority must be one of {VALID_PRIORITIES}")
    if data.assigned_to_id and not db.query(Member).filter(Member.id == data.assigned_to_id).first():
        raise HTTPException(status_code=404, detail="Member not found")
    if data.event_id and not db.query(Event).filter(Event.id == data.event_id).first():
        raise HTTPException(status_code=404, detail="Event not found")

    task = Task(**data.model_dump())
    db.add(task)
    db.commit()
    db.refresh(task)
    if task.assigned_to and task.assigned_to.email:
        m = task.assigned_to
        _notify_task(
            task.title, task.priority,
            str(task.due_date) if task.due_date else None,
            task.description, m.jersey_name or m.name, m.email,
        )
    return task


@router.get("/summary")
def tasks_summary(
    db: Session = Depends(get_db),
):
    rows = db.query(Task).all()
    summary: dict = {}
    for t in rows:
        key = t.assigned_to_id
        if key not in summary:
            summary[key] = {"member_id": key, "todo": 0, "in_progress": 0, "done": 0, "total": 0}
        summary[key][t.status] = summary[key].get(t.status, 0) + 1
        summary[key]["total"] += 1
    return list(summary.values())


@router.get("/{task_id}", response_model=TaskOut)
def get_task(
    task_id: int,
    db: Session = Depends(get_db),
):
    return _get_task_or_404(task_id, db)


@router.put("/{task_id}", response_model=TaskOut)
def update_task(
    task_id: int,
    data: TaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = _get_task_or_404(task_id, db)
    updates = data.model_dump(exclude_none=True)

    if "status" in updates and updates["status"] not in VALID_STATUSES:
        raise HTTPException(status_code=422, detail=f"status must be one of {VALID_STATUSES}")
    if "priority" in updates and updates["priority"] not in VALID_PRIORITIES:
        raise HTTPException(status_code=422, detail=f"priority must be one of {VALID_PRIORITIES}")
    if "assigned_to_id" in updates and not db.query(Member).filter(Member.id == updates["assigned_to_id"]).first():
        raise HTTPException(status_code=404, detail="Member not found")
    if "event_id" in updates and not db.query(Event).filter(Event.id == updates["event_id"]).first():
        raise HTTPException(status_code=404, detail="Event not found")

    for field, value in updates.items():
        setattr(task, field, value)
    db.commit()
    db.refresh(task)
    return task


@router.patch("/{task_id}/status", response_model=TaskOut)
def update_status(
    task_id: int,
    status: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if status not in VALID_STATUSES:
        raise HTTPException(status_code=422, detail=f"status must be one of {VALID_STATUSES}")
    task = _get_task_or_404(task_id, db)
    task.status = status
    db.commit()
    db.refresh(task)
    return task


@router.post("/bulk-assign", response_model=List[TaskOut], status_code=201)
def bulk_assign(
    title: str,
    member_ids: List[int] = Query(...),
    description: Optional[str] = None,
    priority: str = "medium",
    due_date: Optional[str] = None,
    event_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if priority not in VALID_PRIORITIES:
        raise HTTPException(status_code=422, detail=f"priority must be one of {VALID_PRIORITIES}")
    from datetime import date as date_type
    parsed_due = date_type.fromisoformat(due_date) if due_date else None

    found_ids = {m.id for m in db.query(Member).filter(Member.id.in_(member_ids)).all()}
    missing = [mid for mid in member_ids if mid not in found_ids]
    if missing:
        raise HTTPException(status_code=404, detail=f"Members not found: {missing}")

    created = []
    for mid in member_ids:
        task = Task(
            title=title,
            description=description,
            priority=priority,
            due_date=parsed_due,
            assigned_to_id=mid,
            event_id=event_id,
        )
        db.add(task)
        created.append(task)

    db.commit()
    for t in created:
        db.refresh(t)
    return created


@router.delete("/{task_id}", status_code=204)
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = _get_task_or_404(task_id, db)
    db.delete(task)
    db.commit()
