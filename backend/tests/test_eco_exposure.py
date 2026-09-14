"""Ecosystem exposure computation."""

from pathlib import Path
from unittest.mock import patch

import geopandas as gpd
import pytest

from app.eco import exposure, layers
from app.eco.exposure import EQUAL_AREA_CRS

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "eco"
PA_FIXTURE = FIXTURES / "protected_area_sample.geojson"

FOOTPRINT_GEOJSON = {
    "type": "Feature",
    "geometry": {
        "type": "Polygon",
        "coordinates": [
            [
                [85.30, 28.10],
                [85.40, 28.10],
                [85.40, 28.15],
                [85.30, 28.15],
                [85.30, 28.10],
            ]
        ],
    },
}


@pytest.fixture
def with_pa_layer(monkeypatch):
    monkeypatch.setattr(layers, "PROTECTED_AREAS", PA_FIXTURE)
    monkeypatch.setattr(layers, "RAMSAR_SITES", layers.DATA_DIR / "missing_ramsar.geojson")
    monkeypatch.setattr(layers, "LANDCOVER_TIF", layers.DATA_DIR / "missing_landcover.tif")


def test_returns_none_when_no_layers_are_bundled(monkeypatch):
    monkeypatch.setattr(layers, "PROTECTED_AREAS", layers.DATA_DIR / "missing_pa.geojson")
    monkeypatch.setattr(layers, "RAMSAR_SITES", layers.DATA_DIR / "missing_ramsar.geojson")
    monkeypatch.setattr(layers, "LANDCOVER_TIF", layers.DATA_DIR / "missing_landcover.tif")
    assert layers.any_layer_present() is False
    assert exposure.compute_exposure(geojson=FOOTPRINT_GEOJSON) is None


def test_overlap_against_known_protected_area(with_pa_layer):
    result = exposure.compute_exposure(geojson=FOOTPRINT_GEOJSON)
    assert result is not None
    assert result.footprint_source == "polygon"
    assert len(result.protected_areas) == 1
    hit = result.protected_areas[0]
    assert hit.name == "Test Langtang Buffer Zone"
    assert hit.designation == "Buffer Zone"
    assert hit.overlap_km2 > 0
    assert 0 < hit.pct_of_pa <= 100


def test_area_math_uses_equal_area_crs_not_wgs84(with_pa_layer):
    captured: list[str] = []
    original_to_crs = gpd.GeoSeries.to_crs

    def _spy_to_crs(self, crs, *args, **kwargs):
        captured.append(str(crs))
        return original_to_crs(self, crs, *args, **kwargs)

    with patch.object(gpd.GeoSeries, "to_crs", _spy_to_crs):
        exposure.compute_exposure(geojson=FOOTPRINT_GEOJSON)

    assert captured, "expected at least one reprojection for area math"
    assert all("4326" not in crs for crs in captured)
    assert any(EQUAL_AREA_CRS in crs or "aea" in crs for crs in captured)


def test_buffer_estimate_source(with_pa_layer):
    result = exposure.compute_exposure(lat=28.12, lon=85.35, radius_km=5.0)
    assert result is not None
    assert result.footprint_source == "buffer_estimate"


def test_equal_area_constant_is_not_geographic():
    assert exposure.equal_area_crs() != "EPSG:4326"
    assert "aea" in exposure.equal_area_crs()
