import base64
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session
from database import get_db
from models.member import Member
from models.member_document import MemberDocument
from models.auth import User
from schemas.member import MemberCreate, MemberUpdate, MemberOut
from routers.audit import log
from dependencies.auth import get_current_user, require_admin
from services.spielerpass_import import parse_entries, match_entries, filename_to_name, match_name, build_lookup
import re
from urllib.parse import quote

_MAX_PDF_BYTES = 5 * 1024 * 1024  # 5 MB per Spielerpass PDF

router = APIRouter(prefix="/api", tags=["members"])


class SpielerpassImport(BaseModel):
    text: str


@router.get("/members/summary")
def list_members_summary(db: Session = Depends(get_db)):
    """Lightweight list — id, name, is_active only.  Use for dropdowns and counts."""
    rows = db.query(Member.id, Member.name, Member.is_active).order_by(Member.name).all()
    return [{"id": r.id, "name": r.name, "is_active": r.is_active} for r in rows]


@router.get("/members", response_model=List[MemberOut])
def list_members(
    active_only: bool = False,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Member)
    if active_only:
        q = q.filter(Member.is_active == True)
    if search:
        q = q.filter(Member.name.ilike(f"%{search}%"))
    members = q.order_by(Member.name).all()
    # flag who has a Spielerpass PDF without loading any blob, scoped to the
    # members actually returned (so it doesn't scan the whole documents table)
    member_ids = [m.id for m in members]
    with_pass = set()
    if member_ids:
        with_pass = {mid for (mid,) in db.query(MemberDocument.member_id)
                     .filter(MemberDocument.kind == "spielerpass",
                             MemberDocument.member_id.in_(member_ids)).distinct()}
    for m in members:
        m.has_spielerpass = m.id in with_pass
    return members


