"""
Tests for the self-service password reset flow.

POST /api/auth/forgot-password — always answers with the same generic message
(no account enumeration); emails a reset link when the user has one on file.
POST /api/auth/reset-password — stateless JWT with purpose + password-hash
fingerprint: expires in 30 min and dies as soon as the password changes.
"""
import pytest

pytestmark = pytest.mark.api

GENERIC = "If this account has an email on file, a reset link has been sent."


@pytest.fixture
def email_member(db, make_member):
    member = make_member("Reset Player")
    member.email = "reset.player@example.com"
    db.commit()
    return member


@pytest.fixture
def reset_user(make_user, email_member):
    return make_user("resetme", password="oldpass123", member=email_member)


@pytest.fixture
def sent(monkeypatch):
    """Capture outgoing reset emails instead of hitting SendGrid."""
    calls = []
    from routers import auth as auth_router
    monkeypatch.setattr(auth_router, "_notify_reset",
                        lambda username, url, email: calls.append((username, url, email)))
    return calls


class TestForgotPassword:
    def test_sends_link_and_returns_generic(self, client, reset_user, sent):
        res = client.post("/api/auth/forgot-password", json={"username": "resetme"})
        assert res.status_code == 200
        assert res.json()["message"] == GENERIC
        assert len(sent) == 1
        username, url, email = sent[0]
        assert username == "resetme"
        assert email == "reset.player@example.com"
        assert "?reset=" in url

    def test_unknown_username_same_response_no_email(self, client, sent):
        res = client.post("/api/auth/forgot-password", json={"username": "ghost"})
        assert res.status_code == 200
        assert res.json()["message"] == GENERIC
        assert sent == []

    def test_user_without_member_email_same_response(self, client, make_user, sent):
        make_user("noemail")  # no linked member at all
        res = client.post("/api/auth/forgot-password", json={"username": "noemail"})
        assert res.status_code == 200
        assert res.json()["message"] == GENERIC
        assert sent == []


class TestResetPassword:
    def _token_for(self, user):
        from services.auth_service import create_reset_token
        return create_reset_token(user)

    def test_happy_path(self, client, db, reset_user):
        token = self._token_for(reset_user)
        res = client.post("/api/auth/reset-password",
                          json={"token": token, "new_password": "newpass456"})
        assert res.status_code == 200, res.text
        # old password no longer works; new one does
        assert client.post("/api/auth/login",
                           json={"username": "resetme", "password": "oldpass123"}).status_code == 401
        assert client.post("/api/auth/login",
                           json={"username": "resetme", "password": "newpass456"}).status_code == 200

    def test_token_is_single_use(self, client, reset_user):
        token = self._token_for(reset_user)
        first = client.post("/api/auth/reset-password",
                            json={"token": token, "new_password": "newpass456"})
        assert first.status_code == 200
        # same token again: password hash changed → fingerprint mismatch
        second = client.post("/api/auth/reset-password",
                             json={"token": token, "new_password": "hacker789"})
        assert second.status_code == 400

    def test_login_token_cannot_reset(self, client, reset_user):
        from services.auth_service import create_access_token
        login_token = create_access_token(reset_user)
        res = client.post("/api/auth/reset-password",
                          json={"token": login_token, "new_password": "newpass456"})
        assert res.status_code == 400

    def test_tampered_token_rejected(self, client, reset_user):
        token = self._token_for(reset_user) + "x"
        res = client.post("/api/auth/reset-password",
                          json={"token": token, "new_password": "newpass456"})
        assert res.status_code == 400

    def test_expired_token_rejected(self, client, reset_user, monkeypatch):
        import services.auth_service as svc
        monkeypatch.setattr(svc, "RESET_TOKEN_EXPIRE_MINUTES", -1)
        token = self._token_for(reset_user)
        res = client.post("/api/auth/reset-password",
                          json={"token": token, "new_password": "newpass456"})
        assert res.status_code == 400

    def test_short_password_rejected(self, client, reset_user):
        token = self._token_for(reset_user)
        res = client.post("/api/auth/reset-password",
                          json={"token": token, "new_password": "short"})
        assert res.status_code == 422
