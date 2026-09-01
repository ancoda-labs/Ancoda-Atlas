"""The ten-minute flood desk refresh.

The cycle is deliberately not transactional: sources are refreshed
independently and one failing has no effect on the others. `refresh` below is
the whole resilience story — the apply step runs only on success, so a portal
that has fallen over leaves the previous figures standing with an honest
lastSuccess beside them rather than blanking the section.
"""

import asyncio
import time
from typing import Any, Awaitable, Callable

from app.core.celery_app import celery_app
from app.core.http import now_iso
from app.core.logging import configure_logging, get_logger
from app.domains.flood import scope
from app.domains.flood import store as desk_store
from app.domains.flood.gauges import fetch_corridor_gauges
from app.domains.flood.sources import bipad, bulletin_damage, bulletin_sitrep, ndrrma
from app.domains.flood.sources import rescue_portal as portal
from app.domains.media.proxy import proxy_url_for
from app.domains.news import ledger
from app.domains.news.cache import load_news_bundle
from app.domains.news.sources.gov_updates import get_gov_updates
from app.domains.news.sources.nepal_news import fetch_topic_news
from app.domains.news.sources.youtube import get_flood_videos

log = get_logger(__name__)


def _proxy_images(items: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    """Sign every bulletin image so the desk never hotlinks one."""
    return [{**item, "imageProxy": proxy_url_for(item.get("src"))} for item in (items or [])]


def _swap_image_for_proxy(item: dict[str, Any], field: str = "image") -> dict[str, Any]:
    """Replace a raw upstream URL with its signed path.

    The raw URL is dropped rather than kept alongside: leaving it in the
    payload invites a component to use it directly and hotlink a plain-HTTP
    image onto an HTTPS page.
    """
    out = {k: v for k, v in item.items() if k != field}
    out["imageProxy"] = proxy_url_for(item.get(field))
    return out


async def _refresh(
    key: str,
    store: dict[str, Any],
    load: Callable[[], Awaitable[Any]],
    apply: Callable[[Any], None],
) -> dict[str, Any]:
    started = time.monotonic()
    attempt_at = now_iso()
    previous = next((h for h in store.get("health") or [] if h.get("key") == key), None)
    try:
        apply(await load())
        return {
            "key": key,
            "ok": True,
            "lastSuccess": attempt_at,
            "lastAttempt": attempt_at,
            "error": None,
            "durationMs": int((time.monotonic() - started) * 1000),
        }
    except Exception as exc:  # noqa: BLE001
        message = str(exc) or exc.__class__.__name__
        log.warning("flood_source_failed", source=key, error=message)
        return {
            "key": key,
            "ok": False,
            # The previous success time survives, so the page can say how old
            # the figures it is showing actually are.
            "lastSuccess": (previous or {}).get("lastSuccess"),
            "lastAttempt": attempt_at,
            "error": message,
            "durationMs": int((time.monotonic() - started) * 1000),
        }


# ─── Per-source loaders ──────────────────────────────────────────────────────
#
# Each raises on a failed read. The pattern "empty result WITH an error" is
# treated as failure throughout, because an emptied register and an unreachable
# portal are different facts and only the second should leave old data standing.


async def _load_rescue() -> dict[str, Any]:
    register = await ndrrma.get_rescue_register()
    if register["error"] and not register["persons"]:
        raise RuntimeError(register["error"])
    return register


async def _load_portal() -> dict[str, Any]:
    stats = await portal.get_rescue_portal_stats()
    if stats["error"]:
        raise RuntimeError(stats["error"])
    return stats


async def _load_videos() -> dict[str, Any]:
    feed = await get_flood_videos(limit=24)
    if not feed["videos"] and feed["error"]:
        raise RuntimeError(feed["error"])
    return feed


async def _load_news() -> list[dict[str, Any]]:
    data = await fetch_topic_news(topic="flood", window="48h", limit=40, source_cap=8)
    # Image URLs are signed here, on the server, where the key lives.
    items = [
        {**item, "imageProxy": proxy_url_for(item.get("image"))}
        for item in (data.get("items") or [])
    ]
    if not items:
        raise RuntimeError("no items")
    return items


def _scope_gov_update(item: dict[str, Any]) -> dict[str, Any]:
    """Mark whether a ministry post is about this flood or another hazard.

    The source can only answer "is this a hazard post" and which hazard — it
    has no business knowing what this desk's corridor is. That question belongs
    here, and `scope.district_pin_for_text` is the same needle list the map
    places headlines with, so a post and a pin cannot disagree about where
    Timure is.

    A post naming no corridor district is not dropped. The government warning
    the Mahakali about flash floods is worth reading; it is simply not this
    flood, and the desk shows it under its own heading rather than beside the
    Bhotekoshi sitreps where it would be read as part of them.
    """
    district = scope.describes_corridor(
        f"{item.get('titleNe') or ''} {item.get('title') or ''}",
        f"{item.get('bodyNe') or ''} {item.get('bodyEn') or ''}",
    )
    return {**item, "district": district, "corridor": district is not None}


async def _load_gov_updates() -> dict[str, Any]:
    feed = await get_gov_updates(limit=40)
    if feed["error"] and not feed["items"]:
        raise RuntimeError(feed["error"])
    # An empty list without an error is a real answer — the government has
    # posted nothing about a hazard this week — so it is kept rather than
    # treated as a failed read.
    return {
        **feed,
        "items": [
            _scope_gov_update(
                {**item, "images": [_swap_image_for_proxy(i) for i in item["images"]]}
            )
            for item in feed["items"]
        ],
    }


async def _load_sitrep() -> dict[str, Any]:
    live = await bulletin_sitrep.get_bulletin_sitrep()
    # No figures with an error is a failed read, not an emptied toll — fail so
    # the reviewed figures stay on the page.
    if live["error"] or not live["breakdowns"]:
        raise RuntimeError(live["error"] or "no figures")
    return live


async def _load_damage() -> dict[str, Any]:
    live = await bulletin_damage.get_bulletin_damage()
    if live["error"] or not live["rows"]:
        raise RuntimeError(live["error"] or "no Copernicus table")
    return {
        **live,
        "maps": _proxy_images(live["maps"]),
        "photos": _proxy_images(live["photos"]),
    }


async def _load_daily_bulletin() -> dict[str, Any]:
    feed = await ndrrma.get_daily_bulletins(limit=5)
    if feed["error"] and not feed["bulletins"]:
        raise RuntimeError(feed["error"])
    return {
        "items": [_swap_image_for_proxy(b) for b in feed["bulletins"]],
        "error": feed["error"],
        "source": feed["source"],
        "fetchedAt": feed["fetchedAt"],
    }


async def _load_notices(store: dict[str, Any]) -> dict[str, Any]:
    press, advisories = await asyncio.gather(
        ndrrma.get_press_releases(limit=12), ndrrma.get_national_advisories()
    )
    if (
        press["error"] and not press["items"]
        and advisories["error"] and not advisories["advisories"]
    ):
        raise RuntimeError(press["error"] or advisories["error"])

    store["pressReleases"] = {
        "items": [_swap_image_for_proxy(n) for n in press["items"]],
        "error": press["error"],
        "source": press["source"],
        "fetchedAt": press["fetchedAt"],
    }
    return {
        "items": advisories["advisories"],
        "error": advisories["error"],
        "source": advisories["source"],
        "fetchedAt": advisories["fetchedAt"],
    }


async def _load_persons() -> dict[str, Any]:
    register = await portal.get_person_register()
    if register["error"] and not register["lost"] and not register["found"]:
        raise RuntimeError(register["error"])
    return {
        "lost": [_swap_image_for_proxy(p) for p in register["lost"]],
        "found": [_swap_image_for_proxy(p) for p in register["found"]],
        "other": [_swap_image_for_proxy(p) for p in register["other"]],
        "total": register["total"],
        "fetched": register["fetched"],
        "error": register["error"],
        "source": register["source"],
        "fetchedAt": register["fetchedAt"],
    }


async def _load_ndrrma_media(store: dict[str, Any]) -> dict[str, Any]:
    photos, popups = await asyncio.gather(
        ndrrma.get_featured_photos(limit=12), ndrrma.get_website_popups()
    )
    if photos["error"] and not photos["items"] and popups["error"]:
        raise RuntimeError(photos["error"])

    # An empty popup list is a real state — NDRRMA is not always raising a
    # notice — so it is stored rather than treated as a failed read.
    store["popups"] = {
        "items": [_swap_image_for_proxy(p) for p in popups["items"]],
        "error": popups["error"],
        "source": popups["source"],
        "fetchedAt": popups["fetchedAt"],
    }
    return {
        "items": [_swap_image_for_proxy(p) for p in photos["items"]],
        "error": photos["error"],
        "source": photos["source"],
        "fetchedAt": photos["fetchedAt"],
    }


def _wrap(feed: dict[str, Any], items_key: str) -> dict[str, Any]:
    """Normalise a source's own key to `items`, keeping its provenance."""
    return {
        "items": feed[items_key],
        "error": feed["error"],
        "source": feed["source"],
        "fetchedAt": feed["fetchedAt"],
    }


async def _guard(feed: dict[str, Any], items_key: str) -> dict[str, Any]:
    if feed["error"] and not feed[items_key]:
        raise RuntimeError(feed["error"])
    return feed


async def _warm_and_log_news(
    gov_updates: dict[str, Any] | None,
    flood_news: list[dict[str, Any]] | None,
) -> None:
    """Fill the news cache, then write down what was on the pages.

    Awaited, not fire-and-forget. `run_flood_refresh` is called through
    `asyncio.run`, which closes the loop on return and cancels leftover tasks
    — a `create_task` here was dying before it appended a single row.

    The figures are already on disk by the time this runs, so a slow wire
    delays the Celery task finishing, not the page a reader is looking at.
    """
    try:
        bundle = await load_news_bundle()
    except Exception as exc:  # noqa: BLE001
        log.warning("news_cache_warm_failed", error=str(exc))
        bundle = {}

    logged = ledger.record_wire_bundle(bundle)
    # The desk's own rail is a 48-hour flood window, wider than the dashboard
    # bundle. Log it too, or a district story that only made that rail is lost.
    logged += ledger.record_wire_items(flood_news, topic="flood")
    logged += ledger.record_gov_updates((gov_updates or {}).get("items") or [])
    if logged:
        log.info("news_ledger_appended", rows=logged, total=ledger.stats()["rows"])


# ─── The cycle ───────────────────────────────────────────────────────────────


async def run_flood_refresh() -> dict[str, Any]:
    """One full cycle. Safe to call directly — the manual refresh route does."""
    store = desk_store.load()
    started = time.monotonic()

    def setter(key: str) -> Callable[[Any], None]:
        def apply(value: Any) -> None:
            store[key] = value

        return apply

    async def carousel() -> dict[str, Any]:
        feed = await _guard(await portal.get_carousel(), "items")
        return {**_wrap(feed, "items"), "items": [_swap_image_for_proxy(i) for i in feed["items"]]}

    async def donations() -> dict[str, Any]:
        feed = await _guard(await portal.get_donation_channels(limit=12), "items")
        return {
            **_wrap(feed, "items"),
            "items": [
                {
                    **{k: v for k, v in item.items() if k != "qrImage"},
                    "qrData": None,
                    "qrProxy": proxy_url_for(item.get("qrImage")),
                }
                for item in feed["items"]
            ],
        }

    async def latest() -> dict[str, Any]:
        feed = await portal.get_latest_activity(limit=6)
        if feed["error"] and not feed["requests"] and not feed["offers"]:
            raise RuntimeError(feed["error"])
        return feed

    jobs: list[Awaitable[dict[str, Any]]] = [
        _refresh("river", store, fetch_corridor_gauges, setter("river")),
        # No `since` — the source resolves the event's start from the shared
        # scope, so the refresher and a direct call cannot disagree.
        _refresh("corridor", store, bipad.get_corridor_incidents, setter("corridor")),
        _refresh("alerts", store, lambda: bipad.get_alerts(limit=40), setter("alerts")),
        _refresh("rescue", store, _load_rescue, setter("rescue")),
        _refresh("portal", store, _load_portal, setter("portal")),
        _refresh("videos", store, _load_videos, setter("videos")),
        _refresh("news", store, _load_news, setter("news")),
        _refresh("sitrep", store, _load_sitrep, setter("sitrep")),
        _refresh("damage", store, _load_damage, setter("damage")),
        _refresh("ndrrmaBulletin", store, _load_daily_bulletin, setter("dailyBulletin")),
        _refresh("ndrrmaNotices", store, lambda: _load_notices(store), setter("advisories")),
        _refresh(
            "govEfforts",
            store,
            lambda: _guard_call(portal.get_government_efforts(limit=20), "items"),
            setter("govEfforts"),
        ),
        _refresh("govUpdates", store, _load_gov_updates, setter("govUpdates")),
        _refresh(
            "portalContacts",
            store,
            lambda: _guard_call(portal.get_emergency_contacts(limit=50), "items"),
            setter("portalContacts"),
        ),
        _refresh("opmcmPersons", store, _load_persons, setter("opmcmPersons")),
        _refresh(
            "helpRequests",
            store,
            lambda: _wrapped_call(portal.get_help_requests_map(limit=200), "requests"),
            setter("helpRequests"),
        ),
        # The local government's own contact register. This is why the contacts
        # page no longer depends on one hand-typed district.
        _refresh(
            "officialContacts",
            store,
            lambda: _wrapped_call(bipad.get_district_contacts(), "districts"),
            setter("officialContacts"),
        ),
        _refresh(
            "personPoints",
            store,
            lambda: _wrapped_call(portal.get_person_map_points(limit=200), "points"),
            setter("personPoints"),
        ),
        _refresh("portalLatest", store, latest, setter("latestActivity")),
        _refresh("portalCarousel", store, carousel, setter("carousel")),
        # Kept in the store so the giving page can show these beside — never
        # inside — the reviewed accounts.
        _refresh("portalDonations", store, donations, setter("donationChannels")),
        _refresh("ndrrmaMedia", store, lambda: _load_ndrrma_media(store), setter("featuredPhotos")),
    ]

    health = list(await asyncio.gather(*jobs))

    store["health"] = health
    store["lastRunAt"] = now_iso()
    store["intervalMinutes"] = desk_store.interval_minutes()
    from datetime import datetime, timedelta, timezone

    next_run = datetime.now(timezone.utc) + timedelta(minutes=store["intervalMinutes"])
    store["nextRunAt"] = f"{next_run:%Y-%m-%dT%H:%M:%S}.{next_run.microsecond // 1000:03d}Z"

    desk_store.persist(store)

    # Both of these run beside the cycle rather than inside it: a slow model or
    # a slow wire must never hold up the figures.
    from app.domains.news.digest_store import schedule_catchup

    await schedule_catchup()
    # Awaited: a create_task here is cancelled when asyncio.run closes the loop.
    await _warm_and_log_news(store.get("govUpdates"), store.get("news"))

    failed = [h for h in health if not h["ok"]]
    log.info(
        "flood_cycle_complete",
        ms=int((time.monotonic() - started) * 1000),
        ok=len(health) - len(failed),
        total=len(health),
        failed=[f["key"] for f in failed] or None,
    )
    return store


async def _guard_call(coro: Awaitable[dict[str, Any]], items_key: str) -> dict[str, Any]:
    return await _guard(await coro, items_key)


async def _wrapped_call(coro: Awaitable[dict[str, Any]], items_key: str) -> dict[str, Any]:
    feed = await _guard(await coro, items_key)
    return _wrap(feed, items_key)


@celery_app.task(name="flood.refresh", queue="sweeps")
def refresh_flood_desk() -> dict[str, Any]:
    configure_logging()
    try:
        store = asyncio.run(run_flood_refresh())
    except Exception as exc:  # noqa: BLE001
        log.exception("flood_cycle_failed", error=str(exc))
        return {"ok": False, "error": str(exc)}

    health = store.get("health") or []
    return {
        "ok": True,
        "sourcesOk": len([h for h in health if h["ok"]]),
        "sources": len(health),
    }
