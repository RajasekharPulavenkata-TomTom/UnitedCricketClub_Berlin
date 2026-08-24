"""Tests for the ODCV results CSV parser and the /api/scoreboard/import endpoint."""
import io
import pytest

from services.results_import import parse_odcv_results

pytestmark = pytest.mark.api

# Real-shaped ODCV export: our team (ACB 2nd XI) plus unrelated rows.
CSV = (
    '"SNO","MATCH TYPE","DATE","Team ONE","TEAM TWO","RESULT","SCORE SUMMARY"\n'
    '"1","League","08/16/2026","BCA 2nd XI","ICAB 2nd XI","BCA 2nd XI won by 51 Runs","BCA 2nd XI: 145/7(20)ICAB 2nd XI: 94/10(16.3)"\n'
    '"2","League","08/09/2026","ACB 2nd XI","BSV Vikings","ACB 2nd XI won by 58 Runs","ACB 2nd XI: 208/5(20)BSV Vikings: 150/7(20)"\n'
    '"3","League","08/08/2026","Viktoria T20 1st XI","ACB 2nd XI","ACB 2nd XI won by 3 Wickets","Viktoria T20 1st XI: 127/10(16.1)ACB 2nd XI: 131/7(19.3)"\n'
    '"4","League","06/13/2026","BCA 2nd XI","BSV Vikings","Abandoned. Winner: BCA 2nd XI","BCA 2nd XI: 138/9(20)BSV Vikings: 62/5(16)"\n'
    '"5","League","06/07/2026","KSV T20 2nd XI","ACB 2nd XI","ACB 2nd XI won by 5 Wickets","KSV T20 2nd XI: 79/8(20)ACB 2nd XI: 82/5(14.2)"\n'
)


class TestParser:
    def test_filters_to_our_team(self):
        rows = parse_odcv_results(CSV, "ACB 2nd XI", "T20")
        assert len(rows) == 3  # rows 2, 3, 5 involve ACB 2nd XI; 1 and 4 don't
        assert all(r["match_type"] == "T20" for r in rows)

    def test_home_row_scores_and_margin(self):
        r = next(r for r in parse_odcv_results(CSV, "ACB 2nd XI", "T20") if r["opponent"] == "BSV Vikings")
        assert r["result"] == "won"
        assert r["margin"] == "58 runs"
        assert r["our_score"] == "208/5 (20)"       # normalised spacing
        assert r["opponent_score"] == "150/7 (20)"
        assert str(r["date"]) == "2026-08-09"

    def test_away_row_perspective(self):
        # We are TEAM TWO here; opponent + scores must still map from our side.
        r = next(r for r in parse_odcv_results(CSV, "ACB 2nd XI", "T20") if r["opponent"] == "Viktoria T20 1st XI")
        assert r["result"] == "won"
        assert r["margin"] == "3 wickets"
        assert r["our_score"] == "131/7 (19.3)"
        assert r["opponent_score"] == "127/10 (16.1)"

    def test_loss_detection(self):
        # Flip perspective: from BSV's side, the 58-run game is a loss.
        r = next(r for r in parse_odcv_results(CSV, "BSV Vikings", "T20") if r["opponent"] == "ACB 2nd XI")
        assert r["result"] == "lost"
        assert r["margin"] == "58 runs"

    def test_abandoned_with_winner(self):
        r = next(r for r in parse_odcv_results(CSV, "BCA 2nd XI", "T20") if r["opponent"] == "BSV Vikings")
        assert r["result"] == "won"     # "Abandoned. Winner: BCA 2nd XI"
        assert r["margin"] is None

    def test_tie(self):
        csv = ('"SNO","MATCH TYPE","DATE","Team ONE","TEAM TWO","RESULT","SCORE SUMMARY"\n'
               '"1","League","07/01/2026","ACB 2nd XI","X CC","Match Tied","ACB 2nd XI: 150/8(20)X CC: 150/9(20)"\n')
        r = parse_odcv_results(csv, "ACB 2nd XI", "T20")[0]
        assert r["result"] == "tied" and r["margin"] is None


class TestImportEndpoint:
    def _upload(self, client, auth, text, match_type="T20"):
        return client.post(
            "/api/scoreboard/import",
            headers=auth,
            data={"match_type": match_type},
            files={"file": ("results.csv", io.BytesIO(text.encode()), "text/csv")},
        )

    def test_import_creates_rows(self, client, auth):
        res = self._upload(client, auth, CSV)
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["imported"] == 3 and body["updated"] == 0
        listed = client.get("/api/scoreboard?year=2026", headers=auth).json()
        assert {r["opponent"] for r in listed} == {"BSV Vikings", "Viktoria T20 1st XI", "KSV T20 2nd XI"}
        assert all(r["match_type"] == "T20" for r in listed)

    def test_reimport_is_idempotent(self, client, auth):
        self._upload(client, auth, CSV)
        res = self._upload(client, auth, CSV)          # same file again
        body = res.json()
        assert body["imported"] == 0 and body["updated"] == 3
        assert len(client.get("/api/scoreboard?year=2026", headers=auth).json()) == 3  # no dupes

    def test_invalid_format_rejected(self, client, auth):
        assert self._upload(client, auth, CSV, match_type="Hundred").status_code == 422

    def test_requires_admin(self, client, user_token):
        token, _ = user_token
        res = self._upload(client, {"Authorization": token}, CSV)
        assert res.status_code == 403
