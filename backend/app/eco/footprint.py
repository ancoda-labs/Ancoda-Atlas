"""Write event footprints and queue exposure computation."""

from __future__ import annotations

import math
import os
from datetime import datetime, timezone
from typing import Any

from app.domains.flood.scope import CORRIDOR_BBOX
from app.eco import store

# GLIDE for the Rasuwa–Bhotekoshi flood desk (Copernicus EMSR927).
DEFAULT_EVENT_ID = os.getenv("ECO_EVENT_ID") or "FF-2026-000162-NPL"
DEFAULT_BUFFER_RADIUS_KM = float(os.getenv("ECO_BUFFER_RADIUS_KM") or "18")


def _corridor_buffer() -> dict[str, float]:
    lat = (CORRIDOR_BBOX.min_lat + CORRIDOR_BBOX.max_lat) / 2
    lon = (CORRIDOR_BBOX.min_lon + CORRIDOR_BBOX.max_lon) / 2
    lat_span = CORRIDOR_BBOX.max_lat - CORRIDOR_BBOX.min_lat
    lon_span = CORRIDOR_BBOX.max_lon - CORRIDOR_BBOX.min_lon
    lat_km = lat_span * 111.0
    lon_km = lon_span * 111.0 * math.cos(math.radians(lat))
    radius_km = max(DEFAULT_BUFFER_RADIUS_KM, math.hypot(lat_km, lon_km) / 2)
    return {"lat": lat, "lon": lon, "radiusKm": round(radius_km, 2)}


def persist_buffer_footprint(event_id: str = DEFAULT_EVENT_ID) -> dict[str, Any]:
    """Persist a corridor-centre buffer footprint unless a polygon is already stored."""
    existing = store.read_footprint(event_id)
    if existing and existing.get("source") == "polygon":
        return existing

    buffer = _corridor_buffer()
    record = {
        "eventId": event_id,
        "source": "buffer_estimate",
        "geojson": None,
        **buffer,
        "writtenAt": datetime.now(timezone.utc).isoformat(),
    }
    store.write_footprint(event_id, record)
    return record


def persist_polygon_footprint(event_id: str, geojson: dict[str, Any]) -> dict[str, Any]:
    record = {
        "eventId": event_id,
        "source": "polygon",
        "geojson": geojson,
        "lat": None,
        "lon": None,
        "radiusKm": None,
        "writtenAt": datetime.now(timezone.utc).isoformat(),
    }
    store.write_footprint(event_id, record)
    return record
