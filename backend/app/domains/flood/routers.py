"""The flood desk's HTTP surface.

Paths mirror what the Node build served, under /api/v1. Every route reads the
store the worker fills; none of them reach a government portal on the request
path.
"""

import hmac
from typing import Any

from fastapi import APIRouter, Header, Response

from app.core.config import settings
from app.core.http_cache import cache_for, no_store
from app.core.logging import get_logger
from app.core.supabase import is_db_configured
from app.domains.flood import service
from app.domains.flood.scope import EVENT_START

log = get_logger(__name__)

router = APIRouter(prefix="/flood", tags=["flood"])

# River gauges report roughly every ten minutes, so a two-minute cache keeps
# the panel current without hammering the store on every dashboard open.
DESK_TTL_S = 120
SITUATION_TTL_S = 180
RESCUE_TTL_S = 120
PERSONS_TTL_S = 180
CONTACTS_TTL_S = 600
GALLERY_TTL_S = 600
DONATIONS_TTL_S = 300
PRESS_TTL_S = 600
VIDEOS_TTL_S = 300
DIGEST_TTL_S = 60


def _serve(
    response: Response, payload: Any, *, warm: bool, ttl: int, tag: str = "cron"
) -> Any:
    """Cache a real answer; never cache an absence.

    A cold section cached for ten minutes keeps reporting "not collected yet"
    long after the cycle has collected it.
    """
    response.headers["X-Atlas-Cache"] = tag if warm else "cold"
    if warm:
        cache_for(response, edge=ttl)
    else:
        no_store(response)
    return payload


@router.get("", summary="The flood desk overview")
async def get_desk(response: Response) -> dict[str, Any]:
    store = service.get_store()
    payload = service.desk_payload()
    return _serve(response, payload, warm=service.is_warm(store), ttl=DESK_TTL_S)


@router.get("/site", summary="The reviewed site block")
async def get_site(response: Response) -> dict[str, Any]:
    """The small reviewed strings the chrome needs — the report contact address,
    the standing disclaimer.

    Its own route because the footer appears on the dashboard as well as the
    desk, and pulling the whole 200KB desk payload to render one email address
    would be absurd. Cached hard: this changes when a maintainer edits
    content/, not on any cycle.
    """
    from app.domains.flood.content import load_flood_content

    cache_for(response, edge=3600)
    return {"site": load_flood_content().get("site")}


@router.get("/situation", summary="Incidents, alerts and live filings")
async def get_situation(response: Response) -> dict[str, Any]:
    store = service.get_store()
    payload = {
        "corridor": store.get("corridor"),
        "alerts": store.get("alerts") or [],
        "helpRequests": store.get("helpRequests"),
        "personPoints": store.get("personPoints"),
        "latest": store.get("latestActivity"),
        "sitrep": service.desk_payload()["sitrep"],
        "since": EVENT_START,
        "generatedAt": store.get("lastRunAt") or service.now_iso(),
    }
    return _serve(response, payload, warm=service.is_warm(store), ttl=SITUATION_TTL_S)


@router.get("/rescue", summary="The NDRRMA rescued-persons register")
async def get_rescue(response: Response) -> dict[str, Any]:
    store = service.get_store()
    rescue = store.get("rescue")
    if rescue:
        return _serve(response, rescue, warm=True, ttl=RESCUE_TTL_S)
    return _serve(
        response,
        {
            "persons": [],
            "summary": None,
            "locations": {"rescued": [], "stationed": []},
            "messages": [],
            "error": "awaiting_first_cycle",
            "source": {
                "label": "NDRRMA Rasuwa flood update",
                "url": "https://ndrrma.gov.np/np/rasuwa/rescue",
            },
            "fetchedAt": service.now_iso(),
        },
        warm=False,
        ttl=RESCUE_TTL_S,
    )


@router.get("/persons", summary="The OPMCM missing-and-found register")
async def get_persons(response: Response) -> dict[str, Any]:
    """The whole open register, so a family's search covers every name.

    Sixteen thousand rows. It is served whole rather than paged because a
    search over the first two hundred answers "not found" about someone who is
    on the list — see the note in the rescue portal source.
    """
    store = service.get_store()
    register = store.get("opmcmPersons")
    if register:
        return _serve(response, register, warm=True, ttl=PERSONS_TTL_S)
    return _serve(
        response,
        {
            "lost": [],
            "found": [],
            "other": [],
            "total": None,
            "fetched": 0,
            "error": "awaiting_first_cycle",
            "source": {
                "label": "OPMCM rescue portal — person reports",
                "url": "https://rescue.opmcm.gov.np/person-reports",
            },
            "fetchedAt": service.now_iso(),
        },
        warm=False,
        ttl=PERSONS_TTL_S,
    )


