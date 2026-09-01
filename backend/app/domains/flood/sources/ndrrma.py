"""NDRRMA — the National Disaster Risk Reduction and Management Authority.

Four things, all published bilingually as JSON by the authority itself:

  The rescued-persons register behind ndrrma.gov.np/np/rasuwa/rescue. This is
  the government's own reunification list, which is why Atlas reads it directly
  rather than transcribing the screenshots and handwritten sheets that
  circulate during a response — a transcription is one more place for a name to
  be misspelled, and a misspelled name is a family that does not find someone.

  The national Daily Disaster Bulletin. This is national context, NOT the
  Bhotekoshi corridor toll: a nationwide 24-hour count and a cumulative
  corridor count are different things and must never be added together.

  Press notes and standing advisories — the government speaking in its own
  voice, distinct from the newsroom coverage the media page carries.

  Featured photographs and the site popup notice.

Nothing here is translated, rewritten, merged or recomputed. A field the portal
leaves null stays null; both languages come straight from the API.
"""

import asyncio
import re
import time
from typing import Any

from app.core.http import is_error, now_iso, safe_fetch
from app.core.logging import get_logger

log = get_logger(__name__)

BASE = "https://ndrrma.gov.np/api/v1"
UA = (
    "AncodaAtlas/4.0 (Nepal hazard monitoring; "
    "+https://github.com/ancoda-labs/Ancoda-Atlas)"
)
HEADERS = {"Accept": "application/json", "User-Agent": UA}
TIMEOUT_S = 20.0
PAGE = 200

# Registers change on the order of minutes during a live response; notices and
# the daily bulletin change far more slowly.
REGISTER_TTL_S = 3 * 60
NOTICE_TTL_S = 15 * 60

RESCUE_SOURCE = {
    "label": "NDRRMA Rasuwa flood update",
    "url": "https://ndrrma.gov.np/np/rasuwa/rescue",
}
BULLETIN_SOURCE = {
    "label": "NDRRMA Daily Disaster Bulletin",
    "url": "https://ndrrma.gov.np/np",
}
PRESS_SOURCE = {"label": "NDRRMA press notes", "url": "https://ndrrma.gov.np/np"}
ADVISORY_SOURCE = {"label": "NDRRMA national advisory", "url": "https://ndrrma.gov.np/np"}
PHOTOS_SOURCE = {"label": "NDRRMA featured photographs", "url": "https://ndrrma.gov.np/np"}
POPUP_SOURCE = {"label": "NDRRMA notice", "url": "https://ndrrma.gov.np/np"}

_cache: dict[str, tuple[float, Any]] = {}


async def _cached(key: str, loader: Any, ttl: float = REGISTER_TTL_S) -> Any:
    hit = _cache.get(key)
    if hit and (time.monotonic() - hit[0]) < ttl:
        return hit[1]
    value = await loader()
    _cache[key] = (time.monotonic(), value)
    return value


def clean(value: Any) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


_TAGS = re.compile(r"<[^>]*>")
_WS = re.compile(r"\s+")


