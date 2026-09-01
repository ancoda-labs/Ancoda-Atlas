"""BIPAD Portal live telemetry layer for the dashboard map.

Pulls river stations, rain stations, alerts, incidents, and earthquakes
from bipadportal.gov.np and caches the result for 3 minutes.
"""

import asyncio
import time
from typing import Any

from app.core.http import is_error, safe_fetch
from app.core.logging import get_logger

log = get_logger(__name__)

BIPAD_BASE = "https://bipadportal.gov.np/api/v1"
HEADERS = {
    "Accept": "application/json",
    "User-Agent": "AncodaAtlas/4.0 (Nepal hazard monitoring; +https://github.com/ancoda-labs/Ancoda-Atlas)",
}
CACHE_TTL_S = 180.0
TIMEOUT_S = 15.0

URLS: dict[str, str] = {
    "riverStations": f"{BIPAD_BASE}/river-stations/?limit=200",
    "rainStations": f"{BIPAD_BASE}/rain-stations/?limit=200",
    "alerts": f"{BIPAD_BASE}/alert/?ordering=-created_on&limit=50",
    "incidents": f"{BIPAD_BASE}/incident/?ordering=-incident_on&limit=100",
    "earthquakes": f"{BIPAD_BASE}/earthquake/?ordering=-event_on&limit=50",
}

_cache: dict[str, list[dict[str, Any]]] = {}
_cached_at: float = 0.0
_fetch_lock: asyncio.Lock | None = None


def _get_lock() -> asyncio.Lock:
    global _fetch_lock
    if _fetch_lock is None:
        _fetch_lock = asyncio.Lock()
    return _fetch_lock


async def _fetch_feed(key: str, url: str) -> tuple[str, list[dict[str, Any]]]:
    try:
        data = await safe_fetch(url, timeout=TIMEOUT_S, headers=HEADERS, retries=1)
        if is_error(data):
            log.warning("bipad_feed_failed", feed=key, error=data.error)
            return key, []
        if isinstance(data, dict):
            results = data.get("results")
            if isinstance(results, list):
                return key, results
        elif isinstance(data, list):
            return key, data
        return key, []
    except Exception as exc:  # noqa: BLE001
        log.warning("bipad_feed_exception", feed=key, error=str(exc))
        return key, []


async def get_bipad_telemetry() -> dict[str, list[dict[str, Any]]]:
    """Retrieve the BIPAD telemetry payload with 3-minute in-memory caching."""
    global _cached_at, _cache
    now = time.monotonic()
    if _cache and (now - _cached_at) < CACHE_TTL_S:
        return _cache

    lock = _get_lock()
    async with lock:
        now = time.monotonic()
        if _cache and (now - _cached_at) < CACHE_TTL_S:
            return _cache

        tasks = [_fetch_feed(k, u) for k, u in URLS.items()]
        results = await asyncio.gather(*tasks)
        payload: dict[str, list[dict[str, Any]]] = {
            "riverStations": [],
            "rainStations": [],
            "alerts": [],
            "incidents": [],
            "earthquakes": [],
        }
        for key, rows in results:
            payload[key] = rows

        # Only update cache if we received at least some data, or if cache is completely empty
        if any(len(rows) > 0 for rows in payload.values()) or not _cache:
            _cache = payload
            _cached_at = now

        return _cache or payload
