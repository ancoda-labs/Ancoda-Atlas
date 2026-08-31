"""The dashboard routes, and the empty state they serve before a sweep."""

from fastapi.testclient import TestClient

from app.core import runs_store
from app.main import app

client = TestClient(app)


def test_data_serves_the_empty_skeleton_before_the_first_sweep(tmp_path, monkeypatch):
    """Zeros, not absence — and never anything that reads as a measurement."""
    monkeypatch.setattr(
        type(runs_store.settings), "runs_dir", property(lambda self: tmp_path)
    )
    response = client.get("/api/v1/data")
    assert response.status_code == 200
    body = response.json()
    assert body["meta"]["sourcesOk"] == 0
    assert body["seismic"]["maxMagnitude"] is None
    assert body["ideas"] == []
    assert body["ideasSource"] == "disabled"


def test_the_empty_skeleton_is_never_cached(tmp_path, monkeypatch):
    """A deployment that later gains a source must not keep serving zeros."""
    monkeypatch.setattr(
        type(runs_store.settings), "runs_dir", property(lambda self: tmp_path)
    )
    response = client.get("/api/v1/data")
    assert "no-store" in response.headers["cache-control"]


def test_a_real_snapshot_is_cacheable(tmp_path, monkeypatch):
    monkeypatch.setattr(
        type(runs_store.settings), "runs_dir", property(lambda self: tmp_path)
    )
    runs_store.write_json(
        runs_store.DASHBOARD,
        {"meta": {"sourcesOk": 5, "timestamp": "2026-08-31T12:00:00.000Z"}, "news": []},
    )
    response = client.get("/api/v1/data")
    assert response.json()["meta"]["sourcesOk"] == 5
    assert "s-maxage" in response.headers["cache-control"]


def test_news_reads_off_the_sweep_rather_than_fetching(tmp_path, monkeypatch):
    """Eight RSS feeds per reader request is how a desk falls over."""
    monkeypatch.setattr(
        type(runs_store.settings), "runs_dir", property(lambda self: tmp_path)
    )
    runs_store.write_json(
        runs_store.DASHBOARD,
        {
            "meta": {"timestamp": "2026-08-31T12:00:00.000Z"},
            "news": [{"title": "Flood in Rasuwa"}],
            "newsFeed": [{"headline": "Flood in Rasuwa"}],
            "impact": {"count": 1, "topRegions": [], "headline": "Flood in Rasuwa"},
        },
    )
    body = client.get("/api/v1/news").json()
    assert len(body["news"]) == 1
    assert body["impact"]["count"] == 1
    assert body["generatedAt"] == "2026-08-31T12:00:00.000Z"


def test_news_before_a_sweep_is_empty_not_an_error(tmp_path, monkeypatch):
    monkeypatch.setattr(
        type(runs_store.settings), "runs_dir", property(lambda self: tmp_path)
    )
    body = client.get("/api/v1/news").json()
    assert body["news"] == []
    assert body["impact"]["count"] == 0
