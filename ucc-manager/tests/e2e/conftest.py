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


@pytest.fixture
def page(browser, _require_e2e):
    """Authenticated page: logs in before each test."""
    ctx = browser.new_context(base_url=BASE_URL)
    pg = ctx.new_page()

    # Navigate to home and log in via the auth modal
    pg.goto("/")
    pg.wait_for_selector("#authModal.show", timeout=8000)
    pg.fill("#login-form [name=username]", USERNAME)
    pg.fill("#login-form [name=password]", PASSWORD)
    pg.click("#login-form button[type=submit]")
    # Wait for modal to disappear (successful login)
    pg.wait_for_selector("#authModal.show", state="hidden", timeout=8000)

    yield pg
    ctx.close()


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