@router.post("/members", response_model=MemberOut, status_code=201)
def create_member(data: MemberCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    existing = db.query(Member).filter(Member.name == data.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="A member with this name already exists")
    if data.email:
        clash = db.query(Member).filter(func.lower(Member.email) == data.email.lower()).first()
        if clash:
            raise HTTPException(status_code=400, detail=f"Email already registered to '{clash.name}'")
    if data.phone:
        clash = db.query(Member).filter(Member.phone == data.phone).first()
        if clash:
            raise HTTPException(status_code=400, detail=f"Phone number already registered to '{clash.name}'")
    member = Member(**data.model_dump())
    db.add(member)
    db.flush()
    log(db, "added", "member", member.id, f"Member '{member.name}' added", user=current_user)
    db.commit()
    db.refresh(member)
    return member


@router.post("/members/spielerpass/upload")
async def upload_spielerpass(files: List[UploadFile] = File(...),
                             db: Session = Depends(get_db),
                             current_user: User = Depends(require_admin)):
    """Bulk-upload Spielerpass PDFs. Each file is matched to a member by its
    filename (e.g. 'Chirag_Patel (1).pdf' -> 'Chirag Patel') and stored (one per
    member, replacing any prior). Unmatched filenames are reported, never guessed."""
    members = db.query(Member.id, Member.name, Member.jersey_name).all()
    lookup = build_lookup([(m.id, m.name, m.jersey_name) for m in members])

    uploaded, unmatched, skipped = [], [], []
    for f in files:
        fname = f.filename or "unnamed"
        # read one byte past the limit so we can reject oversized files without
        # pulling an arbitrarily large body fully into memory
        content = await f.read(_MAX_PDF_BYTES + 1)
        if not content:
            continue
        if len(content) > _MAX_PDF_BYTES:
            skipped.append(f"{fname} (too large)")
            continue
        if (f.content_type or "").lower() not in ("application/pdf", "application/octet-stream") \
                and not fname.lower().endswith(".pdf"):
            skipped.append(f"{fname} (not a PDF)")
            continue
        hit = match_name(filename_to_name(fname), lookup)
        if not hit:
            unmatched.append(fname)
            continue
        member_id, member_name = hit
        doc = db.query(MemberDocument).filter(
            MemberDocument.member_id == member_id, MemberDocument.kind == "spielerpass").first()
        b64 = base64.b64encode(content).decode()
        if doc:
            doc.filename, doc.content_type, doc.size, doc.data_b64 = fname, "application/pdf", len(content), b64
        else:
            db.add(MemberDocument(member_id=member_id, kind="spielerpass", filename=fname,
                                  content_type="application/pdf", size=len(content), data_b64=b64))
        log(db, "updated", "member", member_id, f"Spielerpass PDF uploaded for '{member_name}'", user=current_user)
        uploaded.append(member_name)
    db.commit()
    return {"uploaded": uploaded, "unmatched": unmatched, "skipped": skipped}


@router.get("/members/{id}/spielerpass")
def get_spielerpass(id: int, download: bool = False, db: Session = Depends(get_db),
                    current_user: User = Depends(get_current_user)):
    """Serve a member's Spielerpass PDF (inline by default) to any logged-in user."""
    doc = db.query(MemberDocument).filter(
        MemberDocument.member_id == id, MemberDocument.kind == "spielerpass").first()
    if not doc:
        raise HTTPException(status_code=404, detail="No Spielerpass on file for this member")
    disp = "attachment" if download else "inline"
    raw = doc.filename or "spielerpass.pdf"
    # ASCII fallback (strip quotes/newlines/control chars) + RFC 5987 filename*
    # for the full name, so a crafted filename can't break or inject headers
    ascii_name = re.sub(r'[^A-Za-z0-9._-]', "_", raw) or "spielerpass.pdf"
    cd = f"{disp}; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(raw, safe='')}"
    return Response(base64.b64decode(doc.data_b64), media_type=doc.content_type,
                    headers={"Content-Disposition": cd})


@router.delete("/members/{id}/spielerpass", status_code=204)
def delete_spielerpass(id: int, db: Session = Depends(get_db),
                       current_user: User = Depends(require_admin)):
    doc = db.query(MemberDocument).filter(
        MemberDocument.member_id == id, MemberDocument.kind == "spielerpass").first()
    if doc:
        db.delete(doc)
        db.commit()


@router.post("/members/import-spielerpass")
def import_spielerpass(data: SpielerpassImport, db: Session = Depends(get_db),
                       current_user: User = Depends(require_admin)):
    """Bulk-set the DCB Spielerpass number (stored in the DCB ID field) from a
    pasted 'Name = DCB…' list. Matches by name/jersey-name; unmatched names are
    reported, never guessed. Idempotent."""
    entries = parse_entries(data.text)
    members = db.query(Member.id, Member.name, Member.jersey_name).all()
    matched, unmatched = match_entries(entries, [(m.id, m.name, m.jersey_name) for m in members])

    updated = 0
    for hit in matched:
        member = db.query(Member).filter(Member.id == hit["member_id"]).first()
        if member and member.dcb_id != hit["number"]:
            member.dcb_id = hit["number"]
            log(db, "updated", "member", member.id,
                f"DCB Spielerpass no. set for '{member.name}'", user=current_user)
        updated += 1
    db.commit()
    return {
        "parsed": len(entries),
        "updated": updated,
        "unmatched": [u["name"] for u in unmatched],
        "matched": [{"name": m["member_name"], "number": m["number"]} for m in matched],
    }


@router.put("/members/{id}", response_model=MemberOut)
def update_member(id: int, data: MemberUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    member = db.query(Member).filter(Member.id == id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    updates = data.model_dump(exclude_none=True)
    if "name" in updates:
        clash = db.query(Member).filter(Member.name == updates["name"], Member.id != id).first()
        if clash:
            raise HTTPException(status_code=400, detail="A member with this name already exists")
    if updates.get("email"):
        clash = db.query(Member).filter(func.lower(Member.email) == updates["email"].lower(), Member.id != id).first()
        if clash:
            raise HTTPException(status_code=400, detail=f"Email already registered to '{clash.name}'")
    if updates.get("phone"):
        clash = db.query(Member).filter(Member.phone == updates["phone"], Member.id != id).first()
        if clash:
            raise HTTPException(status_code=400, detail=f"Phone number already registered to '{clash.name}'")
    for field, value in updates.items():
        setattr(member, field, value)
    log(db, "updated", "member", id, f"Member '{member.name}' updated", user=current_user)
    db.commit()
    db.refresh(member)
    return member


@router.delete("/members/{id}", status_code=204)
def deactivate_member(id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    member = db.query(Member).filter(Member.id == id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    member.is_active = False
    log(db, "archived", "member", id, f"Member '{member.name}' archived", user=current_user)
    db.commit()


@router.delete("/members/{id}/purge", status_code=204)
def purge_member(id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    member = db.query(Member).filter(Member.id == id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    name = member.name
    db.delete(member)
    log(db, "deleted", "member", id, f"Member '{name}' permanently deleted", user=current_user)
    db.commit()
