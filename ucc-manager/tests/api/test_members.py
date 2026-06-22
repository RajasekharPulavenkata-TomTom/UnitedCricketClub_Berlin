"""Tests for /api/members endpoints."""
import pytest

pytestmark = pytest.mark.api


class TestListMembers:
    def test_returns_all_members(self, client, auth, make_member):
        make_member("Player One")
        make_member("Player Two")
        res = client.get("/api/members", headers=auth)
        assert res.status_code == 200
        names = [m["name"] for m in res.json()]
        assert "Player One" in names
        assert "Player Two" in names

    def test_active_only_excludes_inactive(self, client, auth, make_member):
        make_member("Active Player", active=True)
        make_member("Retired Player", active=False)
        res = client.get("/api/members?active_only=true", headers=auth)
        assert res.status_code == 200
        names = [m["name"] for m in res.json()]
        assert "Active Player" in names
        assert "Retired Player" not in names

    def test_empty_db_returns_empty_list(self, client, auth):
        res = client.get("/api/members", headers=auth)
        assert res.status_code == 200
        assert res.json() == []

    def test_requires_auth(self, client):
        res = client.get("/api/members")
        assert res.status_code == 401


class TestCreateMember:
    def test_admin_can_create(self, client, auth):
        res = client.post("/api/members", json={"name": "New Player"}, headers=auth)
        assert res.status_code == 201
        assert res.json()["name"] == "New Player"

    def test_non_admin_cannot_create(self, client, make_user):
        from services.auth_service import create_access_token
        user = make_user("regular", role="player")
        token = create_access_token(user)
        res = client.post(
            "/api/members",
            json={"name": "Sneaky Player"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 403

    def test_duplicate_name_returns_error(self, client, auth, make_member):
        make_member("Unique Name")
        res = client.post("/api/members", json={"name": "Unique Name"}, headers=auth)
        assert res.status_code in (400, 409, 422)


class TestUpdateMember:
    def test_admin_can_update(self, client, auth, make_member):
        m = make_member("Old Name")
        res = client.put(f"/api/members/{m.id}", json={"name": "New Name"}, headers=auth)
        assert res.status_code == 200
        assert res.json()["name"] == "New Name"

    def test_update_jersey_name(self, client, auth, make_member):
        m = make_member("Full Name")
        res = client.put(f"/api/members/{m.id}", json={"jersey_name": "FN"}, headers=auth)
        assert res.status_code == 200
        assert res.json()["jersey_name"] == "FN"

    def test_unknown_member_returns_404(self, client, auth):
        res = client.put("/api/members/99999", json={"name": "Ghost"}, headers=auth)
        assert res.status_code == 404
