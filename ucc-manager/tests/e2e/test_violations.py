"""
E2E tests for the Violations page.
Covers bugs fixed in this session:
 - Member filter dropdown is populated (not empty)
 - Log Violation modal shows all members (not 'Loading members…')
"""
import pytest
from tests.e2e.conftest import nav_to

pytestmark = pytest.mark.e2e


class TestViolationsPage:
    def test_page_loads(self, page):
        nav_to(page, "#violations")
        assert page.locator("#v-container").count() > 0

    def test_member_filter_dropdown_is_populated(self, page):
        """Regression: member filter must list all active members, not just violators."""
        nav_to(page, "#violations")

        # Filter is only visible for admins
        if not page.locator("#v-filters").is_visible():
            pytest.skip("Member filter not visible (not admin)")

        # The dropdown should have more than just the 'All members' default option
        # (assumes the server has at least one active member)
        options = page.locator("#v-filter-member option")
        count = options.count()
        assert count > 1, (
            f"Member filter only has {count} option(s) — expected all active members to be listed"
        )

    def test_log_violation_modal_shows_members(self, page):
        """Regression: Log Violation modal must populate member select, not show 'Loading members…'."""
        nav_to(page, "#violations")

        btn = page.locator("#btn-log-violation")
        if not btn.is_visible():
            pytest.skip("Log Violation button not visible (not admin)")

        btn.click()
        page.wait_for_selector("#logViolationModal.show", timeout=5000)

        # Wait a moment for async member fetch
        page.wait_for_timeout(1500)

        select = page.locator("#v-log-member")
        options = select.locator("option")
        option_texts = options.all_inner_texts()

        assert "Loading members…" not in option_texts, (
            "Modal still shows 'Loading members…' — member fetch did not complete"
        )
        assert len(option_texts) > 1, (
            f"Member select only has {len(option_texts)} option(s) — expected real member list"
        )

        # Close modal cleanly
        page.keyboard.press("Escape")
        page.wait_for_selector("#logViolationModal.show", state="hidden", timeout=3000)

    def test_log_violation_modal_closes_cleanly(self, page):
        """Verify clicking Cancel properly closes the modal with no backdrop left."""
        from tests.e2e.conftest import no_backdrop
        nav_to(page, "#violations")

        btn = page.locator("#btn-log-violation")
        if not btn.is_visible():
            pytest.skip("Log Violation button not visible (not admin)")

        btn.click()
        page.wait_for_selector("#logViolationModal.show", timeout=5000)
        page.locator("#logViolationModal .btn-secondary").click()
        page.wait_for_selector("#logViolationModal.show", state="hidden", timeout=3000)

        assert no_backdrop(page), "Backdrop remained after closing Log Violation modal"


class TestViolationsQuiz:
    """Smoke tests for the Quiz page since it shares field-rendering concerns."""

    def test_quiz_loads_and_starts(self, page):
        nav_to(page, "#quiz")
        page.wait_for_selector("#btn-start-quiz:not(:disabled)", timeout=8000)
        page.click("#btn-start-quiz")
        page.wait_for_selector("#quiz-question:not(.d-none)", timeout=5000)
        assert page.locator("#q-text").is_visible()

    def test_field_question_shows_svg(self, page):
        """When a field-type question appears, the SVG diagram should be visible."""
        nav_to(page, "#quiz")
        page.wait_for_selector("#btn-start-quiz:not(:disabled)", timeout=8000)
        page.click("#btn-start-quiz")

        # Play through up to 10 questions looking for a field question
        found_field = False
        for _ in range(10):
            field_div = page.locator("#q-field")
            if field_div.is_visible():
                svg = field_div.locator("svg")
                assert svg.count() > 0, "Field question div is visible but contains no SVG"
                found_field = True
                break
            # Answer the current question (click first option)
            opts = page.locator(".quiz-opt")
            if opts.count() == 0:
                break
            opts.first.click()
            page.wait_for_timeout(1400)

        # Field questions appear ~15/95 ≈ 16% of the time per question
        # In 10 questions, P(at least one) ≈ 83%. Soft-skip if none appeared.
        if not found_field:
            pytest.skip("No field question appeared in this 10-question sample (probabilistic)")