@router.get("/contacts", summary="The government's own district contact register")
async def get_contacts(response: Response) -> dict[str, Any]:
    store = service.get_store()
    feed = store.get("officialContacts")
    warm = bool(feed and feed.get("items"))
    return _serve(
        response,
        feed
        or service.empty_feed(
            "BIPAD Portal — district contacts", "https://bipadportal.gov.np/"
        ),
        warm=warm,
        ttl=CONTACTS_TTL_S,
    )


@router.get("/donations", summary="The portal's published donation channels")
async def get_donations(response: Response) -> dict[str, Any]:
    store = service.get_store()
    feed = store.get("donationChannels")
    if feed:
        # The inline base64 QR is stripped on the way out: it is tens of
        # kilobytes per channel and the signed proxy path is already there.
        feed = {
            **feed,
            "items": [{**item, "qrData": None} for item in (feed.get("items") or [])],
        }
    warm = bool(feed and feed.get("items"))
    return _serve(
        response,
        feed
        or service.empty_feed(
            "OPMCM rescue portal — donations", "https://rescue.opmcm.gov.np/donations"
        ),
        warm=warm,
        ttl=DONATIONS_TTL_S,
    )


@router.get("/gallery", summary="Official photographs")
async def get_gallery(response: Response) -> dict[str, Any]:
    store = service.get_store()
    payload = {
        "carousel": store.get("carousel"),
        "featured": store.get("featuredPhotos"),
        "generatedAt": store.get("lastRunAt") or service.now_iso(),
    }
    warm = bool(store.get("carousel") or store.get("featuredPhotos"))
    return _serve(response, payload, warm=warm, ttl=GALLERY_TTL_S)


@router.get("/press", summary="NDRRMA press notes and advisories")
async def get_press(response: Response) -> dict[str, Any]:
    store = service.get_store()
    payload = {
        "press": store.get("pressReleases"),
        "advisories": store.get("advisories"),
        "bulletins": store.get("dailyBulletin"),
        "generatedAt": store.get("lastRunAt") or service.now_iso(),
    }
    warm = bool(store.get("pressReleases") or store.get("advisories"))
    return _serve(response, payload, warm=warm, ttl=PRESS_TTL_S)


@router.get("/videos", summary="Broadcast coverage")
async def get_videos(response: Response) -> dict[str, Any]:
    store = service.get_store()
    feed = store.get("videos")
    return _serve(
        response,
        feed
        or {
            "videos": [],
            "live": [],
            "searchEnabled": bool(settings.YOUTUBE_API_KEY),
            "error": "awaiting_first_cycle",
            "fetchedAt": service.now_iso(),
        },
        warm=bool(feed),
        ttl=VIDEOS_TTL_S,
    )


@router.get("/digest", summary="The ten-minute news digests")
async def get_digest(
    response: Response, lang: str = "en", limit: int = 12
) -> dict[str, Any]:
    lang = "ne" if lang == "ne" else "en"

    if not is_db_configured():
        # Not an error: the digests are one of the optional features, and the
        # rest of the desk works without a database.
        no_store(response)
        return {
            "enabled": False,
            "lang": lang,
            "digests": [],
            "reason": "database_not_configured",
        }

    from app.domains.news.digest_store import get_digests, schedule_catchup

    try:
        digests = await get_digests(lang, limit)
        await schedule_catchup()
        cache_for(response, edge=DIGEST_TTL_S)
        return {"enabled": True, "lang": lang, "digests": digests}
    except Exception as exc:  # noqa: BLE001
        log.warning("digest_api_failed", error=str(exc))
        no_store(response)
        return {"enabled": False, "lang": lang, "digests": [], "reason": "unavailable"}


