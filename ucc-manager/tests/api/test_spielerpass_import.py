"""Tests for the Spielerpass parser/matcher and the import endpoint."""
import pytest

from services.spielerpass_import import parse_entries, match_entries

pytestmark = pytest.mark.api


class TestParser:
    def test_various_separators(self):
        text = (
            "Chirag Patel = DCB0M55166\n"
            "Raja Sekhar Pula Venkata: DCB0M44632\n"
            "Vinal Kamble, DCB0M41414\n"
            "DCB0M12628  Raj Kumar Saragadam\n"      # number first
            "\n"                                       # blank
            "no number on this line\n"                # ignored
        )
        entries = parse_entries(text)
        assert entries == [
            {"name": "Chirag Patel", "number": "DCB0M55166"},
            {"name": "Raja Sekhar Pula Venkata", "number": "DCB0M44632"},
            {"name": "Vinal Kamble", "number": "DCB0M41414"},
            {"name": "Raj Kumar Saragadam", "number": "DCB0M12628"},
        ]

    def test_lowercase_number_normalised(self):
        assert parse_entries("Foo Bar = dcb0m99999")[0]["number"] == "DCB0M99999"


class TestMatcher:
    MEMBERS = [(1, "Chirag Patel", None), (2, "Raj Kumar", "Raju"), (3, "Vinal", "Vinal Kamble")]

    def test_match_by_name_and_jersey_case_insensitive(self):
        entries = [{"name": "chirag  patel", "number": "A"},   # spacing/case
                   {"name": "Vinal Kamble", "number": "B"},    # matches jersey_name
                   {"name": "Nobody Here", "number": "C"}]
        matched, unmatched = match_entries(entries, self.MEMBERS)
        assert {m["member_id"] for m in matched} == {1, 3}
        assert [u["name"] for u in unmatched] == ["Nobody Here"]


class TestEndpoint:
    def test_import_updates_matched_and_reports_unmatched(self, client, auth, make_member):
        m1 = make_member("Chirag Patel")
        m2 = make_member("Vinal", jersey_name="Vinal Kamble")
        text = ("Chirag Patel = DCB0M55166\n"
                "Vinal Kamble = DCB0M41414\n"
                "Ghost Player = DCB0M00000\n")
        res = client.post("/api/members/import-spielerpass", headers=auth, json={"text": text})
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["updated"] == 2
        assert body["unmatched"] == ["Ghost Player"]
        # values landed
        members = {m["id"]: m for m in client.get("/api/members", headers=auth).json()}
        assert members[m1.id]["dcb_id"] == "DCB0M55166"
        assert members[m2.id]["dcb_id"] == "DCB0M41414"

    def test_idempotent(self, client, auth, make_member):
        make_member("Chirag Patel")
        text = "Chirag Patel = DCB0M55166\n"
        client.post("/api/members/import-spielerpass", headers=auth, json={"text": text})
        again = client.post("/api/members/import-spielerpass", headers=auth, json={"text": text}).json()
        assert again["updated"] == 1 and again["unmatched"] == []

    def test_requires_admin(self, client, user_token):
        token, _ = user_token
        res = client.post("/api/members/import-spielerpass",
                          headers={"Authorization": token}, json={"text": "X = DCB0M1"})
        assert res.status_code == 403
