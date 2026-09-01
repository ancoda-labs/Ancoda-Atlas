"""The dashboard routes, and the empty state they serve before a sweep."""

from fastapi.testclient import TestClient

from app.core import runs_store
from app.main import app

client = TestClient(app)


def test_data_serves_the_empty_skeleton_before_the_first_sweep(tmp_path, monkeypatch):
    """Zeros, not absence — and never anything that reads as a measurement."""
    monkeypatch.setattr(type(runs_store.settings), "runs_dir", property(lambda self: tmp_path))
    response = client.get("/api/v1/data")
    assert response.status_code == 200
    body = response.json()
    assert body["meta"]["sourcesOk"] == 0
    assert body["seismic"]["maxMagnitude"] is None
    assert body["ideas"] == []
    assert body["ideasSource"] == "disabled"


def test_the_empty_skeleton_is_never_cached(tmp_path, monkeypatch):
    """A deployment that later gains a source must not keep serving zeros."""
    monkeypatch.setattr(type(runs_store.settings), "runs_dir", property(lambda self: tmp_path))
    response = client.get("/api/v1/data")
    assert "no-store" in response.headers["cache-control"]


def test_a_real_snapshot_is_cacheable(tmp_path, monkeypatch):
    monkeypatch.setattr(type(runs_store.settings), "runs_dir", property(lambda self: tmp_path))
    runs_store.write_json(
        runs_store.DASHBOARD,
        {"meta": {"sourcesOk": 5, "timestamp": "2026-08-31T12:00:00.000Z"}, "news": []},
    )
    response = client.get("/api/v1/data")
    assert response.json()["meta"]["sourcesOk"] == 5
    assert "s-maxage" in response.headers["cache-control"]


def test_news_serves_ranked_topics_from_the_cache(monkeypatch):
    """The wire moved off the sweep and onto the warm topic cache.

    /data still carries the sweep's own geo-tagged `news` array — that is the
    set the map plots. These are the ranked per-topic panels, which are a
    different thing and are cached separately.
    """

    async def fake_topic(topic, window, limit, source_cap):
        return {"topic": topic, "window": window, "mode": "normal", "count": 1, "items": []}

    monkeypatch.setattr("app.domains.hazards.routers.load_topic_news", fake_topic)
    body = client.get("/api/v1/news?topic=flood&window=24h").json()
    assert body["topic"] == "flood"
    assert body["count"] == 1


def test_news_bundle_returns_every_panel(monkeypatch):
    """One payload rather than eight routes: eight round trips on a
    high-latency mobile connection each pay 200-400ms before any RSS work."""

    async def fake_bundle(window):
        return {"window": window, "timestamp": "t", "topics": {"all": {}, "flood": {}}}

    monkeypatch.setattr("app.domains.hazards.routers.load_news_bundle", fake_bundle)
    body = client.get("/api/v1/news?bundle=true").json()
    assert set(body["topics"]) == {"all", "flood"}


def test_the_sweep_still_carries_the_geo_tagged_news_the_map_plots(tmp_path, monkeypatch):
    monkeypatch.setattr(type(runs_store.settings), "runs_dir", property(lambda self: tmp_path))
    runs_store.write_json(
        runs_store.DASHBOARD,
        {
            "meta": {"sourcesOk": 5, "timestamp": "2026-08-31T12:00:00.000Z"},
            "news": [{"title": "Flood in Rasuwa", "lat": 28.1, "lon": 85.3}],
        },
    )
    body = client.get("/api/v1/data").json()
    assert body["news"][0]["lat"] == 28.1


def test_bipad_serves_telemetry_payload(monkeypatch):
    async def fake_bipad():
        return {
            "riverStations": [{"id": 1, "title": "Koshi at Chatara"}],
            "rainStations": [{"id": 2, "title": "Kathmandu Airport"}],
            "alerts": [{"id": 3, "title": "Heavy Rain"}],
            "incidents": [{"id": 4, "title": "Landslide in Rasuwa"}],
            "earthquakes": [{"id": 5, "magnitude": 4.2}],
        }

    monkeypatch.setattr(
        "app.domains.hazards.routers.bipad_telemetry.get_bipad_telemetry", fake_bipad
    )
    response = client.get("/api/v1/bipad")
    assert response.status_code == 200
    body = response.json()
    assert "riverStations" in body
    assert "rainStations" in body
    assert "alerts" in body
    assert "incidents" in body
    assert "earthquakes" in body
    assert body["riverStations"][0]["title"] == "Koshi at Chatara"


def test_the_news_ledger_is_a_csv_a_sheet_can_pull(tmp_path, monkeypatch):
    """Issue #37: Google Sheets IMPORTDATA needs a CSV URL, not JSON."""
    monkeypatch.setattr(type(runs_store.settings), "runs_dir", property(lambda self: tmp_path))
    monkeypatch.setattr("app.domains.news.ledger._seen", None)
    from app.domains.news import ledger

    ledger.record_wire_bundle(
        {
            "topics": {
                "flood": {
                    "items": [
                        {
                            "title": "Bhotekoshi bursts its banks",
                            "link": "https://kp/ledger",
                            "source": "Kathmandu Post",
                            "pubDate": "2026-09-01T10:00:00.000Z",
                        }
                    ]
                }
            }
        }
    )
    response = client.get("/api/v1/news/ledger.csv")
    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]
    body = response.text
    assert "Bhotekoshi bursts its banks" in body
    assert "title" in body.splitlines()[0]
    assert "sentiment" not in body.splitlines()[0]
    assert "attachment" in response.headers.get("content-disposition", "")


def test_an_empty_ledger_still_answers_column_names(tmp_path, monkeypatch):
    """A sheet pulling this before the first cycle gets a table, not an error."""
    monkeypatch.setattr(type(runs_store.settings), "runs_dir", property(lambda self: tmp_path))
    monkeypatch.setattr("app.domains.news.ledger._seen", None)
    response = client.get("/api/v1/news/ledger.csv")
    assert response.status_code == 200
    assert response.text.strip().split(",")[0] == "id"
    assert response.text.strip().split(",")[1] == "title"