def strip_html(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    text = _TAGS.sub(" ", value).replace("&nbsp;", " ").replace("&amp;", "&")
    text = _WS.sub(" ", text).strip()
    return text or None


async def _get_json(path: str) -> Any:
    data = await safe_fetch(f"{BASE}/{path}", timeout=TIMEOUT_S, headers=HEADERS, retries=1)
    if is_error(data):
        raise RuntimeError(data.error)
    if data is None:
        raise RuntimeError("no data")
    # safe_fetch answers RawText when a portal returns an HTML error page under
    # a 200, which would otherwise read as an empty result.
    if hasattr(data, "raw_text"):
        raise RuntimeError("portal answered with something other than JSON")
    return data


async def _collect(path: str, max_pages: int = 20) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for page in range(max_pages):
        joiner = "&" if "?" in path else "?"
        data = await _get_json(f"{path}{joiner}limit={PAGE}&offset={page * PAGE}")
        results = data.get("results") if isinstance(data, dict) else None
        results = results if isinstance(results, list) else []
        out.extend(results)
        if not (isinstance(data, dict) and data.get("next")) or len(results) < PAGE:
            break
    return out


def _place(node: dict[str, Any] | None) -> dict[str, Any] | None:
    if not node:
        return None
    coords = (node.get("centroid") or {}).get("coordinates")
    return {
        "id": node.get("id"),
        "title": clean(node.get("title")),
        "titleNe": clean(node.get("title_ne")),
        "lat": coords[1] if isinstance(coords, list) and len(coords) > 1 else None,
        "lon": coords[0] if isinstance(coords, list) and len(coords) > 0 else None,
    }


# ─── The rescued-persons register ────────────────────────────────────────────


async def get_rescued_persons() -> list[dict[str, Any]]:
    """The full register.

    Names are carried through exactly as NDRRMA publishes them, including the
    empty ones — a record with no name is still a rescue that happened, and
    dropping it would make the register disagree with the official count.
    """

    async def load() -> list[dict[str, Any]]:
        rows = await _collect("rescues/rescued-persons/")
        return [
            {
                "id": r.get("id"),
                "name": clean(r.get("name")),
                "nameNe": clean(r.get("name_ne")),
                "age": r.get("age") if isinstance(r.get("age"), int) else None,
                "gender": clean(r.get("gender")),
                "nationality": clean(r.get("nationality")),
                # The portal states nationality as 'nepali' or 'foreign' and
                # names the country separately. Both are carried: "foreign"
                # alone tells a reader looking for a relative almost nothing,
                # and the register holds people from eleven countries.
                "country": clean(r.get("country")),
                "rescuedOn": clean(r.get("rescued_date")),
                "rescuedAt": _place(r.get("rescued_location")),
                "stationedAt": _place(r.get("stationed_location")),
                "status": (
                    {
                        "id": r["status"].get("id"),
                        "title": r["status"].get("title"),
                        "titleNe": clean(r["status"].get("title_ne")),
                    }
                    if r.get("status")
                    else None
                ),
                "remarks": clean(r.get("remarks")),
            }
            for r in rows
        ]

    return await _cached("persons", load)


async def get_rescue_messages() -> list[dict[str, Any]]:
    """The two lines NDRRMA puts above its own register.

    That it holds verified names only, and that new names are added as they are
    confirmed. Carried through so the page says what the authority says.
    """

    async def load() -> list[dict[str, Any]]:
        data = await _get_json("rescues/messages/")
        rows = data.get("results") if isinstance(data, dict) else data
        rows = rows if isinstance(rows, list) else []
        return [
            m
            for m in (
                {"title": clean(r.get("title")), "titleNe": clean(r.get("title_ne"))}
                for r in rows
            )
            if m["title"] or m["titleNe"]
        ]

    return await _cached("messages", load)


async def get_rescue_summary() -> dict[str, Any]:
    """Headline counts, as the portal totals them. Never recomputed locally."""

    async def load() -> dict[str, Any]:
        data = await _get_json("rescues/status-counts/")
        return {
            "total": data.get("total_count") or 0,
            "nepali": data.get("nepali_count") or 0,
            "foreign": data.get("foreign_count") or 0,
            "byStatus": [
                {
                    "id": s.get("id"),
                    "title": s.get("title"),
                    "titleNe": s.get("title_ne"),
                    "count": s.get("count") or 0,
                }
                for s in (data.get("status_counts") or [])
            ],
        }

    return await _cached("summary", load)


async def get_rescue_locations() -> dict[str, Any]:
    async def load() -> dict[str, Any]:
        rescued, stationed = await asyncio.gather(
            _collect("rescues/rescued-locations/", 5),
            _collect("rescues/stationed-locations/", 5),
        )
        return {
            "rescued": [_place(p) for p in rescued],
            "stationed": [_place(p) for p in stationed],
        }

    return await _cached("locations", load)


async def get_rescue_register() -> dict[str, Any]:
    """Everything the rescue page needs, in one call.

    Partial failure is reported rather than hidden: during a response an empty
    list and an unreachable portal mean very different things to someone
    looking for a relative, and the page must be able to tell them apart.
    """
    persons, summary, locations, messages = await asyncio.gather(
        get_rescued_persons(),
        get_rescue_summary(),
        get_rescue_locations(),
        get_rescue_messages(),
        return_exceptions=True,
    )

    # Notices above the register are optional flavour. A missing messages
    # endpoint must not hide the names — that is the page's actual job.
    errors = [
        str(r)
        for r in (persons, summary, locations)
        if isinstance(r, BaseException)
    ]

    return {
        "persons": persons if not isinstance(persons, BaseException) else [],
        "summary": summary if not isinstance(summary, BaseException) else None,
        "locations": locations
        if not isinstance(locations, BaseException)
        else {"rescued": [], "stationed": []},
        "messages": messages if not isinstance(messages, BaseException) else [],
        "error": "; ".join(errors) if errors else None,
        "source": RESCUE_SOURCE,
        "fetchedAt": now_iso(),
    }


# ─── The daily bulletin ──────────────────────────────────────────────────────


async def get_daily_bulletins(limit: int = 5) -> dict[str, Any]:
    """The most recent daily bulletins, newest first.

    National context under its own heading with the date it covers. Its figures
    are never folded into the corridor sitrep.
    """
    fetched_at = now_iso()

    async def load() -> dict[str, Any]:
        data = await _get_json(f"bulletin/bulletins/?limit={max(1, limit) + 4}")
        rows = data.get("results") if isinstance(data, dict) else None
        rows = rows if isinstance(rows, list) else []
        bulletins = [
            {
                "id": r.get("id"),
                "title": clean(r.get("title")),
                "titleNe": clean(r.get("title_ne")),
                "summary": clean(r.get("summary")),
                "summaryNe": clean(r.get("summary_ne")),
                "date": clean(r.get("date")),
                "pdfUrl": clean(r.get("pdffile")),
                # Raw upstream URL — the caller signs it through the media proxy.
                "image": clean(r.get("image")),
            }
            for r in rows
            if "daily" in ((r.get("bulletin_type") or {}).get("bul_type") or "").lower()
        ][:limit]
        if not bulletins:
            raise RuntimeError("no daily bulletins in the response")
        return {
            "bulletins": bulletins,
            "error": None,
            "source": BULLETIN_SOURCE,
            "fetchedAt": fetched_at,
        }

    try:
        return await _cached(f"bulletins:{limit}", load, NOTICE_TTL_S)
    except Exception as exc:  # noqa: BLE001
        log.warning("ndrrma_bulletin_unavailable", error=str(exc))
        return {
            "bulletins": [],
            "error": str(exc) or exc.__class__.__name__,
            "source": BULLETIN_SOURCE,
            "fetchedAt": fetched_at,
        }


# ─── Press notes, advisories, photographs, popups ────────────────────────────


async def get_press_releases(limit: int = 12) -> dict[str, Any]:
    fetched_at = now_iso()

    async def load() -> dict[str, Any]:
        data = await _get_json(
            f"pressnotenews/newsinfo/?omit=description,description_ne&limit={max(1, limit)}"
        )
        rows = data.get("results") if isinstance(data, dict) else None
        items = [
            {
                "id": r.get("id"),
                "title": clean(r.get("title")),
                "titleNe": clean(r.get("title_ne")),
                "summary": clean(r.get("summary")),
                "summaryNe": clean(r.get("summary_ne")),
                "date": clean(r.get("date")),
                "image": clean(r.get("image")),
            }
            for r in (rows if isinstance(rows, list) else [])
        ]
        if not items:
            raise RuntimeError("no press notes in the response")
        return {"items": items, "error": None, "source": PRESS_SOURCE, "fetchedAt": fetched_at}

    try:
        return await _cached(f"press:{limit}", load, NOTICE_TTL_S)
    except Exception as exc:  # noqa: BLE001
        log.warning("ndrrma_press_unavailable", error=str(exc))
        return {"items": [], "error": str(exc), "source": PRESS_SOURCE, "fetchedAt": fetched_at}


async def get_national_advisories() -> dict[str, Any]:
    """The standing advisories NDRRMA wants on every disaster page right now."""
    fetched_at = now_iso()

    async def load() -> dict[str, Any]:
        data = await _get_json("nationalbipadalerts/bipadalert/")
        rows = data.get("results") if isinstance(data, dict) else None
        advisories = [
            {
                "id": r.get("id"),
                "title": clean(r.get("title")),
                "titleNe": clean(r.get("title_ne")),
                "body": strip_html(r.get("description")) or clean(r.get("title")),
                "bodyNe": strip_html(r.get("description_ne")) or clean(r.get("title_ne")),
                "links": [
                    link
                    for link in (
                        {"name": clean(x.get("name")), "link": clean(x.get("link"))}
                        for x in (r.get("important_links") or [])
                    )
                    if link["link"]
                ],
                "numbers": [
                    number
                    for number in (
                        {
                            "name": clean(n.get("name")) or clean(n.get("name_ne")),
                            "designation": clean(n.get("designation"))
                            or clean(n.get("designation_ne")),
                            "number": clean(n.get("number"))
                            or clean(n.get("phone"))
                            or clean(n.get("mobile")),
                        }
                        for n in (r.get("important_numbers") or [])
                    )
                    if number["number"]
                ],
            }
            for r in (rows if isinstance(rows, list) else [])
        ]
        return {
            "advisories": advisories,
            "error": None,
            "source": ADVISORY_SOURCE,
            "fetchedAt": fetched_at,
        }

    try:
        return await _cached("advisories", load, NOTICE_TTL_S)
    except Exception as exc:  # noqa: BLE001
        log.warning("ndrrma_advisory_unavailable", error=str(exc))
        return {
            "advisories": [],
            "error": str(exc),
            "source": ADVISORY_SOURCE,
            "fetchedAt": fetched_at,
        }


async def get_featured_photos(limit: int = 12) -> dict[str, Any]:
    """The photographs NDRRMA features on its own site.

    National and not flood-specific — it carries whatever NDRRMA last featured
    — so it is labelled as the authority's gallery, not as flood coverage.
    """
    fetched_at = now_iso()

    async def load() -> dict[str, Any]:
        data = await _get_json("galleries/featuredphotos/")
        rows = data.get("results") if isinstance(data, dict) else None
        items = [
            item
            for item in (
                {
                    "id": r.get("id"),
                    "title": clean(r.get("title")),
                    "titleNe": clean(r.get("title_ne")),
                    "description": strip_html(r.get("description")),
                    "descriptionNe": strip_html(r.get("description_ne")),
                    "image": clean(r.get("image")),
                }
                for r in (rows if isinstance(rows, list) else [])[: max(1, limit)]
            )
            if item["image"]
        ]
        if not items:
            raise RuntimeError("no featured photographs in the response")
        return {"items": items, "error": None, "source": PHOTOS_SOURCE, "fetchedAt": fetched_at}

    try:
        return await _cached(f"photos:{limit}", load, NOTICE_TTL_S)
    except Exception as exc:  # noqa: BLE001
        log.warning("ndrrma_photos_unavailable", error=str(exc))
        return {"items": [], "error": str(exc), "source": PHOTOS_SOURCE, "fetchedAt": fetched_at}


async def get_website_popups() -> dict[str, Any]:
    """The notice NDRRMA raises over its own site when it wants something read
    before anything else.

    Unlike the other endpoints this one answers with a bare array and the rows
    carry no id, so the position in that array is the identity.
    """
    fetched_at = now_iso()

    async def load() -> dict[str, Any]:
        data = await _get_json("website/popup/")
        rows = data if isinstance(data, list) else (data.get("results") or [])
        items = []
        for index, r in enumerate(rows):
            item = {
                "id": f"popup-{index}",
                "title": clean(r.get("title")),
                "titleNe": clean(r.get("title_ne")),
                "body": strip_html(r.get("description")),
                "bodyNe": strip_html(r.get("description_ne")),
                "pdfUrl": clean(r.get("pdf")),
                "image": clean(r.get("image")),
            }
            # A notice with neither words nor a document behind it is not a notice.
            if (item["title"] or item["body"]) and (
                item["pdfUrl"] or item["image"] or item["body"]
            ):
                items.append(item)
        return {"items": items, "error": None, "source": POPUP_SOURCE, "fetchedAt": fetched_at}

    try:
        return await _cached("popups", load, NOTICE_TTL_S)
    except Exception as exc:  # noqa: BLE001
        log.warning("ndrrma_popup_unavailable", error=str(exc))
        return {"items": [], "error": str(exc), "source": POPUP_SOURCE, "fetchedAt": fetched_at}
