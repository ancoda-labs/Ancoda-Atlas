"""Ecosystem exposure from local reference layers and an event footprint."""

from __future__ import annotations

import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

import geopandas as gpd
from shapely.geometry import Point, mapping, shape
from shapely.ops import transform as shapely_transform

from app.eco import layers
from app.eco.models import (
    EcosystemExposure,
    LandcoverBreakdown,
    ProtectedAreaOverlap,
    RamsarOverlap,
)

# Equal-area CRS for Nepal — Albers equal-area conic centred on the country.
# Area math must never run in EPSG:4326.
EQUAL_AREA_CRS = (
    '+proj=aea +lat_1=26 +lat_2=30 +lat_0=28 +lon_0=84 +datum=WGS84 +units=m +no_defs'
)
WGS84 = "EPSG:4326"
SQUARE_METRES_PER_KM2 = 1_000_000.0


def _km2_from_geoseries(geoms: gpd.GeoSeries) -> float:
    projected = geoms.to_crs(EQUAL_AREA_CRS)
    return float(projected.area.sum()) / SQUARE_METRES_PER_KM2


def _footprint_polygon(
    geojson: dict[str, Any] | None,
    *,
    lat: float | None,
    lon: float | None,
    radius_km: float | None,
) -> tuple[Any, Literal["polygon", "buffer_estimate"]]:
    if geojson is not None:
        geom = shape(geojson.get("geometry", geojson))
        if geom.is_empty:
            raise ValueError("footprint geometry is empty")
        return geom, "polygon"

    if lat is None or lon is None or radius_km is None:
        raise ValueError("footprint requires geojson or lat/lon/radius_km")

    # Geodesic buffer: sample a circle in WGS84, then project for area work.
    def _dest_point(start_lon: float, start_lat: float, bearing_deg: float, dist_m: float) -> tuple[float, float]:
        r = 6_371_000.0
        br = math.radians(bearing_deg)
        lat1 = math.radians(start_lat)
        lon1 = math.radians(start_lon)
        lat2 = math.asin(
            math.sin(lat1) * math.cos(dist_m / r)
            + math.cos(lat1) * math.sin(dist_m / r) * math.cos(br)
        )
        lon2 = lon1 + math.atan2(
            math.sin(br) * math.sin(dist_m / r) * math.cos(lat1),
            math.cos(dist_m / r) - math.sin(lat1) * math.sin(lat2),
        )
        return math.degrees(lon2), math.degrees(lat2)

    radius_m = radius_km * 1000.0
    ring: list[tuple[float, float]] = []
    for bearing in range(0, 360, 5):
        x, y = _dest_point(lon, lat, float(bearing), radius_m)
        ring.append((x, y))
    ring.append(ring[0])
    return shape({"type": "Polygon", "coordinates": [ring]}), "buffer_estimate"


def _read_geojson(path: Path) -> gpd.GeoDataFrame | None:
    if not path.is_file():
        return None
    frame = gpd.read_file(path)
    if frame.crs is None:
        frame = frame.set_crs(WGS84)
    elif frame.crs.to_string() != WGS84:
        frame = frame.to_crs(WGS84)
    return frame


def _overlap_rows(
    footprint: Any,
    layer: gpd.GeoDataFrame,
    *,
    name_key: str,
    designation_key: str | None = None,
) -> list[tuple[str, str | None, float, float]]:
    hits: list[tuple[str, str | None, float, float]] = []
    for _, row in layer.iterrows():
        intersection = footprint.intersection(row.geometry)
        if intersection.is_empty:
            continue
        overlap_km2 = _km2_from_geoseries(gpd.GeoSeries([intersection], crs=WGS84))
        if overlap_km2 <= 0:
            continue
        pa_total_km2 = _km2_from_geoseries(gpd.GeoSeries([row.geometry], crs=WGS84))
        pct = (overlap_km2 / pa_total_km2 * 100.0) if pa_total_km2 > 0 else 0.0
        name = str(row.get(name_key) or "—")
        designation = str(row.get(designation_key)) if designation_key and row.get(designation_key) else None
        hits.append((name, designation, overlap_km2, pct))
    hits.sort(key=lambda item: item[2], reverse=True)
    return hits


