"""USGS Earthquake Catalog — Nepal and the Main Himalayan Thrust.

Free, no key. Nepal sits on the collision boundary that produced the 2015
Gorkha earthquake, so this is the highest-consequence feed in the stack.

Runnable alone:  python -m app.domains.hazards.sources.seismic
"""

import math
from datetime import datetime, timezone
from typing import Any

from app.core.http import days_ago, is_error, now_iso, safe_fetch
from app.core.nepal import CITIES, PROVINCES, SEISMIC_BBOX, province_of

BASE = "https://earthquake.usgs.gov/fdsnws/event/1/query"

EARTH_RADIUS_KM = 6371


async def get_quakes(days: int = 30, min_magnitude: float = 2.5) -> Any:
    return await safe_fetch(
        BASE,
        timeout=20.0,
        params={
            "format": "geojson",
            "starttime": days_ago(days),
            "minlatitude": SEISMIC_BBOX.lamin,
            "maxlatitude": SEISMIC_BBOX.lamax,
            "minlongitude": SEISMIC_BBOX.lomin,
            "maxlongitude": SEISMIC_BBOX.lomax,
            "minmagnitude": min_magnitude,
            "orderby": "time",
        },
    )


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2) ** 2
    )
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def _nearest_city(lat: float, lon: float) -> dict[str, Any] | None:
    best: dict[str, Any] | None = None
    for city in CITIES.values():
        km = _haversine_km(lat, lon, city.lat, city.lon)
        if best is None or km < best["km"]:
            best = {"label": city.label, "km": round(km)}
    return best


def _compact(feature: dict[str, Any]) -> dict[str, Any]:
    coords = (feature.get("geometry") or {}).get("coordinates") or []
    lon = coords[0] if len(coords) > 0 else None
    lat = coords[1] if len(coords) > 1 else None
    depth = coords[2] if len(coords) > 2 else None
    props = feature.get("properties") or {}

    time_ms = props.get("time")
    when = None
    if time_ms:
        moment = datetime.fromtimestamp(time_ms / 1000, tz=timezone.utc)
        when = f"{moment:%Y-%m-%dT%H:%M:%S}.{moment.microsecond // 1000:03d}Z"

    nearest = (
        _nearest_city(lat, lon)
        if isinstance(lat, (int, float)) and isinstance(lon, (int, float))
        else None
    )
    return {
        "id": feature.get("id"),
        "mag": props.get("mag"),
        "place": props.get("place"),
        "time": when,
        "lat": lat,
        "lon": lon,
        "depthKm": depth,
        "province": province_of(lat, lon),
        "nearest": nearest,
        "felt": props.get("felt") or 0,
        "tsunami": bool(props.get("tsunami")),
        "url": props.get("url"),
    }


def _age_ms(iso: str | None) -> float:
    if not iso:
        return float("inf")
    try:
        moment = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        return float("inf")
    return (datetime.now(timezone.utc) - moment).total_seconds() * 1000


async def briefing() -> dict[str, Any]:
    data = await get_quakes(days=30, min_magnitude=2.5)

    if is_error(data):
        return {"source": "Seismic", "timestamp": now_iso(), "error": data.error}

    features = data.get("features") or [] if isinstance(data, dict) else []
    quakes = [q for q in (_compact(f) for f in features) if q["mag"] is not None]

    last_24h = [q for q in quakes if _age_ms(q["time"]) < 86_400_000]
    last_7d = [q for q in quakes if _age_ms(q["time"]) < 7 * 86_400_000]

    by_province: dict[str, int] = {}
    for q in quakes:
        if not q["province"]:
            continue
        label = PROVINCES[q["province"]].label
        by_province[label] = by_province.get(label, 0) + 1

    strongest = max(quakes, key=lambda q: q["mag"], default=None)
    significant = [q for q in quakes if q["mag"] >= 4.5][:15]

    # Shallow quakes do far more damage than deep ones at the same magnitude.
    shallow_strong = [
        q
        for q in quakes
        if q["mag"] >= 4.0 and q["depthKm"] is not None and q["depthKm"] < 35
    ]

    signals: list[str] = []
    if strongest and strongest["mag"] >= 5.0:
        signals.append(f"M{strongest['mag']} earthquake — {strongest['place']}")
    if len(last_24h) >= 5:
        signals.append(f"{len(last_24h)} quakes in 24h — elevated seismic sequence")
    if len(shallow_strong) >= 3:
        signals.append(
            f"{len(shallow_strong)} shallow M4+ events (<35km) — "
            "higher surface damage potential"
        )
    if any(q["mag"] >= 6.0 for q in last_7d):
        signals.append(
            "M6+ event this week — expect aftershock sequence and "
            "infrastructure damage reports"
        )

    return {
        "source": "Seismic",
        "timestamp": now_iso(),
        "window": "30d",
        "totalEvents": len(quakes),
        "events24h": len(last_24h),
        "events7d": len(last_7d),
        "maxMagnitude": strongest["mag"] if strongest else None,
        "strongest": strongest,
        "byProvince": by_province,
        "significant": significant,
        "recent": quakes[:25],
        "signals": signals,
    }


if __name__ == "__main__":
    import asyncio
    import json

    print(json.dumps(asyncio.run(briefing()), indent=2, ensure_ascii=False))
