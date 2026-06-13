from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, selectinload
from database import get_db
from models.election import Election, ElectionCandidate, ElectionVote, ElectionVoter, ElectionNomination
from models.member import Member
from models.auth import User
from dependencies.auth import get_current_user
from services.notification_service import (
    notify_election_nominations_open as _notify_noms,
    notify_election_voting_open as _notify_voting,
    notify_election_closed as _notify_closed,
)

router = APIRouter(prefix="/api/elections", tags=["elections"])

MIN_CANDIDATES = 2


def _member_emails(db: Session) -> list[str]:
    return [
        m.email for m in
        db.query(Member).filter(Member.is_active == True, Member.email.isnot(None)).all()
    ]


def _load(db: Session, election_id: int) -> Election | None:
    return (
        db.query(Election)
        .options(
            selectinload(Election.candidates).selectinload(ElectionCandidate.member),
            selectinload(Election.nominations).selectinload(ElectionNomination.member),
            selectinload(Election.votes),
            selectinload(Election.voters),
        )
        .filter(Election.id == election_id)
        .first()
    )


def _out(election: Election, current_user: User) -> dict:
    closed    = election.status == "closed"
    voting    = election.status == "voting"
    has_voted = any(v.user_id == current_user.id for v in election.voters)
    reveal    = has_voted or closed
    total     = len(election.votes)

    # Use unique voter count for percentages (not total vote rows)
    voter_count = len(election.voters)

    # Candidates (only present during voting / closed)
    candidates = []
    for c in election.candidates:
        count = sum(1 for v in election.votes if v.candidate_id == c.id)
        candidates.append({
            "id":          c.id,
            "member_id":   c.member_id,
            "member_name": c.member.name if c.member else "Unknown",
            "vote_count":  count if reveal else None,
            "pct":         round(count / voter_count * 100) if (reveal and voter_count > 0) else 0,
            "is_winner":   False,
            "rank":        None,
        })

    if closed and candidates:
        # Sort by vote_count desc and assign ranks (tied candidates share rank)
        sorted_cands = sorted(candidates, key=lambda c: -(c["vote_count"] or 0))
        rank, prev = 1, None
        for i, sc in enumerate(sorted_cands):
            if sc["vote_count"] != prev:
                rank = i + 1
            sc["rank"] = rank
            sc["is_winner"] = rank <= election.seats and (sc["vote_count"] or 0) > 0
            prev = sc["vote_count"]
        candidates = sorted_cands

    # Nominations (present during nominating phase)
    nominations = [
        {"member_id": n.member_id, "member_name": n.member.name if n.member else "Unknown"}
        for n in election.nominations
    ]
    has_nominated = any(n.user_id == current_user.id for n in election.nominations)

    return {
        "id":               election.id,
        "title":            election.title,
        "description":      election.description,
        "status":           election.status,
        "seats":            election.seats,
        "created_at":       election.created_at.isoformat(),
        "closed_at":        election.closed_at.isoformat() if election.closed_at else None,
        "has_voted":        has_voted,
        "has_nominated":    has_nominated,
        "total_votes":      voter_count if reveal else None,
        "required_votes":   min(election.seats, len(candidates)),
        "nomination_count":     len(nominations),
        "nominations":          nominations,
        "nominations_close_at": election.nominations_close_at.isoformat() if election.nominations_close_at else None,
        "candidates":           candidates,
    }


def _maybe_open_voting(db: Session, election: Election) -> Election | None:
    """Auto-transition nominating → voting when deadline passes and enough nominations exist.
    Returns the reloaded election if transitioned, None if no action taken."""
    if election.status != "nominating" or not election.nominations_close_at:
        return None
    closes = election.nominations_close_at
    if closes.tzinfo is None:
        closes = closes.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) < closes:
        return None
    min_needed = max(MIN_CANDIDATES, election.seats)
    if len(election.nominations) < min_needed:
        return None
    for nom in election.nominations:
        db.add(ElectionCandidate(election_id=election.id, member_id=nom.member_id))
    election.status = "voting"
    db.commit()
    loaded = _load(db, election.id)
    candidate_names = [c.member.name for c in loaded.candidates if c.member]
    _notify_voting(election.title, candidate_names, election.seats, _member_emails(db))
    return loaded


