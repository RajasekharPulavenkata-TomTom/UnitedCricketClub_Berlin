"""
Shared pytest fixtures for UCC Manager tests.

Environment variables:
  TEST_DATABASE_URL  PostgreSQL URL for a dedicated test DB
                     e.g. postgresql://user:pass@localhost/ucc_test
                     All DB tests are skipped if this is not set.

  E2E_BASE_URL       Base URL of a running UCC Manager server (default: http://localhost:8000)
  E2E_USERNAME       Login username for E2E tests
  E2E_PASSWORD       Login password for E2E tests
"""
import os
import pytest
from fastapi.testclient import TestClient


# ── Must run before any app import so database.py doesn't raise RuntimeError ──
def pytest_configure(config):
    test_url = os.environ.get("TEST_DATABASE_URL")
    if test_url:
        os.environ["DATABASE_URL"] = test_url
    elif "DATABASE_URL" not in os.environ:
        # Placeholder so database.py can be imported; actual connection will fail
        # gracefully when the engine is first used (which is guarded by the fixture).
        os.environ["DATABASE_URL"] = "postgresql://localhost/ucc_test_placeholder"


# ── DB engine (session-scoped: create tables once, drop after all tests) ──────

@pytest.fixture(scope="session")
def engine():
    if not os.environ.get("TEST_DATABASE_URL"):
        pytest.skip("Set TEST_DATABASE_URL to run API tests")
    import models  # registers all ORM classes with Base
    from database import engine as _engine, Base
    Base.metadata.drop_all(bind=_engine)
    Base.metadata.create_all(bind=_engine)
    yield _engine
    Base.metadata.drop_all(bind=_engine)


# ── Per-test DB session ────────────────────────────────────────────────────────

@pytest.fixture
def db(engine):
    from database import SessionLocal
    session = SessionLocal()
    yield session
    session.close()


# ── FastAPI test client (no lifespan — tables already exist via engine) ───────

@pytest.fixture
def client(db):
    from database import get_db
    from main import app

    def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    yield TestClient(app, raise_server_exceptions=True)
    app.dependency_overrides.pop(get_db, None)


# ── Test-data helpers (imported by individual test modules) ───────────────────

@pytest.fixture
def make_user(db):
    """Factory: create a User row and return it."""
    from services.auth_service import hash_password
    from models.auth import User

    def _make(username, role="user", password="testpass123", member=None, status="active"):
        u = User(
            username=username,
            full_name=f"Test {username.title()}",
            hashed_password=hash_password(password),
            role=role,
            is_active=True,
            status=status,
            member_id=member.id if member else None,
        )
        db.add(u)
        db.commit()
        db.refresh(u)
        return u

    return _make


@pytest.fixture
def make_member(db):
    """Factory: create a Member row and return it."""
    from models.member import Member

    def _make(name="Test Player", active=True, jersey_name=None):
        m = Member(name=name, is_active=active, jersey_name=jersey_name)
        db.add(m)
        db.commit()
        db.refresh(m)
        return m

    return _make


@pytest.fixture
def admin_token(make_user):
    """Bearer token for a root admin user."""
    from services.auth_service import create_access_token
    user = make_user("admin_test", role="root")
    return f"Bearer {create_access_token(user)}"


@pytest.fixture
def user_token(make_user, make_member):
    """Bearer token for a regular user linked to a member."""
    from services.auth_service import create_access_token
    member = make_member("Linked Player")
    user = make_user("player_test", role="user", member=member)
    return f"Bearer {create_access_token(user)}", member


@pytest.fixture
def auth(admin_token):
    """Shorthand: Authorization header dict for admin."""
    return {"Authorization": admin_token}
