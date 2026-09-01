"""The database is optional, and the timestamp shapes match the frontend's."""

import pytest

from app.core.exceptions import ServiceUnavailableError
from app.core.supabase import get_db, is_db_configured, iso_timestamp, require_db


async def test_get_db_returns_none_when_unconfigured(monkeypatch):
    """The whole point of the module: no database is a valid state.

    Atlas's hazard monitoring must run on a box with nothing configured, so an
    absent connection answers None rather than raising.
    """
    monkeypatch.setattr("app.core.supabase.settings.NEXT_PUBLIC_SUPABASE_URL", "")
    monkeypatch.setattr("app.core.supabase.settings.SUPABASE_URL", "")
    monkeypatch.setattr("app.core.supabase.settings.SUPABASE_SECRET_KEY", "")
    monkeypatch.setattr("app.core.supabase.settings.SUPABASE_SERVICE_ROLE_KEY", "")

    assert is_db_configured() is False
    assert await get_db() is None


async def test_require_db_raises_a_503_not_a_500(monkeypatch):
    """A feature that needs the database must degrade, not crash the page."""
    monkeypatch.setattr("app.core.supabase.settings.NEXT_PUBLIC_SUPABASE_URL", "")
    monkeypatch.setattr("app.core.supabase.settings.SUPABASE_URL", "")
    monkeypatch.setattr("app.core.supabase.settings.SUPABASE_SECRET_KEY", "")
    monkeypatch.setattr("app.core.supabase.settings.SUPABASE_SERVICE_ROLE_KEY", "")

    with pytest.raises(ServiceUnavailableError) as caught:
        await require_db()
    assert caught.value.status_code == 503
    assert caught.value.details["reason"] == "database_not_configured"


def test_a_publishable_key_alone_does_not_count_as_configured(monkeypatch):
    """RLS is on with no policies, so the browser-facing key reads nothing.

    Treating it as a working connection would produce empty results that look
    like "no photos" rather than "misconfigured".
    """
    monkeypatch.setattr("app.core.supabase.settings.NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co")
    monkeypatch.setattr("app.core.supabase.settings.SUPABASE_SECRET_KEY", "")
    monkeypatch.setattr("app.core.supabase.settings.SUPABASE_SERVICE_ROLE_KEY", "")
    assert is_db_configured() is False


class TestIsoTimestamp:
    """PostgREST and the frontend disagree on how to write the same instant."""

    def test_postgrest_offset_becomes_a_z_suffix(self):
        assert iso_timestamp("2026-08-28T09:40:00+00:00") == "2026-08-28T09:40:00.000Z"

    def test_a_non_utc_offset_is_converted_not_relabelled(self):
        # Kathmandu is +05:45. The instant must survive, not the wall clock.
        assert iso_timestamp("2026-08-28T15:25:00+05:45") == "2026-08-28T09:40:00.000Z"

    def test_milliseconds_are_kept(self):
        assert iso_timestamp("2026-08-28T09:40:00.123456+00:00") == "2026-08-28T09:40:00.123Z"

    def test_a_naive_timestamp_reads_as_utc(self):
        assert iso_timestamp("2026-08-28T09:40:00") == "2026-08-28T09:40:00.000Z"

    def test_none_and_empty_stay_none(self):
        assert iso_timestamp(None) is None
        assert iso_timestamp("") is None

    def test_an_unparseable_value_survives_unchanged(self):
        """A timestamp Atlas cannot read is still one a human can."""
        assert iso_timestamp("not a date") == "not a date"
