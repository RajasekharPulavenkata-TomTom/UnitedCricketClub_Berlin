"""
Regression tests for the SQL-aggregation refactors.

Elections, polls, page-view perf stats and task summaries used to load full
row sets and aggregate in Python; they now aggregate in SQL. These tests pin
the externally visible behaviour of the refactored endpoints.
"""
import pytest

pytestmark = pytest.mark.api


# ── Elections: counts come from GROUP BY, not loaded vote rows ────────────────

class TestElectionAggregates:
    def _setup_voting_election(self, client, auth, make_user, make_member):
        res = client.post("/api/elections", headers=auth,
                          json={"title": "Committee", "seats": 1})
        assert res.status_code == 201, res.text
        election_id = res.json()["id"]
        voters = []
        for i in range(3):
            member = make_member(f"Candidate {i}")
            user = make_user(f"cand{i}", member=member)
            from services.auth_service import create_access_token
            hdr = {"Authorization": f"Bearer {create_access_token(user)}"}
            assert client.post(f"/api/elections/{election_id}/nominate", headers=hdr).status_code == 200
            voters.append(hdr)
        res = client.patch(f"/api/elections/{election_id}/start-voting", headers=auth)
        assert res.status_code == 200, res.text
        return election_id, res.json()["candidates"], voters

    def test_vote_counts_and_voter_count(self, client, auth, make_user, make_member):
        election_id, candidates, voters = self._setup_voting_election(client, auth, make_user, make_member)
        target = candidates[0]["id"]
        for hdr in voters[:2]:
            res = client.post(f"/api/elections/{election_id}/vote", headers=hdr,
                              json={"candidate_ids": [target]})
            assert res.status_code == 200, res.text

        out = client.patch(f"/api/elections/{election_id}/close", headers=auth).json()
        assert out["total_votes"] == 2
        winner = next(c for c in out["candidates"] if c["id"] == target)
        assert winner["vote_count"] == 2
        assert winner["pct"] == 100
        assert winner["is_winner"] is True
        losers = [c for c in out["candidates"] if c["id"] != target]
        assert all(c["vote_count"] == 0 for c in losers)

    def test_has_voted_is_per_user(self, client, auth, make_user, make_member):
        election_id, candidates, voters = self._setup_voting_election(client, auth, make_user, make_member)
        client.post(f"/api/elections/{election_id}/vote", headers=voters[0],
                    json={"candidate_ids": [candidates[0]["id"]]})
        assert client.get(f"/api/elections/{election_id}", headers=voters[0]).json()["has_voted"] is True
        assert client.get(f"/api/elections/{election_id}", headers=voters[1]).json()["has_voted"] is False
        # non-voter before reveal must not see counts
        listed = client.get("/api/elections", headers=voters[1]).json()
        row = next(e for e in listed if e["id"] == election_id)
        assert all(c["vote_count"] is None for c in row["candidates"])


# ── Polls: counts and voted_option_ids from SQL aggregates ───────────────────

class TestPollAggregates:
    def _create_poll(self, client, auth, **overrides):
        body = {"title": "Kit color", "options": [{"text": "Green"}, {"text": "Blue"}]}
        body.update(overrides)
        res = client.post("/api/polls", headers=auth, json=body)
        assert res.status_code == 201, res.text
        return res.json()

    def test_named_poll_vote_and_counts(self, client, auth, make_user):
        poll = self._create_poll(client, auth)
        opt = poll["options"][0]["id"]
        out = client.post(f"/api/polls/{poll['id']}/vote", headers=auth,
                          json={"option_ids": [opt]}).json()
        assert out["has_voted"] is True
        assert out["voted_option_ids"] == [opt]
        assert out["voter_count"] == 1
        assert next(o for o in out["options"] if o["id"] == opt)["vote_count"] == 1
        # a second user who hasn't voted sees no counts on an open poll
        from services.auth_service import create_access_token
        other = {"Authorization": f"Bearer {create_access_token(make_user('pollwatcher'))}"}
        row = next(p for p in client.get("/api/polls", headers=other).json() if p["id"] == poll["id"])
        assert row["has_voted"] is False
        assert all(o["vote_count"] is None for o in row["options"])

    def test_change_vote(self, client, auth):
        poll = self._create_poll(client, auth)
        first, second = (o["id"] for o in poll["options"])
        client.post(f"/api/polls/{poll['id']}/vote", headers=auth, json={"option_ids": [first]})
        out = client.put(f"/api/polls/{poll['id']}/vote", headers=auth,
                         json={"option_ids": [second]}).json()
        assert out["voted_option_ids"] == [second]
        assert next(o for o in out["options"] if o["id"] == first)["vote_count"] == 0
        assert next(o for o in out["options"] if o["id"] == second)["vote_count"] == 1

    def test_anonymous_poll(self, client, auth):
        poll = self._create_poll(client, auth, is_anonymous=True)
        opt = poll["options"][1]["id"]
        out = client.post(f"/api/polls/{poll['id']}/vote", headers=auth,
                          json={"option_ids": [opt]}).json()
        assert out["has_voted"] is True
        assert out["voter_count"] == 1
        assert out["voted_option_ids"] == []  # anonymity: options not linked to the voter
        assert next(o for o in out["options"] if o["id"] == opt)["vote_count"] == 1
        # double vote rejected
        res = client.post(f"/api/polls/{poll['id']}/vote", headers=auth, json={"option_ids": [opt]})
        assert res.status_code == 400


