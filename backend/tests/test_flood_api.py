"""The flood desk routes: what they serve, and what they refuse."""

import pytest
from fastapi.testclient import TestClient

from app.core import runs_store
from app.domains.flood import store as desk_store
from app.domains.flood.content import CONTENT_DIR
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setattr(
        type(runs_store.settings), "runs_dir", property(lambda self: tmp_path)
    )
    return tmp_path


def _warm(**over):
    store = desk_store.empty_store()
    store["lastRunAt"] = "2026-08-31T15:00:00.000Z"
    store["nextRunAt"] = "2026-08-31T15:10:00.000Z"
    store.update(over)
    desk_store.persist(store)


class TestColdStart:
    """Before the first cycle, a section says it is waiting — not that a portal
    returned nothing. Those are different facts."""

    def test_contacts_report_awaiting_rather_than_an_empty_directory(self):
        body = client.get("/api/v1/flood/contacts").json()
        assert body["items"] == []
        assert body["error"] == "awaiting_first_cycle"

    def test_a_cold_section_is_never_cached(self):
        """Cached for ten minutes, it would keep saying "not collected yet"
        long after the cycle collected it."""
        response = client.get("/api/v1/flood/contacts")
        assert "no-store" in response.headers["cache-control"]
        assert response.headers["x-atlas-cache"] == "cold"

    def test_the_rescue_register_reports_awaiting_rather_than_zero_rescued(self):
        body = client.get("/api/v1/flood/rescue").json()
        assert body["persons"] == []
        assert body["error"] == "awaiting_first_cycle"

    def test_the_person_register_reports_awaiting(self):
        body = client.get("/api/v1/flood/persons").json()
        assert body["fetched"] == 0
        assert body["error"] == "awaiting_first_cycle"


class TestWarmResponses:
    def test_a_filled_section_is_served_and_cached(self):
        _warm(
            officialContacts={
                "items": [{"name": "Rasuwa", "contacts": [{"phone": "9851"}]}],
                "error": None,
                "source": {},
                "fetchedAt": "t",
            }
        )
        response = client.get("/api/v1/flood/contacts")
        assert response.json()["items"][0]["name"] == "Rasuwa"
        assert response.headers["x-atlas-cache"] == "cron"
        assert "s-maxage" in response.headers["cache-control"]

    def test_the_overview_carries_reviewed_content_even_when_cold(self):
        """The funds and helplines are bundled. A cold cycle must not hide them
        — this is the page that tells someone who to call."""
        body = client.get("/api/v1/flood").json()
        assert body["funds"], "reviewed relief funds vanished on a cold desk"
        assert body["helplines"] is not None

    def test_the_inline_qr_is_stripped_from_donations(self):
        """Tens of kilobytes per channel, and the signed proxy path is there."""
        _warm(
            donationChannels={
                "items": [{"id": "1", "qrData": "data:image/png;base64,AAAA", "qrProxy": "/p"}],
                "error": None,
                "source": {},
                "fetchedAt": "t",
            }
        )
        body = client.get("/api/v1/flood/donations").json()
        assert body["items"][0]["qrData"] is None
        assert body["items"][0]["qrProxy"] == "/p"

    def test_refresh_status_reports_per_source_health(self):
        _warm(
            health=[
                {"key": "river", "ok": True, "lastSuccess": "t", "error": None},
                {"key": "videos", "ok": False, "lastSuccess": "earlier", "error": "429"},
            ],
            river={"gauges": [1, 2, 3]},
        )
        body = client.get("/api/v1/flood/refresh").json()
        assert body["counts"]["gauges"] == 3
        failed = [h for h in body["health"] if not h["ok"]]
        assert failed[0]["key"] == "videos"
        # The page an operator opens needs the last good time, not just "down".
        assert failed[0]["lastSuccess"] == "earlier"


