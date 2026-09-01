"""Regression tests for the security/quality hardening pass.

Covers the authorization tightening (non-admins can no longer mutate members,
events, or the finance ledger), password-strength validation, and the
Spielerpass bulk-upload duplicate-name crash.
"""
import base64


# ── Authorization: non-admins must not mutate privileged resources ────────────

class TestMemberAuthz:
    def test_player_cannot_update_member(self, client, user_token, make_member):
        token, _ = user_token
        m = make_member("Victim Player")
        res = client.put(f"/api/members/{m.id}", json={"email": "attacker@evil.com"},
                         headers={"Authorization": token})
        assert res.status_code == 403

    def test_player_cannot_deactivate_member(self, client, user_token, make_member):
        token, _ = user_token
        m = make_member("Victim Player")
        res = client.delete(f"/api/members/{m.id}", headers={"Authorization": token})
        assert res.status_code == 403

    def test_admin_can_still_update_member(self, client, auth, make_member):
        m = make_member("Editable Player")
        res = client.put(f"/api/members/{m.id}", json={"email": "ok@example.com"}, headers=auth)
        assert res.status_code == 200


class TestFinanceAuthz:
    def test_player_cannot_create_transaction(self, client, user_token):
        token, _ = user_token
        res = client.post("/api/transactions",
                          json={"type": "income", "amount": 100, "date": "2026-01-01"},
                          headers={"Authorization": token})
        assert res.status_code == 403

    def test_player_cannot_create_category(self, client, user_token):
        token, _ = user_token
        res = client.post("/api/categories", json={"name": "Bogus", "type": "income"},
                          headers={"Authorization": token})
        assert res.status_code == 403

    def test_admin_can_create_transaction(self, client, auth):
        res = client.post("/api/transactions",
                          json={"type": "income", "amount": 100, "date": "2026-01-01"},
                          headers=auth)
        assert res.status_code == 201


class TestEventAuthz:
    def _make_event(self, client, auth):
        res = client.post("/api/events",
                          json={"title": "Match", "date": "2026-05-01", "type": "match"},
                          headers=auth)
        assert res.status_code == 201
        return res.json()["id"]

    def test_player_cannot_update_event(self, client, auth, user_token):
        eid = self._make_event(client, auth)
        token, _ = user_token
        res = client.put(f"/api/events/{eid}", json={"title": "Hijacked"},
                         headers={"Authorization": token})
        assert res.status_code == 403

    def test_player_cannot_delete_event(self, client, auth, user_token):
        eid = self._make_event(client, auth)
        token, _ = user_token
        res = client.delete(f"/api/events/{eid}", headers={"Authorization": token})
        assert res.status_code == 403


# ── Password strength validation ──────────────────────────────────────────────

class TestPasswordValidation:
    def test_register_rejects_short_password(self, client):
        res = client.post("/api/auth/register",
                          json={"username": "newbie", "password": "short"})
        assert res.status_code == 422

    def test_register_accepts_strong_password_and_strips_username(self, client, db):
        res = client.post("/api/auth/register",
                          json={"username": "  spaced_user  ", "password": "longenough1"})
        assert res.status_code == 201
        from models.auth import User
        assert db.query(User).filter(User.username == "spaced_user").first() is not None

    def test_register_rejects_overlong_password(self, client):
        res = client.post("/api/auth/register",
                          json={"username": "bigpw", "password": "a" * 73})
        assert res.status_code == 422


# ── Spielerpass bulk upload: two files matching the same member must not crash ─

class TestSpielerpassBatchDedup:
    def test_duplicate_named_files_in_one_batch(self, client, auth, make_member):
        make_member("Chirag Patel")
        pdf = base64.b64decode("JVBERi0xLjQKJcOkCg==")  # minimal "%PDF-1.4" header bytes
        files = [
            ("files", ("Chirag_Patel.pdf", pdf, "application/pdf")),
            ("files", ("Chirag_Patel (1).pdf", pdf, "application/pdf")),
        ]
        res = client.post("/api/members/spielerpass/upload", files=files, headers=auth)
        assert res.status_code == 200
        body = res.json()
        # Both files resolve to the same member; the batch must commit cleanly
        # (the second updates the first) rather than 500 on the unique constraint.
        assert "Chirag Patel" in body["uploaded"]