class ElectionCreate(BaseModel):
    title:                str
    description:          Optional[str] = None
    seats:                int = 3
    nominations_close_at: Optional[datetime] = None


class VoteCast(BaseModel):
    candidate_ids: List[int]


@router.get("")
def list_elections(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    elections = (
        db.query(Election)
        .options(
            selectinload(Election.candidates).selectinload(ElectionCandidate.member),
            selectinload(Election.nominations).selectinload(ElectionNomination.member),
            selectinload(Election.votes),
            selectinload(Election.voters),
        )
        .order_by(Election.created_at.desc())
        .all()
    )
    return [_out(_maybe_open_voting(db, e) or e, current_user) for e in elections]


@router.post("", status_code=201)
def create_election(
    data: ElectionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "root"):
        raise HTTPException(status_code=403, detail="Admin access required")
    if db.query(Election).filter(Election.status.in_(["nominating", "voting"])).first():
        raise HTTPException(status_code=400, detail="An election is already in progress. Close it before starting a new one.")

    if data.seats < 1:
        raise HTTPException(status_code=400, detail="Seats must be at least 1")
    election = Election(
        title=data.title.strip(),
        description=data.description,
        status="nominating",
        seats=data.seats,
        nominations_close_at=data.nominations_close_at,
        created_by_id=current_user.id,
    )
    db.add(election)
    db.commit()
    close_str = election.nominations_close_at.strftime("%d %b %Y %H:%M UTC") if election.nominations_close_at else None
    _notify_noms(election.title, election.description, election.seats, close_str, _member_emails(db))
    return _out(_load(db, election.id), current_user)


@router.get("/{election_id}")
def get_election(election_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    election = _load(db, election_id)
    if not election:
        raise HTTPException(status_code=404, detail="Election not found")
    return _out(_maybe_open_voting(db, election) or election, current_user)


@router.post("/{election_id}/nominate")
def nominate(
    election_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    election = db.query(Election).filter(Election.id == election_id).first()
    if not election:
        raise HTTPException(status_code=404, detail="Election not found")
    if election.status != "nominating":
        raise HTTPException(status_code=400, detail="Nominations are closed for this election")
    if not current_user.member_id:
        raise HTTPException(status_code=400, detail="Your account is not linked to a member profile. Ask an admin to link it.")
    if db.query(ElectionNomination).filter_by(election_id=election_id, user_id=current_user.id).first():
        raise HTTPException(status_code=400, detail="You have already nominated yourself")

    db.add(ElectionNomination(
        election_id=election_id,
        member_id=current_user.member_id,
        user_id=current_user.id,
    ))
    db.commit()
    return _out(_load(db, election_id), current_user)


@router.delete("/{election_id}/nominate")
def withdraw_nomination(
    election_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    election = db.query(Election).filter(Election.id == election_id).first()
    if not election:
        raise HTTPException(status_code=404, detail="Election not found")
    if election.status != "nominating":
        raise HTTPException(status_code=400, detail="Cannot withdraw after nominations have closed")

    nom = db.query(ElectionNomination).filter_by(election_id=election_id, user_id=current_user.id).first()
    if not nom:
        raise HTTPException(status_code=404, detail="No nomination found to withdraw")
    db.delete(nom)
    db.commit()
    return _out(_load(db, election_id), current_user)


class ElectionDeadlineUpdate(BaseModel):
    nominations_close_at: Optional[datetime] = None


@router.patch("/{election_id}/deadline")
def set_deadline(
    election_id: int,
    data: ElectionDeadlineUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "root":
        raise HTTPException(status_code=403, detail="Root access required")
    election = _load(db, election_id)
    if not election:
        raise HTTPException(status_code=404, detail="Election not found")
    if election.status != "nominating":
        raise HTTPException(status_code=400, detail="Deadline can only be set during the nomination phase")
    election.nominations_close_at = data.nominations_close_at
    db.commit()
    return _out(_load(db, election_id), current_user)


@router.patch("/{election_id}/revert-to-nominating")
def revert_to_nominating(
    election_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "root":
        raise HTTPException(status_code=403, detail="Root access required")
    election = _load(db, election_id)
    if not election:
        raise HTTPException(status_code=404, detail="Election not found")
    if election.status != "voting":
        raise HTTPException(status_code=400, detail="Only a voting-phase election can be reverted")
    for candidate in list(election.candidates):
        db.delete(candidate)  # cascades to election_votes
    for voter in list(election.voters):
        db.delete(voter)
    election.status = "nominating"
    db.flush()
    db.commit()
    return _out(_load(db, election_id), current_user)


@router.patch("/{election_id}/start-voting")
def start_voting(
    election_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "root":
        raise HTTPException(status_code=403, detail="Root access required")
    election = _load(db, election_id)
    if not election:
        raise HTTPException(status_code=404, detail="Election not found")
    if election.status != "nominating":
        raise HTTPException(status_code=400, detail="Election is not in the nomination phase")
    min_needed = max(MIN_CANDIDATES, election.seats)
    if len(election.nominations) < min_needed:
        raise HTTPException(
            status_code=400,
            detail=f"Need at least {min_needed} nominations to open voting for {election.seats} seat(s) (currently {len(election.nominations)})",
        )

    for nom in election.nominations:
        db.add(ElectionCandidate(election_id=election_id, member_id=nom.member_id))
    election.status = "voting"
    db.commit()
    loaded = _load(db, election_id)
    candidate_names = [c.member.name for c in loaded.candidates if c.member]
    _notify_voting(election.title, candidate_names, election.seats, _member_emails(db))
    return _out(loaded, current_user)


@router.patch("/{election_id}/close")
def close_election(
    election_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "root":
        raise HTTPException(status_code=403, detail="Root access required")
    election = db.query(Election).filter(Election.id == election_id).first()
    if not election:
        raise HTTPException(status_code=404, detail="Election not found")
    if election.status != "voting":
        raise HTTPException(status_code=400, detail="Only a voting-phase election can be closed")
    election.status    = "closed"
    election.closed_at = datetime.now(timezone.utc)
    db.commit()
    loaded = _load(db, election_id)
    candidate_votes = sorted(
        [(c.member.name if c.member else "Unknown",
          sum(1 for v in loaded.votes if v.candidate_id == c.id))
         for c in loaded.candidates],
        key=lambda x: -x[1],
    )
    winners = [name for name, _ in candidate_votes[:election.seats]]
    _notify_closed(election.title, winners, _member_emails(db))
    return _out(loaded, current_user)


@router.post("/{election_id}/vote")
def cast_vote(
    election_id: int,
    data: VoteCast,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    election = db.query(Election).filter(Election.id == election_id).first()
    if not election:
        raise HTTPException(status_code=404, detail="Election not found")
    if election.status != "voting":
        raise HTTPException(status_code=400, detail="Voting is not open for this election")
    if db.query(ElectionVoter).filter_by(election_id=election_id, user_id=current_user.id).first():
        raise HTTPException(status_code=400, detail="You have already voted in this election")

    candidate_ids = list(dict.fromkeys(data.candidate_ids))  # deduplicate, preserve order
    valid_ids = {c.id for c in db.query(ElectionCandidate).filter_by(election_id=election_id).all()}
    required = min(election.seats, len(valid_ids))

    if len(candidate_ids) != required:
        raise HTTPException(
            status_code=400,
            detail=f"You must select exactly {required} candidate{'s' if required != 1 else ''}",
        )
    for cid in candidate_ids:
        if cid not in valid_ids:
            raise HTTPException(status_code=404, detail=f"Candidate {cid} not found in this election")

    # Voter table: WHO voted (no candidate link — preserves anonymity)
    db.add(ElectionVoter(election_id=election_id, user_id=current_user.id))
    # Votes table: WHICH candidates got votes (no voter link — preserves anonymity)
    for cid in candidate_ids:
        db.add(ElectionVote(election_id=election_id, candidate_id=cid))
    db.commit()
    return _out(_load(db, election_id), current_user)


@router.delete("/{election_id}", status_code=204)
def delete_election(
    election_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "root":
        raise HTTPException(status_code=403, detail="Root access required to delete elections")
    election = db.query(Election).filter(Election.id == election_id).first()
    if not election:
        raise HTTPException(status_code=404, detail="Election not found")
    db.delete(election)
    db.commit()
