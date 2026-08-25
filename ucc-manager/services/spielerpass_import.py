"""Parse a pasted 'Name → Spielerpass number' list and match it to members.

The importer is intentionally data-free (no player details in the repo — it is
public). An admin pastes the mapping at runtime; matching is by normalised name
against member.name / jersey_name, and anything that doesn't match is reported
rather than guessed.
"""
import re

_PASS_RE = re.compile(r"DCB[A-Z0-9]+", re.IGNORECASE)


def parse_entries(text: str) -> list[dict]:
    """Each non-empty line should contain a name and a DCB… pass number in any
    order/separator (e.g. 'Chirag Patel = DCB0M55166'). The pass number is found
    by pattern; the rest of the line is the name."""
    entries = []
    for line in (text or "").splitlines():
        line = line.strip()
        if not line:
            continue
        m = _PASS_RE.search(line)
        if not m:
            continue
        number = m.group(0).upper()
        name = (line[:m.start()] + line[m.end():]).strip(" \t=:,;|-").strip()
        if name:
            entries.append({"name": name, "number": number})
    return entries


def _norm(s: str | None) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def match_entries(entries: list[dict], members: list[tuple]) -> tuple[list[dict], list[dict]]:
    """members: iterable of (id, name, jersey_name). Returns (matched, unmatched).
    matched items carry member_id + member_name; unmatched carry the input name."""
    lookup: dict[str, tuple] = {}
    for mid, name, jersey in members:
        for key in (_norm(name), _norm(jersey)):
            if key:
                lookup.setdefault(key, (mid, name))

    matched, unmatched = [], []
    for e in entries:
        hit = lookup.get(_norm(e["name"]))
        if hit:
            matched.append({"member_id": hit[0], "member_name": hit[1],
                            "name": e["name"], "number": e["number"]})
        else:
            unmatched.append(e)
    return matched, unmatched