@router.get("/refresh", summary="Cycle health")
async def refresh_status() -> dict[str, Any]:
    """What the last cycle collected, per source. No token required.

    This is the page an operator opens when a section looks stale, so it
    reports every feed's own last success rather than one overall verdict.
    """
    store = service.get_store()

    def count(key: str, inner: str = "items") -> int:
        feed = store.get(key)
        return len((feed or {}).get(inner) or [])

    official = store.get("officialContacts") or {}
    latest = store.get("latestActivity") or {}

    return {
        "lastRunAt": store.get("lastRunAt"),
        "nextRunAt": store.get("nextRunAt"),
        "intervalMinutes": store.get("intervalMinutes"),
        "health": store.get("health") or [],
        "counts": {
            "gauges": len((store.get("river") or {}).get("gauges") or []),
            "incidents": len((store.get("corridor") or {}).get("incidents") or []),
            "alerts": len(store.get("alerts") or []),
            "rescued": len((store.get("rescue") or {}).get("persons") or []),
            "videos": len((store.get("videos") or {}).get("videos") or []),
            "news": len(store.get("news") or []),
            "sitrep": len((store.get("sitrep") or {}).get("breakdowns") or []),
            "damage": len((store.get("damage") or {}).get("rows") or []),
            "damageMaps": len((store.get("damage") or {}).get("maps") or []),
            "dailyBulletin": count("dailyBulletin"),
            "pressReleases": count("pressReleases"),
            "advisories": count("advisories"),
            "govEfforts": count("govEfforts"),
            "portalContacts": count("portalContacts"),
            "opmcmPersons": (store.get("opmcmPersons") or {}).get("fetched") or 0,
            "helpRequests": count("helpRequests"),
            "personPoints": count("personPoints"),
            "officialContacts": sum(
                len(d.get("contacts") or []) for d in (official.get("items") or [])
            ),
            "carousel": count("carousel"),
            "featuredPhotos": count("featuredPhotos"),
            "popups": count("popups"),
            "donationChannels": count("donationChannels"),
            "latestFilings": len(latest.get("requests") or [])
            + len(latest.get("offers") or []),
        },
    }


@router.post("/refresh", summary="Trigger a cycle out of band")
async def trigger_refresh(
    response: Response,
    authorization: str | None = Header(None),
) -> dict[str, Any]:
    """Queue a refresh for an external scheduler.

    Answers 404 rather than 401 when no token is configured. An endpoint that
    says "wrong password" tells a prober it exists; one that says "no such
    route" does not.
    """
    expected = settings.FLOOD_REFRESH_TOKEN
    presented = (authorization or "").removeprefix("Bearer ").strip()
    if not expected or not hmac.compare_digest(presented, expected):
        response.status_code = 404
        return {"error": "not_found"}

    from app.domains.flood.tasks import refresh_flood_desk

    task = refresh_flood_desk.apply_async(queue="sweeps")
    return {"queued": True, "taskId": task.id}


@router.get("/rescue/correction", summary="Corrections filed against the register")
async def get_corrections(
    response: Response, authorization: str | None = Header(None)
) -> dict[str, Any]:
    """Maintainer only.

    These rows carry the contact details of people reporting a missing
    relative. Without a configured admin token this answers 404 rather than
    404-ing only on a wrong one — an endpoint that says "wrong password" tells
    a prober it exists.
    """
    expected = settings.FLOOD_ADMIN_TOKEN
    presented = (authorization or "").removeprefix("Bearer ").strip()
    if not expected or not hmac.compare_digest(presented, expected):
        response.status_code = 404
        return {"error": "not_found"}

    if not is_db_configured():
        no_store(response)
        return {"enabled": False, "corrections": [], "reason": "database_not_configured"}

    from app.domains.flood.corrections import list_corrections

    try:
        return {"enabled": True, "corrections": await list_corrections()}
    except Exception as exc:  # noqa: BLE001
        log.warning("corrections_read_failed", error=str(exc))
        no_store(response)
        return {"enabled": False, "corrections": [], "reason": "unavailable"}


@router.post("/rescue/correction", summary="File a correction against the register")
async def post_correction(
    response: Response,
    payload: dict[str, Any],
    x_forwarded_for: str | None = Header(None),
    x_real_ip: str | None = Header(None),
) -> dict[str, Any]:
    """A relative saying a name on the register is wrong, or that they are safe.

    Stored for a human to read. Nothing filed here changes what the register
    shows — Atlas does not edit a government list on the word of an anonymous
    form, and saying so is the point.
    """
    if not is_db_configured():
        response.status_code = 503
        return {"error": "database_not_configured"}

    from app.domains.flood.corrections import file_correction

    ip = (x_forwarded_for or "").split(",")[0].strip() or x_real_ip or "unknown"
    try:
        response.status_code = 201
        return await file_correction(payload, ip)
    except ValueError as exc:
        response.status_code = 422
        return {"error": str(exc)}
    except Exception as exc:  # noqa: BLE001
        log.warning("correction_write_failed", error=str(exc))
        response.status_code = 503
        return {"error": "unavailable"}
