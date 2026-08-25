"""Tests for Spielerpass PDF upload / serve / flag."""
import io
import pytest

pytestmark = pytest.mark.api

PDF = b"%PDF-1.4 fake spielerpass bytes"


def _files(*named):
    # named: (filename, bytes) tuples -> multipart 'files' list
    return [("files", (fn, io.BytesIO(data), "application/pdf")) for fn, data in named]


class TestUpload:
    def test_upload_matches_by_filename_and_stores(self, client, auth, make_member):
        m = make_member("Chirag Patel")
        res = client.post("/api/members/spielerpass/upload", headers=auth,
                          files=_files(("Chirag_Patel (1).pdf", PDF)))
        assert res.status_code == 200, res.text
        assert res.json()["uploaded"] == ["Chirag Patel"]
        # flagged in the list
        m_row = next(x for x in client.get("/api/members", headers=auth).json() if x["id"] == m.id)
        assert m_row["has_spielerpass"] is True
        # served back with the exact bytes
        pdf = client.get(f"/api/members/{m.id}/spielerpass", headers=auth)
        assert pdf.status_code == 200
        assert pdf.headers["content-type"] == "application/pdf"
        assert pdf.content == PDF

    def test_matches_jersey_name_and_reports_unmatched(self, client, auth, make_member):
        make_member("Vinal", jersey_name="Vinal Kamble")
        res = client.post("/api/members/spielerpass/upload", headers=auth,
                          files=_files(("Vinal_Kamble.pdf", PDF), ("Ghost_Player (1).pdf", PDF)))
        body = res.json()
        assert body["uploaded"] == ["Vinal"]
        assert body["unmatched"] == ["Ghost_Player (1).pdf"]

    def test_reupload_replaces(self, client, auth, make_member):
        m = make_member("Chirag Patel")
        client.post("/api/members/spielerpass/upload", headers=auth,
                    files=_files(("Chirag_Patel.pdf", b"%PDF old")))
        client.post("/api/members/spielerpass/upload", headers=auth,
                    files=_files(("Chirag_Patel.pdf", b"%PDF new")))
        assert client.get(f"/api/members/{m.id}/spielerpass", headers=auth).content == b"%PDF new"
        # still exactly one doc (no duplicate)
        assert next(x for x in client.get("/api/members", headers=auth).json()
                    if x["id"] == m.id)["has_spielerpass"] is True

    def test_non_pdf_skipped(self, client, auth, make_member):
        make_member("Chirag Patel")
        res = client.post("/api/members/spielerpass/upload", headers=auth,
                          files=[("files", ("Chirag_Patel.txt", io.BytesIO(b"x"), "text/plain"))])
        body = res.json()
        assert body["uploaded"] == []
        assert body["skipped"] == ["Chirag_Patel.txt (not a PDF)"]

    def test_requires_admin(self, client, user_token, make_member):
        make_member("Chirag Patel")
        token, _ = user_token
        res = client.post("/api/members/spielerpass/upload", headers={"Authorization": token},
                          files=_files(("Chirag_Patel.pdf", PDF)))
        assert res.status_code == 403


class TestServeAndDelete:
    def test_404_when_absent(self, client, auth, make_member):
        m = make_member("Nobody")
        assert client.get(f"/api/members/{m.id}/spielerpass", headers=auth).status_code == 404

    def test_download_disposition(self, client, auth, make_member):
        m = make_member("Chirag Patel")
        client.post("/api/members/spielerpass/upload", headers=auth,
                    files=_files(("Chirag_Patel.pdf", PDF)))
        r = client.get(f"/api/members/{m.id}/spielerpass?download=true", headers=auth)
        assert "attachment" in r.headers["content-disposition"]

    def test_admin_can_delete(self, client, auth, make_member):
        m = make_member("Chirag Patel")
        client.post("/api/members/spielerpass/upload", headers=auth,
                    files=_files(("Chirag_Patel.pdf", PDF)))
        assert client.delete(f"/api/members/{m.id}/spielerpass", headers=auth).status_code == 204
        assert client.get(f"/api/members/{m.id}/spielerpass", headers=auth).status_code == 404
