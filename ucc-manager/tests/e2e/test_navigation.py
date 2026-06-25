"""
E2E tests: page loading and overlay/modal cleanup on navigation.

These tests catch the class of bug where navigating away leaves a
Bootstrap modal backdrop or native <dialog> ::backdrop stuck on screen.
"""
import pytest
from tests.e2e.conftest import nav_to, no_backdrop

pytestmark = pytest.mark.e2e

# All sidebar pages that should load without a JS console error
PAGES = [
    "home", "members", "calendar", "reporting", "practice-reporting",
    "field-editor", "match-results", "dashboard", "transactions",
    "categories", "reports", "equipment", "club-fees",
    "tasks", "polls", "pain-points", "violations", "rules", "history",
    "sponsors", "cricket-rules", "cricket-formats",
    "cricket-positions", "cricket-glossary", "dl-calculator",
]


class TestPageLoading:
    @pytest.mark.parametrize("page_name", PAGES)
    def test_page_loads_without_js_error(self, page, page_name):
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        nav_to(page, f"#{page_name}")
        assert errors == [], f"JS errors on #{page_name}: {errors}"

    @pytest.mark.parametrize("page_name", PAGES)
    def test_page_has_no_console_errors(self, page, page_name):
        console_errors = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        nav_to(page, f"#{page_name}")
        # Filter out known non-critical network errors (e.g. weather API)
        critical = [e for e in console_errors if "weather" not in e.lower() and "favicon" not in e.lower()]
        assert critical == [], f"Console errors on #{page_name}: {critical}"


class TestOverlayCleanup:
    """
    Regression tests for the 'frozen overlay' bug:
    Opening a modal/dialog and navigating away must leave no backdrop behind.
    """

    def test_calendar_availability_dialog_clears_on_navigation(self, page):
        """Open the native <dialog> availability picker, navigate away, check backdrop gone."""
        nav_to(page, "#calendar")

        # Click an empty calendar cell to open the availability dialog
        # (cells without events show the av-dialog)
        empty_cells = page.locator("button.cal-cell:not(.other-month)")
        # Try each cell until we find one without an event badge that opens the dialog
        dialog_opened = False
        for i in range(empty_cells.count()):
            cell = empty_cells.nth(i)
            if cell.locator("[data-eid]").count() == 0:
                cell.click()
                try:
                    page.wait_for_selector("#av-dialog[open]", timeout=2000)
                    dialog_opened = True
                    break
                except Exception:
                    continue

        if not dialog_opened:
            pytest.skip("No empty calendar cell found to open availability dialog")

        # Navigate away while dialog is open
        nav_to(page, "#home")

        # Verify no backdrop remains and body is scrollable
        assert no_backdrop(page), "Backdrop or modal-open class remained after navigating away"
        # Also verify the dialog itself is gone
        assert page.locator("#av-dialog[open]").count() == 0

    def test_calendar_event_detail_modal_clears_on_navigation(self, page):
        """Open the event detail Bootstrap modal, navigate away, check backdrop gone."""
        nav_to(page, "#calendar")

        # Click the first event badge if one exists
        badge = page.locator("[data-eid]").first
        if badge.count() == 0:
            pytest.skip("No events on calendar to test detail modal")

        badge.click()
        page.wait_for_selector("#eventDetailModal.show", timeout=5000)

        # Navigate away
        nav_to(page, "#home")

        assert no_backdrop(page), "Modal backdrop remained after navigating away from calendar"

    def test_violations_log_modal_clears_on_navigation(self, page):
        """Open Log Violation modal (admin only), navigate away, check backdrop gone."""
        nav_to(page, "#violations")

        # Wait for async init() to reveal admin button (init() is called without await in router)
        try:
            page.wait_for_selector("#btn-log-violation:not(.d-none)", timeout=6000)
        except Exception:
            pytest.skip("Log Violation button not visible (not admin)")
        btn = page.locator("#btn-log-violation")

        btn.click()
        page.wait_for_selector("#logViolationModal.show", timeout=5000)

        # Navigate away while modal is open
        nav_to(page, "#home")

        assert no_backdrop(page), "Modal backdrop remained after navigating away from violations"

    def test_no_backdrop_on_fresh_page_load(self, page):
        """Baseline: fresh navigation to home should have no backdrop."""
        nav_to(page, "#home")
        assert no_backdrop(page)

    def test_rapid_navigation_leaves_no_backdrop(self, page):
        """Navigate quickly through several pages; no backdrop should linger."""
        for h in ["#calendar", "#violations", "#members", "#home"]:
            page.evaluate(f"location.hash = '{h}'")
        page.wait_for_selector(".spinner-border", state="hidden", timeout=10000)
        assert no_backdrop(page)
