from fastapi import APIRouter, Depends
from dependencies.auth import require_admin

router = APIRouter(prefix="/api/approvals", tags=["approvals"])


@router.get("/pending")
def get_pending(_=Depends(require_admin)):
    return {"transactions": 0, "total": 0}
