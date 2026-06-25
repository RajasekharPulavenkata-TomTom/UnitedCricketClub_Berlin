from typing import List, Optional
from datetime import date
import asyncio
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import extract
from pydantic import BaseModel
import httpx
from database import get_db
from models.scoreboard import MatchResult
from models.auth import User
from dependencies.auth import get_current_user

router = APIRouter(prefix="/api/scoreboard", tags=["scoreboard"])

# ── CricClubs constants ───────────────────────────────────────────────────────

_CC_BASE     = "https://cricclubs.com"
_CC_CLUB     = "1007777"
_CC_LOC      = "OstdeutscherCricketVerbandeV"
_ACB_TEAM_ID = 1992
_CC_HEADERS  = {
    "User-Agent": "Mozilla/5.0 (compatible; UCC-Manager/1.0)",
    "Accept":     "application/json, text/javascript, */*",
    "Referer":    "https://cricclubs.com/",
}
_CC_LEAGUES = [
    {"id": "96", "name": "ODCV T20 VBL 2026"},
    {"id": "95", "name": "ODCV T20 RL 2026"},
    {"id": "91", "name": "Regionalliga 50 Overs 2026"},
    {"id": "90", "name": "Bundesliga 50 Overs 2026"},
]


def _overs(balls) -> str:
    if not balls:
        return ""
    try:
        b = int(balls)
        return f"{b // 6}.{b % 6}"
    except (TypeError, ValueError):
        return str(balls)


def _fmt_score(runs, wickets, balls) -> str:
    if runs is None:
        return ""
    try:
        r, w = int(runs), int(wickets or 0)
        ov = _overs(balls)
        wkt_str = f"/{w}" if w < 10 else f"/{w}"
        return f"{r}{wkt_str}" + (f" ({ov})" if ov else "")
    except (TypeError, ValueError):
        return str(runs)


async def _cc_get(client: httpx.AsyncClient, path: str, params: dict) -> list | dict | None:
    try:
        r = await client.get(f"{_CC_BASE}/{path}", params=params, headers=_CC_HEADERS, timeout=12)
        text = r.text.strip()
        if r.status_code == 200 and (text.startswith("[") or text.startswith("{")):
            return r.json()
    except Exception:
        pass
    return None


# ── Schemas ──────────────────────────────────────────────────────────────────

class MatchResultCreate(BaseModel):
    date: date
    opponent: str
    venue: Optional[str] = None
    match_type: Optional[str] = None
    home_away: Optional[str] = None
    our_score: Optional[str] = None
    opponent_score: Optional[str] = None
    result: Optional[str] = None
    margin: Optional[str] = None
    cricclubs_url: Optional[str] = None
    notes: Optional[str] = None


class MatchResultUpdate(BaseModel):
    date: Optional[date] = None
    opponent: Optional[str] = None
    venue: Optional[str] = None
    match_type: Optional[str] = None
    home_away: Optional[str] = None
    our_score: Optional[str] = None
    opponent_score: Optional[str] = None
    result: Optional[str] = None
    margin: Optional[str] = None
    cricclubs_url: Optional[str] = None
    notes: Optional[str] = None


class MatchResultOut(BaseModel):
    id: int
    date: date
    opponent: str
    venue: Optional[str]
    match_type: Optional[str]
    home_away: Optional[str]
    our_score: Optional[str]
    opponent_score: Optional[str]
    result: Optional[str]
    margin: Optional[str]
    cricclubs_url: Optional[str]
    notes: Optional[str]

    model_config = {"from_attributes": True}


# ── CricClubs proxy routes ────────────────────────────────────────────────────

