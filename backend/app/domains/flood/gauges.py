"""River gauges on the flood's path, from the Government of Nepal BIPAD Portal.

The corridor runs upstream to downstream: the Bhotekoshi from the Tibet border
through Rasuwa, into the Trishuli, down to the Narayani at Devghat.
"""

import time
from typing import Any, NamedTuple

from app.core.http import is_error, now_iso, safe_fetch
from app.core.logging import get_logger
from app.domains.flood.content import district_at

log = get_logger(__name__)

BIPAD_RIVER_URL = "https://bipadportal.gov.np/api/v1/river-stations/?limit=500"
BIPAD_TIMEOUT_S = 20.0
BIPAD_HEADERS = {
    "Accept": "application/json",
    "User-Agent": "AncodaAtlas/4.0 (Nepal hazard monitoring)",
}

# A reading older than this is shown as stale rather than as current. Most
# corridor gauges report every 10 minutes; some have been offline for years,
# and presenting a 2021 water level as "now" would be worse than showing none.
STALE_AFTER_MINUTES = 180

# BIPAD occasionally emits sensor spikes — one station reports 100008 m. A
# reading this far above the danger mark is instrument error, not a flood.
SPIKE_MULTIPLE = 20


class Station(NamedTuple):
    match: str
    label: str
    label_ne: str
    district: str
    district_ne: str


# Matched on the station title BIPAD publishes. The district here is a fallback
# only — see district_at() in content.py.
CORRIDOR_STATIONS = [
    Station("Bhotekoshi at Rasuwagadi", "Bhotekoshi at Rasuwagadhi", "भोटेकोशी, रसुवागढी", "Rasuwa", "रसुवा"),
    Station("Bhote Koshi at Shyaprubesi", "Bhotekoshi at Syaphrubesi", "भोटेकोशी, स्याफ्रुबेंसी", "Rasuwa", "रसुवा"),
    Station("Langtang Khola at Shyaprubesi", "Langtang Khola", "लाङटाङ खोला", "Rasuwa", "रसुवा"),
    Station("Trishuli Khola at Dhunche", "Trishuli at Dhunche", "त्रिशूली, धुन्चे", "Rasuwa", "रसुवा"),
    Station("Trishuli at Betrawati", "Trishuli at Betrawati", "त्रिशूली, बेत्रावती", "Nuwakot", "नुवाकोट"),
    Station("Phalakhu Khola at Betrawati", "Phalakhu Khola", "फलाँखु खोला", "Nuwakot", "नुवाकोट"),
    Station("Tadi at Belkot", "Tadi Khola at Belkot", "तादी खोला, बेल्कोट", "Nuwakot", "नुवाकोट"),
    Station("Trishuli River at Bhorle", "Trishuli at Bhorle", "त्रिशूली, भोर्ले", "Nuwakot", "नुवाकोट"),
    Station("Trishuli at Furke Khola", "Trishuli at Malekhu", "त्रिशूली, मलेखु", "Dhading", "धादिङ"),
    Station("Trishuli River at Kali Khola", "Trishuli at Kali Khola", "त्रिशूली, कालीखोला", "Dhading", "धादिङ"),
    Station("Ankhu Khola at Ankhu Bagar", "Ankhu Khola", "आँखु खोला", "Dhading", "धादिङ"),
    Station("Budhi Gandaki at Aarughat", "Budhi Gandaki at Arughat", "बूढीगण्डकी, आरुघाट", "Gorkha", "गोरखा"),
    Station("Narayani at Devghat", "Narayani at Devghat", "नारायणी, देवघाट", "Chitwan", "चितवन"),
    Station("Narayani River at Narayanghat", "Narayani at Narayanghat", "नारायणी, नारायणघाट", "Chitwan", "चितवन"),
]


def classify(
    water_level: float | None, warning: float | None, danger: float | None
) -> str:
    """A gauge with no thresholds published is 'unknown', never 'normal'.

    Calling an unmeasurable station normal is the one wrong answer here.
    """
    if water_level is None:
        return "unknown"
    if danger is not None and water_level >= danger:
        return "danger"
    if warning is not None and water_level >= warning:
        return "warning"
    if warning is None and danger is None:
        return "unknown"
    return "normal"


def _age_minutes(measured_at: str | None) -> int | None:
    if not measured_at:
        return None
    from datetime import datetime, timezone

    try:
        moment = datetime.fromisoformat(measured_at.replace("Z", "+00:00"))
    except ValueError:
        return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    delta = (datetime.now(timezone.utc) - moment).total_seconds() / 60
    return max(0, round(delta))


