"""River gauges on the flood's path, from the Government of Nepal BIPAD Portal.

The corridor runs upstream to downstream: the Bhotekoshi from the Tibet border
through Rasuwa, into the Trishuli, down to the Narayani at Devghat.
"""

import asyncio
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
    id: int
    match: str
    label: str
    label_ne: str
    district: str
    district_ne: str


# Matched on the station title BIPAD publishes. The district here is a fallback
# only — see district_at() in content.py.
CORRIDOR_STATIONS = [
    Station(171, "Bhotekoshi at Rasuwagadi", "Bhotekoshi at Rasuwagadhi", "भोटेकोशी, रसुवागढी", "Rasuwa", "रसुवा"),
    Station(74, "Bhote Koshi at Shyaprubesi", "Bhotekoshi at Syaphrubesi", "भोटेकोशी, स्याफ्रुबेंसी", "Rasuwa", "रसुवा"),
    Station(49, "Langtang Khola at Shyaprubesi", "Langtang Khola", "लाङटाङ खोला", "Rasuwa", "रसुवा"),
    Station(105, "Trishuli Khola at Dhunche", "Trishuli at Dhunche", "त्रिशूली, धुन्चे", "Rasuwa", "रसुवा"),
    Station(137, "Trishuli at Betrawati", "Trishuli at Betrawati", "त्रिशूली, बेत्रावती", "Nuwakot", "नुवाकोट"),
    Station(79, "Phalakhu Khola at Betrawati", "Phalakhu Khola", "फलाँखु खोला", "Nuwakot", "नुवाकोट"),
    Station(135, "Tadi at Belkot", "Tadi Khola at Belkot", "तादी खोला, बेल्कोट", "Nuwakot", "नुवाकोट"),
    Station(35, "Trishuli River at Bhorle", "Trishuli at Bhorle", "त्रिशूली, भोर्ले", "Nuwakot", "नुवाकोट"),
    Station(261, "Trishuli at Furke Khola", "Trishuli at Malekhu", "त्रिशूली, मलेखु", "Dhading", "धादिङ"),
    Station(67, "Trishuli River at Kali Khola", "Trishuli at Kali Khola", "त्रिशूली, कालीखोला", "Dhading", "धादिङ"),
    Station(68, "Ankhu Khola at Ankhu Bagar", "Ankhu Khola", "आँखु खोला", "Dhading", "धादिङ"),
    Station(100, "Budhi Gandaki at Aarughat", "Budhi Gandaki at Arughat", "बूढीगण्डकी, आरुघाट", "Gorkha", "गोरखा"),
    Station(25, "Narayani at Devghat", "Narayani at Devghat", "नारायणी, देवघाट", "Chitwan", "चितवन"),
    Station(106, "Narayani River at Narayanghat", "Narayani at Narayanghat", "नारायणी, नारायणघाट", "Chitwan", "चितवन"),
]


class StationSite(NamedTuple):
    lat: float
    lon: float
    image: str


# DHM station portraits and BIPAD coordinates, as BIPAD published them.
#
# Water levels are never taken from here — only the pin and the site photo,
# which change when DHM re-photographs a gauge, not with the flood. This is
# what lets the corridor map draw itself when the live river-stations feed is
# unreachable: fourteen pins with an honest "no reading", rather than none.
CORRIDOR_STATION_SITES: dict[int, StationSite] = {
    171: StationSite(28.271297, 85.377649, "http://daq.hydrology.gov.np/images/83784301e1756ec67166ba592bcaec51"),
    74: StationSite(28.17065, 85.342554, "http://daq.hydrology.gov.np/images/765e2644b4ebca0d35110479c999a6f8"),
    49: StationSite(28.16222222, 85.34611111, "http://daq.hydrology.gov.np/images/9656ba736c6d3c61c56673d3e4c3b23a"),
    105: StationSite(28.098163, 85.318589, "http://daq.hydrology.gov.np/images/0a4d86552fd0e57c5ab02555b4dc693f"),
    137: StationSite(27.97, 85.18, "http://daq.hydrology.gov.np/images/3f8da446cb4c467cefcb57072396ca1f"),
    79: StationSite(27.974259, 85.185829, "http://daq.hydrology.gov.np/images/965582ba18e135375d97534971f0c506"),
    135: StationSite(27.860094, 85.134943, "http://daq.hydrology.gov.np/images/325da877378a7511354dba39e151ea7c"),
    35: StationSite(27.82, 84.45, "http://daq.hydrology.gov.np/images/73368683a6f7de9fb9558110f86350e9"),
    261: StationSite(27.802439, 84.844102, "http://daq.hydrology.gov.np/images/6bc210f963f5e2e3c424a74842e92fda"),
    67: StationSite(27.833, 84.546, "http://daq.hydrology.gov.np/images/364ef9a4cae0f2a57b48d88b42f579ff"),
    68: StationSite(28.000431, 84.889347, "http://daq.hydrology.gov.np/images/cf987cac6d1fe65d4a886347f3e4e760"),
    100: StationSite(28.046, 84.816, "http://daq.hydrology.gov.np/images/a5d962039af199e304760d743ab51419"),
    25: StationSite(27.71, 84.43, "http://daq.hydrology.gov.np/images/82f9703dad054cae6100809681272696"),
    106: StationSite(27.69971, 84.41894, "http://daq.hydrology.gov.np/images/074313bb1102dc050064f069fbf182c1"),
}


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