@router.get("/cricclubs")
async def cricclubs_live():
    """Fetch ACB 2nd XI results + fixtures live from CricClubs across all active leagues."""
    results  = []
    fixtures = []

    async with httpx.AsyncClient() as client:
        # Fire all 8 requests (4 leagues × 2 endpoints) concurrently
        all_data = await asyncio.gather(*[
            coro
            for league in _CC_LEAGUES
            for coro in (
                _cc_get(client, "getResults.do",  {"clubId": _CC_CLUB, "location": _CC_LOC, "leagueId": league["id"]}),
                _cc_get(client, "getSchedule.do", {"clubId": _CC_CLUB, "location": _CC_LOC, "leagueId": league["id"]}),
            )
        ])

    for i, league in enumerate(_CC_LEAGUES):
        results_data  = all_data[i * 2]
        fixtures_data = all_data[i * 2 + 1]

        # Completed results
        if isinstance(results_data, list):
            for m in results_data:
                try:
                    t1id = int(m.get("teamOneId") or 0)
                    t2id = int(m.get("teamTwoId") or 0)
                except (TypeError, ValueError):
                    continue
                if _ACB_TEAM_ID not in (t1id, t2id):
                    continue
                we_t1    = t1id == _ACB_TEAM_ID
                our_score = _fmt_score(
                    m.get("t1total") if we_t1 else m.get("t2total"),
                    m.get("t1wickets") if we_t1 else m.get("t2wickets"),
                    m.get("t1balls") if we_t1 else m.get("t2balls"),
                )
                opp_score = _fmt_score(
                    m.get("t2total") if we_t1 else m.get("t1total"),
                    m.get("t2wickets") if we_t1 else m.get("t1wickets"),
                    m.get("t2balls") if we_t1 else m.get("t1balls"),
                )
                opponent  = m.get("teamTwoName") if we_t1 else m.get("teamOneName")
                winner_id = m.get("winner")
                try:
                    winner_id = int(winner_id) if winner_id else None
                except (TypeError, ValueError):
                    winner_id = None
                if winner_id == _ACB_TEAM_ID:
                    result = "won"
                elif winner_id and winner_id != _ACB_TEAM_ID:
                    result = "lost"
                else:
                    result = "no-result"
                match_id = m.get("matchID") or m.get("matchId")
                results.append({
                    "match_id":       match_id,
                    "date":           m.get("matchDate"),
                    "opponent":       opponent,
                    "venue":          m.get("location"),
                    "league":         m.get("leagueName") or league["name"],
                    "league_id":      league["id"],
                    "our_score":      our_score,
                    "opponent_score": opp_score,
                    "result":         result,
                    "scorecard_url":  (
                        f"https://cricclubs.com/{_CC_LOC}/viewScorecard.do"
                        f"?matchId={match_id}&clubId={_CC_CLUB}"
                        if match_id else None
                    ),
                })

        # Upcoming fixtures
        if isinstance(fixtures_data, list):
            for f in fixtures_data:
                try:
                    t1id = int(f.get("teamOneId") or 0)
                    t2id = int(f.get("teamTwoId") or 0)
                except (TypeError, ValueError):
                    continue
                if _ACB_TEAM_ID not in (t1id, t2id):
                    continue
                we_t1    = t1id == _ACB_TEAM_ID
                opponent = f.get("teamTwoName") if we_t1 else f.get("teamOneName")
                fixtures.append({
                    "match_id": f.get("matchID") or f.get("matchId"),
                    "date":     f.get("matchDate"),
                    "time":     f.get("matchTime"),
                    "opponent": opponent,
                    "venue":    f.get("location"),
                    "league":   f.get("leagueName") or league["name"],
                    "league_id": league["id"],
                })

    # Sort results newest-first, fixtures earliest-first
    def _sort_date(d):
        try:
            from datetime import datetime
            return datetime.strptime(d, "%m/%d/%Y")
        except Exception:
            return date.min
    results.sort(key=lambda x: _sort_date(x.get("date") or ""), reverse=True)
    fixtures.sort(key=lambda x: _sort_date(x.get("date") or ""))

    played = len(results)
    won    = sum(1 for r in results if r["result"] == "won")
    lost   = sum(1 for r in results if r["result"] == "lost")

    return {
        "results":  results,
        "fixtures": fixtures,
        "stats": {
            "played":  played,
            "won":     won,
            "lost":    lost,
            "tied":    sum(1 for r in results if r["result"] == "tied"),
            "win_pct": round(won / played * 100) if played else None,
        },
    }


