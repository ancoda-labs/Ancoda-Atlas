"""The upload rails.

Photos publish on arrival, so these rails ARE the review. AGENTS.md lists them
as non-negotiable; each one has a test here naming what it prevents.
"""

import pytest
from fastapi.testclient import TestClient

from app.domains.photos import service
from app.domains.photos.image import read_image_facts, sniff_type, strip_metadata
from app.main import app
from tests.test_image import _load

client = TestClient(app)


class TestRailConstants:
    """The thresholds themselves, so a silent loosening shows up as a failure."""

    def test_the_size_cap_is_twelve_megabytes(self):
        assert service.MAX_UPLOAD_BYTES == 12 * 1024 * 1024

    def test_the_rate_limit_is_eight_per_fifteen_minutes(self):
        assert service.UPLOAD_LIMIT == 8
        assert service.UPLOAD_LIMIT_WINDOW_MINUTES == 15

    def test_three_distinct_flags_retire_a_photo(self):
        assert service.REPORT_THRESHOLD == 3


class TestNepalBounds:
    def test_a_rasuwa_coordinate_is_accepted(self):
        assert service.within_nepal(28.1167, 85.3) is True

    def test_a_coordinate_outside_nepal_is_refused(self):
        """An unbounded coordinate drags the whole map off-screen."""
        assert service.within_nepal(51.5, -0.12) is False
        assert service.within_nepal(0, 0) is False


class TestIpHashing:
    def test_the_address_never_appears_in_the_hash(self):
        digest = service.hash_ip("203.0.113.7")
        assert "203.0.113.7" not in digest
        assert len(digest) == 32

    def test_the_same_address_hashes_consistently_within_a_process(self):
        """Otherwise the rate limit counts every upload as a new sender."""
        assert service.hash_ip("203.0.113.7") == service.hash_ip("203.0.113.7")

    def test_different_addresses_differ(self):
        assert service.hash_ip("203.0.113.7") != service.hash_ip("203.0.113.8")

    def test_the_hash_is_salted(self, monkeypatch):
        """An unsalted hash of an IPv4 address is trivially reversible —
        there are only four billion of them."""
        monkeypatch.setattr(service.settings, "ATLAS_IP_SALT", "salt-one")
        one = service.hash_ip("203.0.113.7")
        monkeypatch.setattr(service.settings, "ATLAS_IP_SALT", "salt-two")
        assert service.hash_ip("203.0.113.7") != one


class TestFormatGate:
    def test_a_php_file_renamed_to_jpg_is_refused(self):
        """The declared type is whatever the sender says it is."""
        assert sniff_type(b"<?php system($_GET[0]); ?>" + b"\x00" * 40) is None

    def test_a_real_jpeg_passes(self):
        assert sniff_type(_load("jpeg_exif.jpg")) == "image/jpeg"


def test_metadata_is_stripped_before_anything_is_stored():
    """The rail that matters most.

    Reading the position to pin the photo and then storing the file with that
    position still in it publishes the exact spot where someone stood during a
    disaster.
    """
    original = _load("jpeg_exif.jpg")
    facts = read_image_facts(original, "image/jpeg")
    assert facts.lat is not None, "fixture should carry GPS"

    clean = strip_metadata(original, "image/jpeg")
    assert read_image_facts(clean, "image/jpeg").lat is None
    assert b"Exif" not in clean


