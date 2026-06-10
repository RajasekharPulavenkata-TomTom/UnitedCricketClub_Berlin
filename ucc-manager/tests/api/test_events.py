"""Tests for /api/events endpoints."""
import pytest
from datetime import date

pytestmark = pytest.mark.api

TODAY = date.today().isoformat()
THIS_YEAR = date.today().year
THIS_MONTH = date.today().month


def _create(client, auth, **kwargs):
    payload = {
        "title": "Test Match",
        "date": TODAY,
        "type": "match",
        "location": "Test Ground",
        **kwargs,
    }
    return client.post("/api/events", json=payload, headers=auth)


class TestListEvents:
    def test_empty_returns_empty_list(self, client, auth):
        res = client.get(f"/api/events?year={THIS_YEAR}&month={THIS_MONTH}", headers=auth)
        assert res.status_code == 200
        assert res.json() == []

    def test_returns_event_in_correct_month(self, client, auth):
        _create(client, auth)
        res = client.get(f"/api/events?year={THIS_YEAR}&month={THIS_MONTH}", headers=auth)
        assert len(res.json()) == 1
        assert res.json()[0]["title"] == "Test Match"

    def test_requires_auth(self, client):
        res = client.get(f"/api/events?year={THIS_YEAR}&month={THIS_MONTH}")
        assert res.status_code == 401


class TestCreateEvent:
    def test_admin_can_create(self, client, auth):
        res = _create(client, auth, title="Cup Final")
        assert res.status_code == 201
        assert res.json()["title"] == "Cup Final"

    def test_non_admin_cannot_create(self, client, make_user):
        from services.auth_service import create_access_token
        user = make_user("non_admin", role="user")
        header = {"Authorization": f"Bearer {create_access_token(user)}"}
        res = _create(client, header, title="Sneaky Event")
        assert res.status_code == 403

    def test_created_event_has_required_fields(self, client, auth):
        res = _create(client, auth)
        data = res.json()
        assert "id" in data
        assert "date" in data
        assert "type" in data


class TestDeleteEvent:
    def test_admin_can_delete(self, client, auth):
        ev = _create(client, auth).json()
        res = client.delete(f"/api/events/{ev['id']}", headers=auth)
        assert res.status_code == 204

    def test_unknown_event_returns_404(self, client, auth):
        res = client.delete("/api/events/99999", headers=auth)
        assert res.status_code == 404