@router.get("/cricclubs/{match_id}")
async def cricclubs_scorecard(match_id: int):
    """Fetch full batting/bowling scorecard for a specific match from CricClubs."""
    async with httpx.AsyncClient() as client:
        data = await _cc_get(client, "getScorecard.do", {
            "matchId":  match_id,
            "clubId":   _CC_CLUB,
            "location": _CC_LOC,
        })
    if not data:
        raise HTTPException(status_code=502, detail="CricClubs scorecard unavailable")

    # Normalise batting rows
    def _batting(players: list) -> list:
        rows = []
        for p in (players or []):
            name = p.get("playerName") or p.get("name") or ""
            if not name or name.lower() in ("extras", "total", "did not bat"):
                continue
            try:
                runs = int(p.get("runs") or p.get("totalRuns") or 0)
            except (TypeError, ValueError):
                runs = 0
            try:
                balls = int(p.get("balls") or p.get("ballsFaced") or 0)
            except (TypeError, ValueError):
                balls = 0
            rows.append({
                "name":       name,
                "runs":       runs,
                "balls":      balls,
                "fours":      p.get("fours") or p.get("four") or 0,
                "sixes":      p.get("sixes") or p.get("six") or 0,
                "sr":         round(runs / balls * 100, 1) if balls else None,
                "dismissal":  p.get("dismissal") or p.get("howOut") or "",
            })
        return rows

    def _bowling(players: list) -> list:
        rows = []
        for p in (players or []):
            name = p.get("playerName") or p.get("name") or ""
            if not name:
                continue
            try:
                overs = float(p.get("overs") or 0)
            except (TypeError, ValueError):
                overs = 0
            try:
                runs_given = int(p.get("runs") or p.get("runsGiven") or 0)
            except (TypeError, ValueError):
                runs_given = 0
            try:
                wickets = int(p.get("wickets") or 0)
            except (TypeError, ValueError):
                wickets = 0
            balls_bowled = int(overs) * 6 + round((overs % 1) * 10)
            eco = round(runs_given / overs, 2) if overs else None
            rows.append({
                "name":     name,
                "overs":    overs,
                "maidens":  p.get("maidens") or p.get("maiden") or 0,
                "runs":     runs_given,
                "wickets":  wickets,
                "economy":  eco,
                "wides":    p.get("wides") or p.get("wide") or 0,
                "noballs":  p.get("noballs") or p.get("noball") or 0,
            })
        return rows

    # Determine which team is ACB 2nd XI
    t1id = int(data.get("teamOneId") or data.get("team1Id") or 0)
    t2id = int(data.get("teamTwoId") or data.get("team2Id") or 0)
    we_t1 = t1id == _ACB_TEAM_ID

    our_batting   = _batting(data.get("players1") if we_t1 else data.get("players2"))
    opp_batting   = _batting(data.get("players2") if we_t1 else data.get("players1"))
    our_bowling   = _bowling(data.get("players2") if we_t1 else data.get("players1"))
    opp_bowling   = _bowling(data.get("players1") if we_t1 else data.get("players2"))

    our_score_str = _fmt_score(
        data.get("t1total") if we_t1 else data.get("t2total"),
        data.get("t1wickets") if we_t1 else data.get("t2wickets"),
        data.get("t1balls") if we_t1 else data.get("t2balls"),
    )
    opp_score_str = _fmt_score(
        data.get("t2total") if we_t1 else data.get("t1total"),
        data.get("t2wickets") if we_t1 else data.get("t1wickets"),
        data.get("t2balls") if we_t1 else data.get("t1balls"),
    )

    opponent  = data.get("teamTwoName") if we_t1 else data.get("teamOneName")
    winner_id = data.get("winner")
    try:
        winner_id = int(winner_id) if winner_id else None
    except (TypeError, ValueError):
        winner_id = None
    result = "won" if winner_id == _ACB_TEAM_ID else ("lost" if winner_id else "no-result")

    return {
        "match_id":       match_id,
        "date":           data.get("matchDate"),
        "opponent":       opponent,
        "venue":          data.get("location"),
        "league":         data.get("leagueName"),
        "our_score":      our_score_str,
        "opponent_score": opp_score_str,
        "result":         result,
        "our_batting":    our_batting,
        "opp_batting":    opp_batting,
        "our_bowling":    our_bowling,   # ACB bowlers conceded these
        "opp_bowling":    opp_bowling,   # opponent bowlers; ACB batted against them
        "raw":            data,          # pass-through for debugging
    }


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("", response_model=List[MatchResultOut])
def list_results(
    year: Optional[int] = None,
    limit: Optional[int] = None,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    q = db.query(MatchResult)
    if year:
        q = q.filter(extract("year", MatchResult.date) == year)
    q = q.order_by(MatchResult.date.desc())
    if limit is not None:
        q = q.offset(offset).limit(limit)
    return q.all()


@router.post("", response_model=MatchResultOut, status_code=201)
def create_result(
    data: MatchResultCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("manager", "developer"):
        raise HTTPException(status_code=403, detail="Admin only")
    mr = MatchResult(**data.model_dump())
    db.add(mr)
    db.commit()
    db.refresh(mr)
    return mr


@router.put("/{id}", response_model=MatchResultOut)
def update_result(
    id: int,
    data: MatchResultUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("manager", "developer"):
        raise HTTPException(status_code=403, detail="Admin only")
    mr = db.query(MatchResult).filter(MatchResult.id == id).first()
    if not mr:
        raise HTTPException(status_code=404, detail="Not found")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(mr, k, v)
    db.commit()
    db.refresh(mr)
    return mr


@router.delete("/{id}", status_code=204)
def delete_result(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("manager", "developer"):
        raise HTTPException(status_code=403, detail="Admin only")
    mr = db.query(MatchResult).filter(MatchResult.id == id).first()
    if not mr:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(mr)
    db.commit()
