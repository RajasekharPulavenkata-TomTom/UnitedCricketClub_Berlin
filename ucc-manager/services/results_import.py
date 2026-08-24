"""Parse an ODCV CricClubs "Match Results" CSV export into MatchResult rows.

The export lists every team's matches with columns:
  SNO, MATCH TYPE, DATE, Team ONE, TEAM TWO, RESULT, SCORE SUMMARY

MATCH TYPE is the stage ("League"), not the format — so the format (T20 /
50-Overs / …) is supplied by the caller, not read from the file. Only rows
involving `our_team` are returned, from that team's perspective.
"""
import csv
import io
import re
from datetime import datetime


def _parse_date(raw: str):
    """CSV dates are MM/DD/YYYY."""
    return datetime.strptime(raw.strip(), "%m/%d/%Y").date()


def _extract_score(summary: str, team: str) -> str | None:
    """Pull one team's score out of a concatenated SCORE SUMMARY like
    'ACB 2nd XI: 208/5(20)BSV Vikings: 150/7(20)'.
    Returns the score for `team`, or None if not present."""
    label = f"{team}:"
    start = summary.find(label)
    if start == -1:
        return None
    start += len(label)
    # The score runs until the next 'SomeTeam:' label or end of string.
    rest = summary[start:]
    nxt = re.search(r"[A-Za-z].*?:", rest)
    score = (rest[:nxt.start()] if nxt else rest).strip()
    # Normalise "208/5(20)" → "208/5 (20)" for readability.
    score = re.sub(r"(\d)\(", r"\1 (", score)
    return score or None


def _parse_result(result_text: str, our_team: str, opponent: str):
    """Return (result, margin) from the RESULT column, from our perspective.
    result ∈ {won, lost, tied, no-result}; margin like '58 runs' / '3 wickets' / None."""
    text = result_text.strip()
    low = text.lower()

    if "tie" in low:
        return "tied", None

    margin = None
    m = re.search(r"won by\s+(\d+)\s+(runs?|wickets?)", low)
    if m:
        margin = f"{m.group(1)} {m.group(2)}"

    # Winner is the name before "won by", or after "Winner:" (abandoned-with-winner).
    winner = None
    if " won by" in low:
        winner = text[: low.index(" won by")].strip()
    else:
        wm = re.search(r"winner:\s*(.+)", text, re.IGNORECASE)
        if wm:
            winner = wm.group(1).strip().rstrip(".")

    if winner is None:
        return "no-result", None  # abandoned / cancelled / no result, no winner
    if winner == our_team:
        return "won", margin
    return "lost", margin


def parse_odcv_results(csv_text: str, our_team: str, match_type: str) -> list[dict]:
    """Parse the CSV, returning MatchResult-shaped dicts for `our_team` only."""
    reader = csv.DictReader(io.StringIO(csv_text))
    rows: list[dict] = []
    for row in reader:
        t1 = (row.get("Team ONE") or "").strip()
        t2 = (row.get("TEAM TWO") or "").strip()
        if our_team not in (t1, t2):
            continue
        opponent = t2 if t1 == our_team else t1
        summary = (row.get("SCORE SUMMARY") or "").strip()
        result, margin = _parse_result(row.get("RESULT") or "", our_team, opponent)
        rows.append({
            "date":           _parse_date(row["DATE"]),
            "opponent":       opponent,
            "our_score":      _extract_score(summary, our_team),
            "opponent_score": _extract_score(summary, opponent),
            "result":         result,
            "margin":         margin,
            "match_type":     match_type,
            "home_away":      None,   # not in the export
            "venue":          None,
            "cricclubs_url":  None,
            "notes":          None,
        })
    return rows
