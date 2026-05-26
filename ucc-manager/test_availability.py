"""
Playwright test for the availability page.
Run: python3 test_availability.py
"""
import asyncio
from playwright.async_api import async_playwright

URL = "https://united-cricket-club.fly.dev"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        # Collect console messages and errors
        console_msgs = []
        page.on("console", lambda msg: console_msgs.append(f"[{msg.type}] {msg.text}"))
        page.on("pageerror", lambda err: console_msgs.append(f"[PAGEERROR] {err}"))

        # ── 1. Load home page ──────────────────────────────────────────────
        print(f"\n{'='*60}")
        print(f"Opening {URL}")
        resp = await page.goto(URL, wait_until="networkidle")
        print(f"Status: {resp.status}")

        # ── 2. Navigate to availability ───────────────────────────────────
        print("\nNavigating to #availability …")
        await page.evaluate("location.hash = '#availability'")
        await page.wait_for_timeout(3000)  # give init() time to run

        # ── 3. Check what's in the page ───────────────────────────────────
        title = await page.title()
        print(f"Page title: {title}")

        av_grid = await page.query_selector("#av-grid")
        print(f"#av-grid found: {av_grid is not None}")

        if av_grid:
            grid_html = await av_grid.inner_html()
            print(f"#av-grid innerHTML length: {len(grid_html)} chars")
            print(f"#av-grid innerHTML preview: {grid_html[:300]}")

        cells = await page.query_selector_all(".av-cell:not(.other-month)")
        print(f"Clickable date cells found: {len(cells)}")

        # ── 4. Try clicking the first available cell ──────────────────────
        if cells:
            cell = cells[0]
            date_val = await cell.get_attribute("data-date")
            print(f"\nClicking cell with data-date='{date_val}' …")
            await cell.click()
            await page.wait_for_timeout(1000)

            # Check if dialog opened
            dialog = await page.query_selector("#av-dialog")
            dialog_open = await page.evaluate("document.getElementById('av-dialog')?.open") if dialog else False
            print(f"#av-dialog found: {dialog is not None}")
            print(f"#av-dialog open: {dialog_open}")

            if dialog_open:
                title_el = await page.query_selector("#av-dialog-title")
                title_text = await title_el.inner_text() if title_el else "(not found)"
                print(f"Dialog title: {title_text}")
        else:
            print("No clickable cells — grid may not have rendered.")

        # ── 5. Check network requests ──────────────────────────────────────
        print("\nChecking API availability endpoint …")
        api_resp = await page.request.get(f"{URL}/api/player-availability?year=2026&month=5")
        print(f"GET /api/player-availability status: {api_resp.status}")
        body = await api_resp.text()
        print(f"Response: {body[:200]}")

        # ── 6. Print all console messages ─────────────────────────────────
        print(f"\n{'='*60}")
        print("Console / error messages:")
        if console_msgs:
            for m in console_msgs:
                print(f"  {m}")
        else:
            print("  (none)")

        # ── 7. Screenshot ─────────────────────────────────────────────────
        await page.screenshot(path="/tmp/availability_test.png", full_page=True)
        print("\nScreenshot saved to /tmp/availability_test.png")

        await browser.close()

asyncio.run(main())