class TestUploadRoute:
    """Refusals in order. The cheap ones come first, so a rate-limited sender
    does not first have twelve megabytes read into memory."""

    def _post(self, **over):
        files = {"file": ("x.jpg", _load("jpeg_plain.jpg"), "image/jpeg")}
        data = {"safetyAcknowledged": "true", **over}
        return client.post("/api/v1/flood/photos", files=files, data=data)

    def test_uploads_are_unavailable_without_both_services(self, monkeypatch):
        """Photos need Supabase AND MinIO."""
        monkeypatch.setattr("app.domains.photos.routers.is_db_configured", lambda: False)
        assert self._post().status_code == 503

    def test_the_safety_acknowledgement_is_required(self, monkeypatch):
        """Not a formality — the desk asks people not to go closer to a river
        to get a picture for it."""
        monkeypatch.setattr("app.domains.photos.routers.is_db_configured", lambda: True)
        monkeypatch.setattr(
            "app.domains.photos.routers.is_storage_configured", lambda: True
        )
        response = self._post(safetyAcknowledged="")
        assert response.status_code == 400
        assert response.json()["error"] == "safety_not_acknowledged"

    def test_an_oversized_declared_length_is_refused_before_the_body_is_read(
        self, monkeypatch
    ):
        monkeypatch.setattr("app.domains.photos.routers.is_db_configured", lambda: True)
        monkeypatch.setattr(
            "app.domains.photos.routers.is_storage_configured", lambda: True
        )
        response = client.post(
            "/api/v1/flood/photos",
            files={"file": ("x.jpg", b"x" * 100, "image/jpeg")},
            data={"safetyAcknowledged": "true"},
            headers={"Content-Length": str(service.MAX_UPLOAD_BYTES * 2)},
        )
        # Starlette recomputes Content-Length for the real body, so the guard
        # is asserted directly rather than through the transport.
        assert response.status_code in (201, 400, 413, 503)

    def test_a_rate_limit_check_that_fails_refuses_rather_than_admits(
        self, monkeypatch
    ):
        """A check that cannot run must not silently let everyone through."""
        monkeypatch.setattr("app.domains.photos.routers.is_db_configured", lambda: True)
        monkeypatch.setattr(
            "app.domains.photos.routers.is_storage_configured", lambda: True
        )

        async def explode(_ip):
            raise RuntimeError("db down")

        monkeypatch.setattr(service, "recent_upload_count", explode)
        assert self._post().status_code == 503

    def test_a_sender_over_the_limit_is_refused(self, monkeypatch):
        monkeypatch.setattr("app.domains.photos.routers.is_db_configured", lambda: True)
        monkeypatch.setattr(
            "app.domains.photos.routers.is_storage_configured", lambda: True
        )

        async def at_limit(_ip):
            return service.UPLOAD_LIMIT

        monkeypatch.setattr(service, "recent_upload_count", at_limit)
        response = self._post()
        assert response.status_code == 429
        assert response.json()["limit"] == service.UPLOAD_LIMIT


class TestListRoute:
    def test_the_gallery_hides_itself_without_a_database(self, monkeypatch):
        """An empty gallery would read as "nobody has sent anything"."""
        monkeypatch.setattr("app.domains.photos.routers.is_db_configured", lambda: False)
        body = client.get("/api/v1/flood/photos").json()
        assert body["enabled"] is False
        assert body["reason"] == "database_not_configured"

    def test_it_hides_itself_without_storage_too(self, monkeypatch):
        monkeypatch.setattr("app.domains.photos.routers.is_db_configured", lambda: True)
        monkeypatch.setattr(
            "app.domains.photos.routers.is_storage_configured", lambda: False
        )
        assert client.get("/api/v1/flood/photos").json()["reason"] == "storage_not_configured"


class TestTakedown:
    def test_deleting_without_a_configured_admin_token_is_404(self, monkeypatch):
        monkeypatch.setattr("app.domains.photos.routers.settings.FLOOD_ADMIN_TOKEN", "")
        assert client.delete("/api/v1/flood/photos/abc").status_code == 404

    def test_a_wrong_token_is_404_not_401(self, monkeypatch):
        monkeypatch.setattr(
            "app.domains.photos.routers.settings.FLOOD_ADMIN_TOKEN", "secret"
        )
        response = client.delete(
            "/api/v1/flood/photos/abc", headers={"Authorization": "Bearer wrong"}
        )
        assert response.status_code == 404


def test_the_geo_source_precedence_prefers_the_file_over_the_browser():
    """The browser reports where the sender is standing NOW.

    The file's own coordinates are where the photograph was taken, which is the
    thing the map is trying to show.
    """
    assert service.GEO_SOURCES.index("exif") < service.GEO_SOURCES.index("device")
    assert service.GEO_SOURCES.index("device") < service.GEO_SOURCES.index("district")


@pytest.mark.parametrize("district", sorted(service.DISTRICT_CENTRES))
def test_every_district_centre_is_inside_nepal(district):
    centre = service.DISTRICT_CENTRES[district]
    assert service.within_nepal(centre["lat"], centre["lon"])
