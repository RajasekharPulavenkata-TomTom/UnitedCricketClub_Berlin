"""Tests for /api/auth endpoints."""
import pytest

pytestmark = pytest.mark.api


class TestLogin:
    def test_valid_credentials_returns_token(self, client, make_user):
        make_user("alice", password="secret123")
        res = client.post("/api/auth/login", json={"username": "alice", "password": "secret123"})
        assert res.status_code == 200
        data = res.json()
        assert "access_token" in data
        assert data["username"] == "alice"
        assert data["role"] == "player"

    def test_wrong_password_returns_401(self, client, make_user):
        make_user("bob", password="correct")
        res = client.post("/api/auth/login", json={"username": "bob", "password": "wrong"})
        assert res.status_code == 401

    def test_unknown_user_returns_401(self, client):
        res = client.post("/api/auth/login", json={"username": "nobody", "password": "x"})
        assert res.status_code == 401

    def test_pending_account_returns_403(self, client, make_user):
        make_user("pending_user", status="pending")
        res = client.post("/api/auth/login", json={"username": "pending_user", "password": "testpass123"})
        assert res.status_code == 403
        assert "pending" in res.json()["detail"].lower()


class TestRegister:
    def test_new_user_created_as_pending(self, client):
        res = client.post("/api/auth/register", json={
            "username": "newplayer", "password": "pass1234", "full_name": "New Player"
        })
        assert res.status_code == 201

    def test_duplicate_username_returns_409(self, client, make_user):
        make_user("dup")
        res = client.post("/api/auth/register", json={
            "username": "dup", "password": "pass1234", "full_name": "Dup"
        })
        assert res.status_code == 409

    def test_registered_user_cannot_login_until_approved(self, client):
        client.post("/api/auth/register", json={
            "username": "waitinguser", "password": "pass1234", "full_name": "Waiting"
        })
        res = client.post("/api/auth/login", json={"username": "waitinguser", "password": "pass1234"})
        assert res.status_code == 403


class TestMe:
    def test_authenticated_returns_user_info(self, client, make_user):
        from services.auth_service import create_access_token
        user = make_user("carol", role="player")
        token = create_access_token(user)
        res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200
        assert res.json()["username"] == "carol"

    def test_unauthenticated_returns_401(self, client):
        res = client.get("/api/auth/me")
        assert res.status_code == 401

    def test_invalid_token_returns_401(self, client):
        res = client.get("/api/auth/me", headers={"Authorization": "Bearer invalid.token.here"})
        assert res.status_code == 401


class TestChangePassword:
    def test_valid_change_succeeds(self, client, make_user):
        from services.auth_service import create_access_token
        user = make_user("dave", password="oldpass")
        token = create_access_token(user)
        res = client.put(
            "/api/auth/me/password",
            json={"current_password": "oldpass", "new_password": "newpass123"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200
        # Can now log in with new password
        login = client.post("/api/auth/login", json={"username": "dave", "password": "newpass123"})
        assert login.status_code == 200

    def test_wrong_current_password_returns_400(self, client, make_user):
        from services.auth_service import create_access_token
        user = make_user("eve", password="realpass")
        token = create_access_token(user)
        res = client.put(
            "/api/auth/me/password",
            json={"current_password": "wrongpass", "new_password": "newpass123"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 400