# ── Page-view perf: SQL avg / percentile_cont match the old Python math ──────

class TestPageViewPerf:
    def test_summary_and_pages(self, client, auth):
        for page, ms, device in [("home", 100, "mobile"), ("home", 200, "desktop"),
                                 ("home", 300, "mobile"), ("polls", 400, "desktop"),
                                 ("polls", 1500, "desktop")]:
            res = client.post("/api/page-views", headers=auth,
                              json={"page": page, "nav_ms": ms, "device": device})
            assert res.status_code == 204
        out = client.get("/api/page-views/perf", headers=auth).json()
        s = out["summary"]
        assert s["total_navigations"] == 5
        assert s["avg_ms"] == 500          # (100+200+300+400+1500)/5
        assert s["mobile_avg_ms"] == 200   # (100+300)/2
        assert s["desktop_avg_ms"] == 700  # (200+400+1500)/3
        assert s["mobile_pct"] == 40
        assert s["p95_ms"] > s["p75_ms"]
        assert s["slow_pct"] == 20         # 1 of 5 navs ≥ 1200 ms
        home = next(p for p in out["pages"] if p["page"] == "home")
        assert home["visits"] == 3
        assert home["avg_ms"] == 200
        assert out["trend"]["this_week_avg"] == 500
        assert len(out["daily"]) == 1      # all recorded today
        assert out["daily"][0]["count"] == 5
        assert out["daily"][0]["avg_ms"] == 500

    def test_empty_dataset(self, client, auth):
        out = client.get("/api/page-views/perf", headers=auth).json()
        assert out["summary"]["total_navigations"] == 0
        assert out["summary"]["avg_ms"] is None
        assert out["summary"]["slow_pct"] == 0
        assert out["pages"] == []
        assert out["daily"] == []


# ── Tasks: GROUP BY summary and bulk-assign response ─────────────────────────

class TestTaskAggregates:
    def test_summary_counts(self, client, auth, make_member):
        m1, m2 = make_member("Player One"), make_member("Player Two")
        for member, status in [(m1, "todo"), (m1, "done"), (m2, "in_progress")]:
            res = client.post("/api/tasks", headers=auth, json={
                "title": f"t-{status}", "status": status, "priority": "medium",
                "assigned_to_id": member.id,
            })
            assert res.status_code == 201, res.text
        summary = {row["member_id"]: row for row in
                   client.get("/api/tasks/summary", headers=auth).json()}
        assert summary[m1.id]["todo"] == 1
        assert summary[m1.id]["done"] == 1
        assert summary[m1.id]["total"] == 2
        assert summary[m2.id]["in_progress"] == 1

    def test_bulk_assign_preserves_order(self, client, auth, make_member):
        members = [make_member(f"Bulk {i}") for i in range(3)]
        ids = [m.id for m in members]
        res = client.post("/api/tasks/bulk-assign", headers=auth,
                          params={"title": "Nets duty", "member_ids": ids})
        assert res.status_code == 201, res.text
        assert [t["assigned_to_id"] for t in res.json()] == ids


# ── Events: ?member_id= inlines my_status ─────────────────────────────────────

class TestEventMyStatus:
    def test_my_status_inlined(self, client, auth, make_member):
        me, other = make_member("Me"), make_member("Other")
        res = client.post("/api/events", headers=auth,
                          json={"date": "2026-09-01", "title": "Friendly", "type": "match"})
        assert res.status_code == 201, res.text
        event_id = res.json()["id"]
        client.put(f"/api/events/{event_id}/availability/{me.id}", headers=auth,
                   json={"status": "available"})
        client.put(f"/api/events/{event_id}/availability/{other.id}", headers=auth,
                   json={"status": "unavailable"})

        rows = client.get(f"/api/events?year=2026&month=9&member_id={me.id}", headers=auth).json()
        row = next(e for e in rows if e["id"] == event_id)
        assert row["my_status"] == "available"
        assert row["available_count"] == 1
        assert row["unavailable_count"] == 1
        # without member_id the field stays null
        rows = client.get("/api/events?year=2026&month=9", headers=auth).json()
        assert next(e for e in rows if e["id"] == event_id)["my_status"] is None