def _landcover_breakdown(footprint: Any) -> list[LandcoverBreakdown]:
    if not layers.LANDCOVER_TIF.is_file():
        return []

    import numpy as np
    import rasterio
    from rasterio.mask import mask as rio_mask

    with rasterio.open(layers.LANDCOVER_TIF) as dataset:
        geoms = [mapping(footprint)]
        clipped, affine = rio_mask(dataset, geoms, crop=True, filled=False)
        band = clipped[0]
        valid = band[~band.mask] if np.ma.is_masked(band) else band[band != dataset.nodata]
        if valid.size == 0:
            return []

        pixel_area_km2 = abs(affine.a * affine.e) / SQUARE_METRES_PER_KM2
        if dataset.crs and dataset.crs.to_string() != EQUAL_AREA_CRS:
            # Reproject pixel corners to equal-area for one reference pixel.
            from pyproj import Transformer

            transformer = Transformer.from_crs(dataset.crs, EQUAL_AREA_CRS, always_xy=True)
            corner0 = shapely_transform(transformer.transform, Point, affine * (0, 0))
            corner1 = shapely_transform(transformer.transform, Point, affine * (1, 1))
            pixel_area_km2 = abs(corner1.x - corner0.x) * abs(corner1.y - corner0.y) / SQUARE_METRES_PER_KM2

        values, counts = np.unique(valid, return_counts=True)
        rows: list[LandcoverBreakdown] = []
        for value, count in zip(values, counts, strict=True):
            class_name = str(int(value)) if np.issubdtype(type(value), np.integer) else str(value)
            rows.append(LandcoverBreakdown(class_name=class_name, area_km2=float(count) * pixel_area_km2))
        rows.sort(key=lambda item: item.area_km2, reverse=True)
        return rows


def compute_exposure(
    *,
    geojson: dict[str, Any] | None = None,
    lat: float | None = None,
    lon: float | None = None,
    radius_km: float | None = None,
) -> EcosystemExposure | None:
    """Return ecosystem exposure, or None when no reference layers are bundled."""
    if not layers.any_layer_present():
        return None

    footprint, source = _footprint_polygon(geojson, lat=lat, lon=lon, radius_km=radius_km)

    protected: list[ProtectedAreaOverlap] = []
    pa_layer = _read_geojson(layers.PROTECTED_AREAS)
    if pa_layer is not None:
        for name, designation, overlap_km2, pct in _overlap_rows(
            footprint, pa_layer, name_key="name", designation_key="designation"
        ):
            protected.append(
                ProtectedAreaOverlap(
                    name=name,
                    designation=designation or "—",
                    overlap_km2=round(overlap_km2, 4),
                    pct_of_pa=round(pct, 2),
                )
            )

    ramsar: list[RamsarOverlap] = []
    ramsar_layer = _read_geojson(layers.RAMSAR_SITES)
    if ramsar_layer is not None:
        for name, _, overlap_km2, _ in _overlap_rows(footprint, ramsar_layer, name_key="name"):
            ramsar.append(RamsarOverlap(name=name, overlap_km2=round(overlap_km2, 4)))

    landcover = _landcover_breakdown(footprint)

    return EcosystemExposure(
        footprint_source=source,
        protected_areas=protected,
        landcover_breakdown=landcover,
        ramsar_sites=ramsar,
        layer_vintages=layers.layer_vintages(),
        computed_at=datetime.now(timezone.utc),
    )


def compute_from_footprint_record(record: dict[str, Any]) -> EcosystemExposure | None:
    """Compute exposure from a runs/<event_id>/footprint.json payload."""
    geojson = record.get("geojson")
    return compute_exposure(
        geojson=geojson,
        lat=record.get("lat"),
        lon=record.get("lon"),
        radius_km=record.get("radiusKm") or record.get("radius_km"),
    )


def equal_area_crs() -> str:
    """The CRS used for area math — exposed for tests."""
    return EQUAL_AREA_CRS
