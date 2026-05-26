"""Bulk-import match events and player availability into UCC calendar."""
import json
import urllib.request
import urllib.error

BASE = "https://united-cricket-club.fly.dev/api"

def api(method, path, data=None):
    url = BASE + path
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body,
                                 headers={"Content-Type": "application/json"},
                                 method=method)
    try:
        with urllib.request.urlopen(req) as r:
            return None if r.status == 204 else json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{e.code} {e.read().decode()}") from None

# ── 9 match events (column order matches the spreadsheet) ──────────────────
EVENTS = [
    {"title": "vs ICAB 2",      "date": "2026-06-14", "type": "match", "notes": "Away · Maifeld 3 · 04:30"},
    {"title": "vs Viktoria 1",  "date": "2026-09-13", "type": "match", "notes": "Home · Maifeld 4 · 01:00"},
    {"title": "vs BCC 2",       "date": "2026-09-13", "type": "match", "notes": "Home · Maifeld 4 · 04:30"},
    {"title": "vs BSV Vikings", "date": "2026-09-19", "type": "match", "notes": "Away · Maifeld 2 · 01:00"},
    {"title": "vs KSV 2",       "date": "2026-09-26", "type": "match", "notes": "Home · Maifeld 2 · 11:00"},
    {"title": "vs Viktoria",    "date": "2026-06-06", "type": "match", "notes": "Away · Maifeld 4 · 11:00"},
    {"title": "vs ICAB 2",      "date": "2026-09-12", "type": "match", "notes": "Home · Maifeld 4 · 11:00"},
    {"title": "vs KSV",         "date": "2026-09-20", "type": "match", "notes": "Home · Maifeld 1 · 11:00"},
    {"title": "vs Zernsdorf",   "date": "2026-09-27", "type": "match", "notes": "Home · Maifeld 1 · 11:00"},
]

# ── Availability per player, indexed [0..8] matching EVENTS above ──────────
# "available" / "unavailable" / None (no response, skip)
PLAYER_AVAIL = {
    "Pratik":    ["available"]*9,
    "Nilesh":    ["available","available","available","available","available","available","available",None,None],
    "Bubai":     ["available"]*9,
    "Samir P":   [None]*9,
    "Chirag":    ["unavailable","available",None,None,None,None,None,None,None],
    "Raj":       ["available"]*9,
    "Vinay":     ["available","available","available","available","available","available","unavailable","available","available"],
    "Dipanshu":  ["unavailable",None,None,None,None,"unavailable",None,None,None],
    "Vamsi":     ["available"]*9,
    "Samir C":   ["available"]*9,
    "Jeegar":    ["unavailable",None,None,None,None,"unavailable",None,None,None],
    "Sani":      ["unavailable","available","available","available","available","available","available","available","available"],
    "Rakesh":    ["available"]*9,
    "R K":       ["available",None,None,None,"available",None,None,None,None],
    "Mayuresh":  ["available"]*9,
    "Shyam":     ["unavailable","available","available","available","available","available","available","available","available"],
    "Manoj":     ["available"]*9,
    "Krishna":   ["available"]*9,
    "Rounak":    ["available",None,None,None,"unavailable",None,None,None,None],
    "Kuljit":    ["available",None,None,None,"available","available","available","available",None],
    "Roshan":    ["available","available","available","available","available",None,None,None,None],
}

def match_member(members, search_name):
    """Find a member by jersey_name or first name in full name."""
    search_lower = search_name.lower().strip()
    # exact jersey_name match
    for m in members:
        if m.get("jersey_name", "").lower() == search_lower:
            return m
    # exact name match
    for m in members:
        if m["name"].lower() == search_lower:
            return m
    # first word of full name
    for m in members:
        first_word = m["name"].split()[0].lower()
        if first_word == search_lower:
            return m
    # first word of jersey_name
    for m in members:
        jn = (m.get("jersey_name") or "").split()[0].lower()
        if jn == search_lower:
            return m
    return None

def main():
    # ── 1. Fetch members ───────────────────────────────────────────────────
    print("Fetching members...")
    members = api("GET", "/members?active_only=true")
    print(f"  {len(members)} active members found")

    # Build name→id map, warn on misses
    member_map = {}
    for player_name in PLAYER_AVAIL:
        m = match_member(members, player_name)
        if m:
            member_map[player_name] = m["id"]
        else:
            print(f"  WARNING: no match for '{player_name}'")

    # ── 2. Create events ───────────────────────────────────────────────────
    print("\nCreating events...")
    event_ids = []
    for ev in EVENTS:
        created = api("POST", "/events", ev)
        event_ids.append(created["id"])
        print(f"  Created event #{created['id']}: {ev['title']} on {ev['date']}")

    # ── 3. Set availability ────────────────────────────────────────────────
    print("\nSetting availability...")
    total_set = 0
    for player_name, statuses in PLAYER_AVAIL.items():
        mid = member_map.get(player_name)
        if not mid:
            continue
        for col, status in enumerate(statuses):
            if status is None:
                continue
            event_id = event_ids[col]
            api("PUT", f"/events/{event_id}/availability/{mid}", {"status": status})
            total_set += 1

    print(f"\nDone! {len(event_ids)} events created, {total_set} availability records set.")

if __name__ == "__main__":
    main()
