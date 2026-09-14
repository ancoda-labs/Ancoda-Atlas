"""Ecosystem exposure API."""

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.core import runs_store
from app.eco import store
from app.eco.models import EcosystemExposure, ProtectedAreaOverlap
from app.main import app

EVENT_ID = "FF-2026-000162-NPL"


@pytest.fixture(autouse=True)
def isolated_runs(tmp_path, monkeypatch):
    monkeypatch.setattr("app.core.runs_store.settings.ATLAS_RUNS_DIR", str(tmp_path))
    monkeypatch.setattr(type(runs_store.settings), "runs_dir", property(lambda self: tmp_path))
    return tmp_path


def test_exposure_route_returns_204_when_not_computed():
    client = TestClient(app)
    response = client.get(f"/api/v1/events/{EVENT_ID}/ecosystem-exposure")
    assert response.status_code == 204


def test_exposure_route_returns_cached_payload():
    exposure = EcosystemExposure(
        footprint_source="buffer_estimate",
        protected_areas=[
            ProtectedAreaOverlap(
                name="Test PA",
                designation="National Park",
                overlap_km2=1.5,
                pct_of_pa=2.0,
            )
        ],
        landcover_breakdown=[],
        ramsar_sites=[],
        layer_vintages={"protected_areas": 2020},
        computed_at=datetime(2026, 9, 14, tzinfo=timezone.utc),
    )
    store.write_exposure(EVENT_ID, exposure)

    client = TestClient(app)
    body = client.get(f"/api/v1/events/{EVENT_ID}/ecosystem-exposure").json()
    assert body["footprintSource"] == "buffer_estimate"
    assert body["protectedAreas"][0]["name"] == "Test PA"
