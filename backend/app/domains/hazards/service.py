"""Reading the swept hazard picture.

The API never sweeps. It reads what the worker wrote, and reports honestly
when there is nothing yet — an empty skeleton with zeroed counters, never
invented figures.
"""

from typing import Any

from app.core import runs_store
from app.core.http import now_iso


# What the dashboard renders before the first sweep lands. Every counter is
# zero and every list empty; the page shows its empty states rather than
# anything that could be mistaken for a reading.
def empty_snapshot() -> dict[str, Any]:
    return {
        "meta": {
            "timestamp": now_iso(),
            "sourcesOk": 0,
            "sourcesQueried": len(_source_names()),
            "totalDurationMs": 0,
        },
        "health": [],
        "seismic": {
            "recent": [],
            "significant": [],
            "maxMagnitude": None,
            "strongest": None,
            "byProvince": {},
            "totalEvents": 0,
            "events24h": 0,
            "events7d": 0,
            "signals": [],
        },
        "weather": {
            "monsoonSeason": False,
            "totalAlerts": 0,
            "alerts": [],
            "stations": [],
            "signals": [],
        },
        "fire": {
            "status": "unavailable",
            "fireSeason": False,
            "totalDetections": 0,
            "nightDetections": 0,
            "highConfidence": 0,
            "regions": [],
            "signals": [],
        },
        "airQuality": {
            "totalReadings": 0,
            "stations": [],
            "worst": None,
            "kathmandu": None,
            "signals": [],
        },
        "relief": {"disasters": [], "reports": [], "error": None},
        "news": [],
        "impact": {"count": 0, "topRegions": [], "headline": None},
        "newsFeed": [],
        "ideas": [],
        "ideasSource": "disabled",
    }


def _source_names() -> list[str]:
    from app.domains.hazards.sweep import SOURCES

    return [name for name, _ in SOURCES]


def get_dashboard() -> dict[str, Any]:
    """The last synthesized sweep, or the empty skeleton."""
    data = runs_store.read_json(runs_store.DASHBOARD)
    if not isinstance(data, dict):
        return empty_snapshot()
    return data


def has_swept() -> bool:
    return isinstance(runs_store.read_json(runs_store.DASHBOARD), dict)
