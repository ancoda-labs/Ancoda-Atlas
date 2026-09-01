"""NASA FIRMS — active fires and thermal anomalies over Nepal.

Detects fires within roughly three hours of a satellite pass, scoped to the
seven provinces. Nepal's forest fire season runs roughly March to May, when
pre-monsoon dryness combines with agricultural burning — and that smoke drives
the Kathmandu valley's spring air quality collapse.

Needs FIRMS_MAP_KEY. Without it this reports status 'no_key' and the wildfire
panel is empty, which is the correct degraded state.

Runnable alone:  python -m app.domains.hazards.sources.firms
"""

import asyncio
import csv
import io
from datetime import datetime, timezone
from typing import Any

from app.core.config import settings
from app.core.http import is_error, now_iso, safe_fetch
from app.core.nepal import PROVINCES

FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
DEFAULT_SOURCE = "VIIRS_SNPP_NRT"

# FIRMS wants west/south/east/north; the province table stores
# lamin/lomin/lamax/lomax. Translate once, here.
HOTSPOTS = {
    key: {
        "west": p.lomin,
        "south": p.lamin,
        "east": p.lomax,
        "north": p.lamax,
        "label": p.label,
    }
    for key, p in PROVINCES.items()
}


def parse_csv(raw: str) -> list[dict[str, str]]:
    """FIRMS answers CSV, not JSON."""
    if not raw or not isinstance(raw, str):
        return []
    rows = list(csv.DictReader(io.StringIO(raw.strip())))
    return [{(k or "").strip(): (v or "").strip() for k, v in row.items()} for row in rows]


def _as_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


async def fetch_fires(
    west: float, south: float, east: float, north: float, days: int = 1
) -> Any:
    key = settings.FIRMS_MAP_KEY
    if not key:
        return {"error": "No FIRMS_MAP_KEY"}

    url = f"{FIRMS_BASE}/{key}/{DEFAULT_SOURCE}/{west},{south},{east},{north}/{days}"
    result = await safe_fetch(url, timeout=25.0, retries=0, as_="text")
    if is_error(result):
        return {"error": result.error}
    return parse_csv(result)


def analyze_fires(fires: list[dict[str, str]], region_label: str) -> dict[str, Any]:
    if not fires:
        return {
            "region": region_label,
            "totalDetections": 0,
            "highConfidence": 0,
            "highIntensity": [],
            "summary": "No detections",
        }

    high_conf = [f for f in fires if f.get("confidence") in ("h", "high")]
    nominal_conf = [f for f in fires if f.get("confidence") in ("n", "nominal")]

    # FRP > 10 MW: large forest fires or industrial blazes, rather than the
    # small agricultural burns that dominate raw detection counts.
    high_intensity = sorted(
        (
            {
                "lat": _as_float(f.get("latitude")),
                "lon": _as_float(f.get("longitude")),
                "brightness": _as_float(f.get("bright_ti4")),
                "frp": _as_float(f.get("frp")),
                "date": f.get("acq_date"),
                "time": f.get("acq_time"),
                "confidence": f.get("confidence"),
                "daynight": f.get("daynight"),
            }
            for f in fires
            if (_as_float(f.get("frp")) or 0) > 10
        ),
        key=lambda f: f["frp"] or 0,
        reverse=True,
    )[:15]

    # Night detections matter most: crop-residue and pasture burning happens in
    # daylight, so a night signature usually means a fire nobody put out.
    night_fires = [f for f in fires if f.get("daynight") == "N"]

    return {
        "region": region_label,
        "totalDetections": len(fires),
        "highConfidence": len(high_conf),
        "nominalConfidence": len(nominal_conf),
        "nightDetections": len(night_fires),
        "highIntensity": high_intensity,
        "avgFRP": sum(_as_float(f.get("frp")) or 0 for f in fires) / len(fires),
    }


def is_fire_season(when: datetime | None = None) -> bool:
    """Pre-monsoon, March to May, is when Nepal's fire season peaks."""
    month = (when or datetime.now(timezone.utc)).month
    return 3 <= month <= 5


async def _for_region(key: str, box: dict[str, Any]) -> dict[str, Any]:
    fires = await fetch_fires(
        west=box["west"], south=box["south"], east=box["east"], north=box["north"], days=2
    )
    if isinstance(fires, dict) and fires.get("error"):
        return {"region": box["label"], "error": fires["error"]}
    return analyze_fires(fires, box["label"])


async def briefing() -> dict[str, Any]:
    if not settings.FIRMS_MAP_KEY:
        return {
            "source": "NASA FIRMS",
            "timestamp": now_iso(),
            "status": "no_key",
            "message": (
                "Set FIRMS_MAP_KEY for satellite fire detection. Free at "
                "https://firms.modaps.eosdis.nasa.gov/api/area/"
            ),
        }

    hotspots = list(
        await asyncio.gather(*(_for_region(k, box) for k, box in HOTSPOTS.items()))
    )

    signals: list[str] = []
    total_detections = sum(h.get("totalDetections") or 0 for h in hotspots)

    for h in hotspots:
        if len(h.get("highIntensity") or []) > 5:
            signals.append(
                f"HIGH INTENSITY FIRES in {h['region']}: "
                f"{len(h['highIntensity'])} detections >10MW FRP"
            )
        if (h.get("nightDetections") or 0) > 20:
            signals.append(
                f"SUSTAINED NIGHT BURNING in {h['region']}: "
                f"{h['nightDetections']} night detections — fires running unchecked overnight"
            )

    fire_season = is_fire_season()
    if fire_season and total_detections > 200:
        signals.append(
            f"Fire season active — {total_detections} detections nationwide, "
            "expect degraded air quality across the valley"
        )

    return {
        "source": "NASA FIRMS",
        "timestamp": now_iso(),
        "status": "active",
        "fireSeason": fire_season,
        "totalDetections": total_detections,
        "hotspots": hotspots,
        "signals": signals,
    }


if __name__ == "__main__":
    import json

    print(json.dumps(asyncio.run(briefing()), indent=2, ensure_ascii=False))