def _num(value: Any) -> float | None:
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def _percent_of_danger(
    water_level: float | None, warning: float | None, danger: float | None
) -> int | None:
    """How close to the danger mark, as a percentage, capped at 140.

    Falls back to 90% of the warning mark when no danger level is published, so
    a station with only a warning threshold still shows a bar.
    """
    if water_level is None:
        return None
    if danger and danger > 0:
        return max(0, min(140, round((water_level / danger) * 100)))
    if warning and warning > 0:
        return max(0, min(140, round((water_level / warning) * 90)))
    return None


def build_gauge(spec: Station, station: dict[str, Any]) -> dict[str, Any]:
    measured_at = station.get("waterLevelOn") or None
    age = _age_minutes(measured_at)
    stale = age is None or age > STALE_AFTER_MINUTES

    water_level = _num(station.get("waterLevel"))
    warning_level = _num(station.get("warningLevel"))
    danger_level = _num(station.get("dangerLevel"))

    ceiling = (danger_level or warning_level or 0) * SPIKE_MULTIPLE
    if water_level is not None and ceiling > 0 and water_level > ceiling:
        water_level = None

    level = "unknown" if stale else classify(water_level, warning_level, danger_level)

    coords = (station.get("point") or {}).get("coordinates")
    lat = coords[1] if isinstance(coords, list) and len(coords) > 1 else None
    lon = coords[0] if isinstance(coords, list) and len(coords) > 0 else None

    # Derived from the coordinate, so the label always agrees with the pin. The
    # curated value stands in only for a station outside every shape.
    place = district_at(lat, lon)

    return {
        "id": station.get("id"),
        "label": spec.label,
        "labelNe": spec.label_ne,
        "district": (place or {}).get("en") or spec.district,
        "districtNe": (place or {}).get("ne") or spec.district_ne,
        "waterLevel": water_level,
        "warningLevel": warning_level,
        "dangerLevel": danger_level,
        "level": level,
        "trend": station.get("steady") or None,
        "measuredAt": measured_at,
        "ageMinutes": age,
        "stale": stale,
        "percentOfDanger": _percent_of_danger(water_level, warning_level, danger_level),
        "lat": lat,
        "lon": lon,
        "photo": f"/api/flood/station-photo?id={station.get('id')}"
        if station.get("image")
        else None,
    }


async def fetch_corridor_gauges() -> dict[str, Any]:
    fetched_at = now_iso()
    data = await safe_fetch(
        BIPAD_RIVER_URL, timeout=BIPAD_TIMEOUT_S, headers=BIPAD_HEADERS, retries=0
    )
    if is_error(data) or not isinstance(data, dict):
        message = data.error if is_error(data) else "BIPAD returned an unexpected shape"
        log.warning("bipad_gauges_unavailable", error=message)
        # Empty with an honest error, never a substituted reading.
        return {"gauges": [], "error": message, "fetchedAt": fetched_at}

    results = data.get("results")
    results = results if isinstance(results, list) else []

    gauges = []
    for spec in CORRIDOR_STATIONS:
        needle = spec.match.lower()
        station = next(
            (r for r in results if needle in str(r.get("title") or "").lower()), None
        )
        if station:
            gauges.append(build_gauge(spec, station))

    return {"gauges": gauges, "error": None, "fetchedAt": fetched_at}


# ─── Station photos ──────────────────────────────────────────────────────────
#
# Static site pictures that change at most when DHM re-photographs a gauge, so
# the id -> URL map is cached for an hour. Without this, rendering fourteen
# gauge photos meant fourteen full 500-station fetches from BIPAD.

PHOTO_MAP_TTL_S = 60 * 60
_photo_map: dict[int, str] | None = None
_photo_map_at: float = 0.0


async def _load_photo_map() -> dict[int, str]:
    global _photo_map, _photo_map_at
    data = await safe_fetch(
        BIPAD_RIVER_URL, timeout=BIPAD_TIMEOUT_S, headers=BIPAD_HEADERS, retries=0
    )
    if is_error(data) or not isinstance(data, dict):
        raise RuntimeError("BIPAD station list unavailable")

    urls = {
        r["id"]: r["image"]
        for r in (data.get("results") or [])
        if r.get("id") is not None and r.get("image")
    }
    _photo_map, _photo_map_at = urls, time.monotonic()
    return urls


async def resolve_station_photo_url(station_id: int) -> str | None:
    """One station's upstream photo URL, for the proxy route."""
    if _photo_map is not None and (time.monotonic() - _photo_map_at) < PHOTO_MAP_TTL_S:
        return _photo_map.get(station_id)
    try:
        urls = await _load_photo_map()
        return urls.get(station_id)
    except Exception:  # noqa: BLE001
        # Fall back to a stale map rather than dropping every photo on one blip.
        return (_photo_map or {}).get(station_id)
