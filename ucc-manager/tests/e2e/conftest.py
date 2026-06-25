"""
Playwright E2E fixtures.

Required environment variables:
  E2E_BASE_URL   URL of a running UCC Manager instance  (default: http://localhost:8000)
  E2E_USERNAME   Login username
  E2E_PASSWORD   Login password

Run:
  pytest tests/e2e/ -v
"""
import os
import pytest

BASE_URL  = os.environ.get("E2E_BASE_URL", "http://localhost:8000")
USERNAME  = os.environ.get("E2E_USERNAME", "")
PASSWORD  = os.environ.get("E2E_PASSWORD", "")


def pytest_configure(config):
    pass  # DATABASE_URL already handled by root conftest


@pytest.fixture(scope="session")
def _require_e2e():
    if not USERNAME or not PASSWORD:
        pytest.skip("Set E2E_USERNAME and E2E_PASSWORD to run E2E tests")


@pytest.fixture(scope="session")
def browser_context_args(browser_context_args):
    return {**browser_context_args, "base_url": BASE_URL}


@pytest.fixture(scope="session")
def _auth_context(browser, _require_e2e):
    """Login once per session; all tests share this authenticated browser context."""
    ctx = browser.new_context(base_url=BASE_URL)
    pg = ctx.new_page()
    pg.goto("/")
    pg.wait_for_selector("#authModal.show", timeout=8000)
    pg.fill("#login-form [name=username]", USERNAME)
    pg.fill("#login-form [name=password]", PASSWORD)
    pg.click("#login-form button[type=submit]")
    pg.wait_for_selector("#authModal.show", state="hidden", timeout=8000)
    pg.close()
    yield ctx
    ctx.close()


@pytest.fixture
def page(_auth_context):
    """Fresh page from the shared authenticated context; no login overhead per test."""
    pg = _auth_context.new_page()
    # Must navigate to the app URL — a new page starts at about:blank and
    # page.evaluate("location.hash = ...") would set the hash on about:blank instead.
    # The shared context carries localStorage with the JWT, so no login modal appears.
    pg.goto("/")
    yield pg
    pg.close()


def nav_to(page, hash_fragment):
    """Navigate to a hash page and wait for spinner to disappear."""
    page.evaluate(f"location.hash = '{hash_fragment}'")
    page.wait_for_selector(".spinner-border", state="hidden", timeout=10000)


def no_backdrop(page):
    """Assert no Bootstrap modal backdrop or native dialog backdrop is visible."""
    backdrop_count = page.locator(".modal-backdrop").count()
    modal_open = page.evaluate("document.body.classList.contains('modal-open')")
    overflow_hidden = page.evaluate("getComputedStyle(document.body).overflow === 'hidden'")
    return backdrop_count == 0 and not modal_open and not overflow_hidden
