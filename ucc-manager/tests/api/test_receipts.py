"""
Tests for /api/receipts — digital Quittung for match-day cash payments.
"""
import pytest

pytestmark = pytest.mark.api

SIG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=="  # tiny placeholder


def _payload(**overrides):
    body = {
        "date": "2026-08-19",
        "recipient_name": "Hans Umpire",
        "amount": 60,
        "purpose": "Schiedsrichtergebühr / Umpire fee",
        "signature": SIG,
    }
    body.update(overrides)
    return body


class TestCreateReceipt:
    def test_create_and_numbering(self, client, auth):
        first = client.post("/api/receipts", headers=auth, json=_payload())
        assert first.status_code == 201, first.text
        data = first.json()
        assert data["receipt_no"] == f"UCC-2026-{data['id']:03d}"
        assert data["recipient_name"] == "Hans Umpire"
        assert float(data["amount"]) == 60
        assert data["location"] == "Berlin"  # Ort defaults when not sent
        assert data["paid_by"] is not None
        second = client.post("/api/receipts", headers=auth, json=_payload(amount=45.5))
        assert second.json()["id"] > data["id"]

    def test_signature_required(self, client, auth):
        res = client.post("/api/receipts", headers=auth, json=_payload(signature=""))
        assert res.status_code == 422
        res = client.post("/api/receipts", headers=auth,
                          json=_payload(signature="not-a-data-url"))
        assert res.status_code == 422

    def test_amount_must_be_positive(self, client, auth):
        assert client.post("/api/receipts", headers=auth,
                           json=_payload(amount=0)).status_code == 422
        assert client.post("/api/receipts", headers=auth,
                           json=_payload(amount=-5)).status_code == 422

    def test_requires_auth(self, client):
        assert client.post("/api/receipts", json=_payload()).status_code == 401


class TestListAndGet:
    def test_list_newest_first_without_signature(self, client, auth):
        for amount in (10, 20):
            client.post("/api/receipts", headers=auth, json=_payload(amount=amount))
        rows = client.get("/api/receipts", headers=auth).json()
        assert len(rows) == 2
        assert float(rows[0]["amount"]) == 20  # newest first
        assert "signature" not in rows[0]     # list stays light; detail has it

    def test_get_detail_includes_signature(self, client, auth):
        rid = client.post("/api/receipts", headers=auth, json=_payload()).json()["id"]
        detail = client.get(f"/api/receipts/{rid}", headers=auth).json()
        assert detail["signature"] == SIG

    def test_get_missing_404(self, client, auth):
        assert client.get("/api/receipts/9999", headers=auth).status_code == 404


class TestDelete:
    def test_root_can_delete(self, client, auth):
        rid = client.post("/api/receipts", headers=auth, json=_payload()).json()["id"]
        assert client.delete(f"/api/receipts/{rid}", headers=auth).status_code == 204
        assert client.get(f"/api/receipts/{rid}", headers=auth).status_code == 404

    def test_manager_can_delete(self, client, auth, make_user):
        from services.auth_service import create_access_token
        manager = {"Authorization": f"Bearer {create_access_token(make_user('rcpt_manager', role='manager'))}"}
        rid = client.post("/api/receipts", headers=auth, json=_payload()).json()["id"]
        assert client.delete(f"/api/receipts/{rid}", headers=manager).status_code == 204

    def test_player_cannot_delete(self, client, auth, user_token):
        token, _ = user_token
        rid = client.post("/api/receipts", headers=auth, json=_payload()).json()["id"]
        res = client.delete(f"/api/receipts/{rid}", headers={"Authorization": token})
        assert res.status_code == 403