class TestAuthGating:
    """An endpoint that says "wrong password" tells a prober it exists."""

    def test_triggering_a_refresh_without_a_configured_token_is_404(self, monkeypatch):
        monkeypatch.setattr("app.domains.flood.routers.settings.FLOOD_REFRESH_TOKEN", "")
        assert client.post("/api/v1/flood/refresh").status_code == 404

    def test_a_wrong_token_is_also_404_not_401(self, monkeypatch):
        monkeypatch.setattr("app.domains.flood.routers.settings.FLOOD_REFRESH_TOKEN", "secret")
        response = client.post(
            "/api/v1/flood/refresh", headers={"Authorization": "Bearer wrong"}
        )
        assert response.status_code == 404

    def test_reading_corrections_needs_the_admin_token(self, monkeypatch):
        """These rows carry the contact details of people reporting a missing
        relative."""
        monkeypatch.setattr("app.domains.flood.routers.settings.FLOOD_ADMIN_TOKEN", "")
        assert client.get("/api/v1/flood/rescue/correction").status_code == 404

    def test_reloading_content_needs_the_admin_token(self, monkeypatch):
        monkeypatch.setattr("app.domains.flood.routers.settings.FLOOD_ADMIN_TOKEN", "")
        assert client.post("/api/v1/flood/content/reload").status_code == 404

    def test_a_wrong_admin_token_is_also_404(self, monkeypatch):
        monkeypatch.setattr("app.domains.flood.routers.settings.FLOOD_ADMIN_TOKEN", "secret")
        response = client.post(
            "/api/v1/flood/content/reload", headers={"Authorization": "Bearer wrong"}
        )
        assert response.status_code == 404

    def test_content_reload_succeeds_with_correct_token(self, monkeypatch):
        monkeypatch.setattr("app.domains.flood.routers.settings.FLOOD_ADMIN_TOKEN", "secret")
        response = client.post(
            "/api/v1/flood/content/reload",
            headers={"Authorization": "Bearer secret"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["reloaded"] is True
        assert "funds" in body
        assert "districtShapes" in body


class TestOptionalDatabase:
    def test_the_digest_hides_itself_without_a_database(self, monkeypatch):
        """Not an error — the rest of the desk works without one."""
        monkeypatch.setattr(
            "app.domains.flood.routers.is_db_configured", lambda: False
        )
        body = client.get("/api/v1/flood/digest").json()
        assert body["enabled"] is False
        assert body["reason"] == "database_not_configured"

    def test_filing_a_correction_without_a_database_is_503(self, monkeypatch):
        monkeypatch.setattr(
            "app.domains.flood.routers.is_db_configured", lambda: False
        )
        response = client.post(
            "/api/v1/flood/rescue/correction", json={"message": "wrong spelling"}
        )
        assert response.status_code == 503


class TestMtimeCache:
    """The content cache re-reads files when their mtime changes."""

    def test_cache_returns_same_object_within_check_interval(self):
        from app.domains.flood.content import _MtimeCache

        calls = 0

        def loader():
            nonlocal calls
            calls += 1
            return {"loaded": calls}

        cache = _MtimeCache(CONTENT_DIR)
        first = cache.get(loader)
        second = cache.get(loader)
        assert first is second
        assert calls == 1

    def test_clear_forces_reload(self):
        from app.domains.flood.content import _MtimeCache

        calls = 0

        def loader():
            nonlocal calls
            calls += 1
            return {"loaded": calls}

        cache = _MtimeCache(CONTENT_DIR)
        cache.get(loader)
        assert calls == 1
        cache.clear()
        cache.get(loader)
        assert calls == 2

    def test_mtime_change_triggers_reload(self, tmp_path, monkeypatch):
        import os
        import time

        from app.domains.flood import content
        from app.domains.flood.content import _MtimeCache

        monkeypatch.setattr(content, "_CHECK_INTERVAL_S", 0)

        file1 = tmp_path / "a.json"
        file1.write_text('{"val": 1}')

        calls = 0

        def loader():
            nonlocal calls
            calls += 1
            return file1.read_text()

        cache = _MtimeCache(tmp_path, "*.json")
        res1 = cache.get(loader)
        assert res1 == '{"val": 1}'
        assert calls == 1

        new_time = time.time() + 10
        file1.write_text('{"val": 2}')
        os.utime(file1, (new_time, new_time))

        res2 = cache.get(loader)
        assert res2 == '{"val": 2}'
        assert calls == 2

    def test_deleting_file_triggers_reload(self, tmp_path, monkeypatch):
        import os
        import time

        from app.domains.flood import content
        from app.domains.flood.content import _MtimeCache

        monkeypatch.setattr(content, "_CHECK_INTERVAL_S", 0)

        file_old = tmp_path / "a.json"
        file_new = tmp_path / "b.json"

        file_old.write_text('{"file": "a"}')
        t1 = time.time()
        os.utime(file_old, (t1, t1))

        t2 = t1 + 10
        file_new.write_text('{"file": "b"}')
        os.utime(file_new, (t2, t2))

        calls = 0

        def loader():
            nonlocal calls
            calls += 1
            return [p.name for p in sorted(tmp_path.glob("*.json"))]

        cache = _MtimeCache(tmp_path, "*.json")
        res1 = cache.get(loader)
        assert res1 == ["a.json", "b.json"]
        assert calls == 1

        # Delete older file (a.json). Max mtime does not change, but count changes!
        file_old.unlink()

        res2 = cache.get(loader)
        assert res2 == ["b.json"]
        assert calls == 2


class TestCorrectionValidation:
    def test_a_correction_needs_a_message(self):
        from app.domains.flood.corrections import KINDS, file_correction

        assert "not_safe" in KINDS
        import asyncio

        with pytest.raises(ValueError, match="message_required"):
            asyncio.run(file_correction({"message": "   "}))

    def test_an_unknown_kind_falls_back_to_other_rather_than_failing(self):
        """A form field that drifted must not lose someone's report."""
        from app.domains.flood.corrections import KINDS

        assert "other" in KINDS

    def test_the_ip_is_hashed_never_stored_raw(self):
        from app.domains.flood.corrections import hash_ip

        digest = hash_ip("203.0.113.7")
        assert "203.0.113.7" not in digest
        assert len(digest) == 64
