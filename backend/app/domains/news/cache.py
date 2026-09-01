"""In-process news cache shared by the news routes and the flood cycle.

A reader's request used to fan out roughly fifteen RSS feeds per topic, eight
topics on the dashboard, nine to twelve seconds on a cold process. The sweeper
and the flood cycle warm this cache so a phone on a Nepali mobile network pays
for JSON, not for RSS.

Note the known limit, carried over from the original: this cache is per
process. The API and the worker each hold their own, and behind more than one
API replica each warms separately. That is acceptable because the cost of a
miss is latency rather than wrongness — but it is the reason the flood cycle
warms it rather than relying on readers to.
"""

import asyncio
import time
from typing import Any

from app.core.http import now_iso
from app.core.logging import get_logger
from app.domains.media.proxy import proxy_url_for

log = get_logger(__name__)

NEWS_CACHE_TTL_S = 4 * 60

# Matches the dashboard panels, so one bundle fill is enough for every rail.
BUNDLE_TOPICS: list[dict[str, Any]] = [
    {"topic": "all", "limit": 48, "sourceCap": 12},
    {"topic": "earthquake", "limit": 24, "sourceCap": 8},
    {"topic": "flood", "limit": 28, "sourceCap": 8},
    {"topic": "weather", "limit": 28, "sourceCap": 8},
    {"topic": "wildfire", "limit": 24, "sourceCap": 8},
    {"topic": "airquality", "limit": 24, "sourceCap": 8},
    {"topic": "climate", "limit": 24, "sourceCap": 8},
    {"topic": "relief", "limit": 28, "sourceCap": 8},
]

_cache: dict[str, dict[str, Any]] = {}
_locks: dict[str, asyncio.Lock] = {}


def _with_signed_images(data: dict[str, Any]) -> dict[str, Any]:
    """Sign every lead image so the page never hotlinks an outlet directly."""
    items = [
        {**item, "imageProxy": proxy_url_for(item.get("image"))}
        for item in (data.get("items") or [])
    ]
    return {**data, "items": items}


async def load_topic_news(
    topic: str, window: str, limit: int, source_cap: int
) -> dict[str, Any]:
    key = f"{topic}|{window}|{limit}|{source_cap}"
    hit = _cache.get(key)
    if hit and (time.monotonic() - hit["at"]) < NEWS_CACHE_TTL_S:
        return hit["data"]

    # One lock per key, so a burst of readers arriving on a cold cache produces
    # one upstream fan-out rather than one each.
    lock = _locks.setdefault(key, asyncio.Lock())
    async with lock:
        hit = _cache.get(key)
        if hit and (time.monotonic() - hit["at"]) < NEWS_CACHE_TTL_S:
            return hit["data"]

        from app.domains.news.sources.nepal_news import fetch_topic_news

        data = _with_signed_images(
            await fetch_topic_news(
                topic=topic, window=window, limit=limit, source_cap=source_cap
            )
        )
        _cache[key] = {"data": data, "at": time.monotonic()}
        return data


def topic_cache_stamp(topic: str, window: str, limit: int, source_cap: int) -> float:
    entry = _cache.get(f"{topic}|{window}|{limit}|{source_cap}")
    return entry["at"] if entry else 0.0


async def load_news_bundle(window: str = "24h") -> dict[str, Any]:
    """Every dashboard panel's news in one payload.

    One bundled response rather than eight routes: eight round trips on a
    high-latency mobile connection each pay 200–400ms before any RSS work
    starts.
    """
    results = await asyncio.gather(
        *(
            load_topic_news(spec["topic"], window, spec["limit"], spec["sourceCap"])
            for spec in BUNDLE_TOPICS
        )
    )
    return {
        "window": window,
        "timestamp": now_iso(),
        "topics": {spec["topic"]: data for spec, data in zip(BUNDLE_TOPICS, results)},
    }


async def warm_news_bundle(window: str = "24h") -> None:
    """Fill the cache off the request path. Failures are logged, never raised."""
    try:
        await load_news_bundle(window)
    except Exception as exc:  # noqa: BLE001
        log.warning("news_cache_warm_failed", error=str(exc))
