"""Object storage is optional too, and its keys stay browsable."""

import re

import pytest

from app.core.exceptions import ServiceUnavailableError
from app.core.storage import _split_endpoint, client, is_storage_configured, photo_key


def _unconfigure(monkeypatch):
    monkeypatch.setattr("app.core.storage.settings.MINIO_ENDPOINT", "")
    monkeypatch.setattr("app.core.storage.settings.MINIO_ROOT_USER", "")
    monkeypatch.setattr("app.core.storage.settings.MINIO_ROOT_PASSWORD", "")
    monkeypatch.setattr("app.core.storage._client", None)


def test_storage_is_off_without_all_three_credentials(monkeypatch):
    _unconfigure(monkeypatch)
    assert is_storage_configured() is False


def test_a_partial_configuration_is_not_configured(monkeypatch):
    """An endpoint with no credentials would fail at upload time instead.

    Better for the photo sections to hide themselves than to offer a form that
    cannot succeed.
    """
    monkeypatch.setattr("app.core.storage.settings.MINIO_ENDPOINT", "minio:9000")
    monkeypatch.setattr("app.core.storage.settings.MINIO_ROOT_USER", "")
    monkeypatch.setattr("app.core.storage.settings.MINIO_ROOT_PASSWORD", "")
    assert is_storage_configured() is False


def test_client_raises_a_503_when_unconfigured(monkeypatch):
    _unconfigure(monkeypatch)
    with pytest.raises(ServiceUnavailableError) as caught:
        client()
    assert caught.value.status_code == 503
    assert caught.value.details["reason"] == "storage_not_configured"


class TestSplitEndpoint:
    """The JS SDK took host and port apart; the Python one wants them together."""

    def test_a_bare_host_port_is_unchanged(self):
        assert _split_endpoint("minio:9000") == "minio:9000"

    def test_a_scheme_is_stripped(self):
        assert _split_endpoint("https://storage.ancodalabs.com") == "storage.ancodalabs.com"
        assert _split_endpoint("http://minio:9000") == "minio:9000"

    def test_a_trailing_slash_is_stripped(self):
        assert _split_endpoint("https://storage.ancodalabs.com/") == "storage.ancodalabs.com"


def test_photo_key_is_partitioned_by_day():
    """Keys stay browsable: one day's ground reports sit together."""
    key = photo_key("abc-123", "jpg")
    assert re.fullmatch(r"flood-photos/\d{4}-\d{2}-\d{2}/abc-123\.jpg", key)