def photo_path(station_id: int, live_image: str | None = None) -> str | None:
    """The proxy path for a gauge portrait, or None when there is no photo.

    A corridor station always has one — its portrait is bundled above — so the
    photo survives a BIPAD outage even though the water level does not.
    """
    if live_image or station_id in CORRIDOR_STATION_SITES:
        return f"/api/flood/station-photo?id={station_id}"
    return None


def build_gauge(spec: Station, station: dict[str, Any] | None = None) -> dict[str, Any]:
    """One corridor gauge, with or without a live BIPAD reading.

    `station` is None when BIPAD did not answer or has no row matching this
    spec. The gauge is still built: the pin, the label and the site photo come
    from the bundled record, and every reading is None with `stale` set. A map
    of fourteen pins reading "no data" is the honest picture of an outage; an
    empty map looks like the corridor has no gauges at all.
    """
    station = station or {}
    site = CORRIDOR_STATION_SITES.get(spec.id)

    measured_at = station.get("waterLevelOn") or None
    age = _age_minutes(measured_at)
    stale = not station or age is None or age > STALE_AFTER_MINUTES

    water_level = _num(station.get("waterLevel"))
    warning_level = _num(station.get("warningLevel"))
    danger_level = _num(station.get("dangerLevel"))

    ceiling = (danger_level or warning_level or 0) * SPIKE_MULTIPLE
    if water_level is not None and ceiling > 0 and water_level > ceiling:
        water_level = None

    level = "unknown" if stale else classify(water_level, warning_level, danger_level)

    # BIPAD's own coordinate wins when it answered; otherwise the bundled one,
    # which is the same value BIPAD published when it was last reachable.
    lat = site.lat if site else None
    lon = site.lon if site else None
    coords = (station.get("point") or {}).get("coordinates")
    if isinstance(coords, list) and len(coords) >= 2:
        lon, lat = coords[0], coords[1]

    # Derived from the coordinate, so the label always agrees with the pin. The
    # curated value stands in only for a station outside every shape.
    place = district_at(lat, lon)

    return {
        "id": station.get("id") or spec.id,
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
        "photo": photo_path(spec.id, station.get("image")),
    }


async def fetch_corridor_gauges() -> dict[str, Any]:
    """Every corridor gauge, whether or not BIPAD answered.

    An outage costs the readings, not the corridor: `error` carries what went
    wrong and each gauge still draws from its bundled record with `stale` set.
    """
    fetched_at = now_iso()
    data = await safe_fetch(
        BIPAD_RIVER_URL, timeout=BIPAD_TIMEOUT_S, headers=BIPAD_HEADERS, retries=0
    )
    if is_error(data) or not isinstance(data, dict):
        message = data.error if is_error(data) else "BIPAD returned an unexpected shape"
        log.warning("bipad_gauges_unavailable", error=message)
        # Never a substituted reading — every level below is None and stale.
        return {
            "gauges": [build_gauge(spec) for spec in CORRIDOR_STATIONS],
            "error": message,
            "fetchedAt": fetched_at,
        }

    results = data.get("results")
    results = results if isinstance(results, list) else []

    gauges = []
    for spec in CORRIDOR_STATIONS:
        needle = spec.match.lower()
        station = next(
            (r for r in results if needle in str(r.get("title") or "").lower()), None
        )
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
_photo_map_lock = asyncio.Lock()


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


def _map_is_fresh() -> bool:
    return _photo_map is not None and (time.monotonic() - _photo_map_at) < PHOTO_MAP_TTL_S


async def resolve_station_photo_url(station_id: int) -> str | None:
    """One station's upstream photo URL, for the proxy route.

    A corridor portrait is answered from the bundled map without touching the
    network, so the fourteen gauge photos on the desk do not wait on BIPAD —
    and still render when it is unreachable. Anything else is looked up in the
    hourly station map.
    """
    site = CORRIDOR_STATION_SITES.get(station_id)
    if site:
        return site.image

    if _map_is_fresh():
        return (_photo_map or {}).get(station_id)

    # One fetch per expiry, not one per photo on the page.
    async with _photo_map_lock:
        if _map_is_fresh():
            return (_photo_map or {}).get(station_id)
        try:
            urls = await _load_photo_map()
            return urls.get(station_id)
        except Exception:  # noqa: BLE001
            # Fall back to a stale map rather than dropping every photo on one blip.
            return (_photo_map or {}).get(station_id)
