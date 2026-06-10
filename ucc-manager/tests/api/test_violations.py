"""
Tests for /api/violations endpoints.
Covers bugs fixed in this session:
 - Empty violations list returns [] (not error)
 - member_name is present in each violation response
 - Non-admin sees only own violations
"""
import pytest

pytestmark = pytest.mark.api

RULE = "PUNCTUALITY"


def _log(client, member_id, auth_header, rule=RULE, desc=None):
    return client.post(
        "/api/violations",
        json={"member_id": member_id, "rule_ref": rule, "description": desc},
        headers=auth_header,
    )


class TestListViolations:
    def test_empty_db_returns_empty_list(self, client, auth):
        res = client.get("/api/violations", headers=auth)
        assert res.status_code == 200
        assert res.json() == []

    def test_admin_sees_all_violations(self, client, auth, make_member):
        m1 = make_member("Player A")
        m2 = make_member("Player B")
        _log(client, m1.id, auth)
        _log(client, m2.id, auth)
        res = client.get("/api/violations", headers=auth)
        assert res.status_code == 200
        assert len(res.json()) == 2

    def test_violation_response_contains_member_name(self, client, auth, make_member):
        m = make_member("Named Player", jersey_name="NP")
        _log(client, m.id, auth)
        violations = client.get("/api/violations", headers=auth).json()
        assert violations[0]["member_name"] == "NP"

    def test_non_admin_sees_only_own_violations(self, client, make_user, make_member, auth):
        from services.auth_service import create_access_token
        my_member = make_member("Mine")
        other_member = make_member("Other")
        user = make_user("regular_joe", role="user", member=my_member)
        user_header = {"Authorization": f"Bearer {create_access_token(user)}"}

        _log(client, my_member.id, auth)
        _log(client, other_member.id, auth)

        res = client.get("/api/violations", headers=user_header)
        assert res.status_code == 200
        assert len(res.json()) == 1
        assert res.json()[0]["member_name"] == "Mine"

    def test_user_with_no_member_sees_empty_list(self, client, make_user):
        from services.auth_service import create_access_token
        user = make_user("unlinked", role="user")  # no member linked
        header = {"Authorization": f"Bearer {create_access_token(user)}"}
        res = client.get("/api/violations", headers=header)
        assert res.status_code == 200
        assert res.json() == []


class TestCreateViolation:
    def test_admin_can_log_violation(self, client, auth, make_member):
        m = make_member("Target Player")
        res = _log(client, m.id, auth, desc="Late to training")
        assert res.status_code == 201
        data = res.json()
        assert data["rule_ref"] == RULE
        assert data["member_name"] is not None
        assert data["member_strikes"] == 1

    def test_non_admin_cannot_log(self, client, make_user, make_member):
        from services.auth_service import create_access_token
        user = make_user("regular2", role="user")
        m = make_member("Player C")
        res = _log(client, m.id, {"Authorization": f"Bearer {create_access_token(user)}"})
        assert res.status_code == 403

    def test_invalid_rule_returns_400(self, client, auth, make_member):
        m = make_member("Player D")
        res = client.post(
            "/api/violations",
            json={"member_id": m.id, "rule_ref": "INVALID_RULE"},
            headers=auth,
        )
        assert res.status_code == 400

    def test_unknown_member_returns_404(self, client, auth):
        res = client.post(
            "/api/violations",
            json={"member_id": 99999, "rule_ref": RULE},
            headers=auth,
        )
        assert res.status_code == 404

    def test_strike_count_increments(self, client, auth, make_member):
        m = make_member("Strike Counter")
        _log(client, m.id, auth)
        res2 = _log(client, m.id, auth)
        assert res2.json()["member_strikes"] == 2


class TestAcknowledge:
    def test_member_can_acknowledge_own_violation(self, client, auth, make_user, make_member):
        from services.auth_service import create_access_token
        my_member = make_member("Ack Player")
        user = make_user("ack_user", role="user", member=my_member)
        user_header = {"Authorization": f"Bearer {create_access_token(user)}"}

        v = _log(client, my_member.id, auth).json()
        res = client.post(f"/api/violations/{v['id']}/acknowledge", headers=user_header)
        assert res.status_code == 200
        assert res.json()["acknowledged_at"] is not None

    def test_cannot_acknowledge_twice(self, client, auth, make_user, make_member):
        from services.auth_service import create_access_token
        my_member = make_member("Double Ack")
        user = make_user("double_ack_user", role="user", member=my_member)
        user_header = {"Authorization": f"Bearer {create_access_token(user)}"}
        v = _log(client, my_member.id, auth).json()
        client.post(f"/api/violations/{v['id']}/acknowledge", headers=user_header)
        res = client.post(f"/api/violations/{v['id']}/acknowledge", headers=user_header)
        assert res.status_code == 400

    def test_other_member_cannot_acknowledge(self, client, auth, make_user, make_member):
        from services.auth_service import create_access_token
        victim = make_member("Victim")
        intruder_m = make_member("Intruder")
        intruder_u = make_user("intruder_user", role="user", member=intruder_m)
        intruder_header = {"Authorization": f"Bearer {create_access_token(intruder_u)}"}
        v = _log(client, victim.id, auth).json()
        res = client.post(f"/api/violations/{v['id']}/acknowledge", headers=intruder_header)
        assert res.status_code == 403


class TestDelete:
    def test_admin_can_delete(self, client, auth, make_member):
        m = make_member("Delete Target")
        v = _log(client, m.id, auth).json()
        res = client.delete(f"/api/violations/{v['id']}", headers=auth)
        assert res.status_code == 204
        remaining = client.get("/api/violations", headers=auth).json()
        assert all(x["id"] != v["id"] for x in remaining)

    def test_non_admin_cannot_delete(self, client, auth, make_user, make_member):
        from services.auth_service import create_access_token
        m = make_member("Protected")
        v = _log(client, m.id, auth).json()
        user = make_user("powerless", role="user")
        res = client.delete(
            f"/api/violations/{v['id']}",
            headers={"Authorization": f"Bearer {create_access_token(user)}"},
        )
        assert res.status_code == 403
