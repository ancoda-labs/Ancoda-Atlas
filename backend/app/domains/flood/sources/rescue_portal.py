"""The OPMCM rescue portal — the Prime Minister's Office portal for this flood.

rescue.opmcm.gov.np is where families file a missing person, people in trouble
file a request for help, and volunteers and hospitals file what they can offer.
This module reads the same JSON the portal's own front page reads.

WHAT THE COUNTERS ARE, AND WHAT THEY ARE NOT.

They count filings, not people. One person can be reported missing by three
relatives, and a family that finds their relative rarely comes back to close
the report. So the portal's five-thousand-odd missing reports are not a
missing-persons toll and must never be added to, or reconciled against, the
NDRRMA register or the sitrep figures. They measure how much the public is
asking for, which is a real and separate thing worth showing.

Nothing here is recomputed. Every number passes through as the portal states
it, and a counter the portal omits comes back None rather than 0 — "the portal
did not say" and "the portal said none" are different facts.

ONE PRIVACY RULE, for the filing endpoints. They carry the filer's name and
phone number, because the portal's own staff work those filings. Atlas is not
the portal and cannot take a filing off the internet on request, so no personal
name or phone number from a public filing is carried through. What a reader
needs — what was asked for, how urgent, and where — all survives.
"""

import asyncio
import re
import time
from typing import Any

from app.core.http import is_error, now_iso, safe_fetch
from app.core.logging import get_logger

log = get_logger(__name__)

BASE = "https://rescue.opmcm.gov.np"
UA = (
    "AncodaAtlas/4.0 (Nepal hazard monitoring; "
    "+https://github.com/ancoda-labs/Ancoda-Atlas)"
)
HEADERS = {"Accept": "application/json", "User-Agent": UA}
TIMEOUT_S = 20.0

CONTENT_TTL_S = 3 * 60
_cache: dict[str, tuple[float, Any]] = {}

# Nepal's bounding box, generous by ~0.2° — mirrors core/nepal.py NEPAL_BBOX.
# The portal's coordinates are unreliable: sample rows geolocate to other
# countries, so anything outside is dropped rather than plotted.
_NEPAL = (26.3, 30.6, 79.9, 88.3)


def _in_nepal(lat: Any, lon: Any) -> bool:
    return (
        isinstance(lat, (int, float))
        and isinstance(lon, (int, float))
        and not isinstance(lat, bool)
        and not isinstance(lon, bool)
        and _NEPAL[0] <= lat <= _NEPAL[1]
        and _NEPAL[2] <= lon <= _NEPAL[3]
    )


async def _cached(key: str, loader: Any) -> Any:
    hit = _cache.get(key)
    if hit and (time.monotonic() - hit[0]) < CONTENT_TTL_S:
        return hit[1]
    value = await loader()
    _cache[key] = (time.monotonic(), value)
    return value


def count(value: Any) -> int | None:
    """A counter as published, or None if missing or not a sane count."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return round(value) if value >= 0 else None


def order(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return value


def text(value: Any) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def absolute(url: Any) -> str | None:
    """A relative portal path made absolute, so the media proxy can sign it."""
    u = text(url)
    if not u:
        return None
    if re.match(r"^https?://", u, re.I):
        return u
    return f"{BASE}{'' if u.startswith('/') else '/'}{u}"


def data_thumb(value: Any) -> str | None:
    """A base64 data-URI thumbnail, kept only if it actually looks like one."""
    u = text(value)
    return u if u and u.startswith("data:image/") else None


async def _get_portal_json(path: str) -> dict[str, Any]:
    body = await safe_fetch(f"{BASE}{path}", timeout=TIMEOUT_S, retries=1, headers=HEADERS)
    if is_error(body):
        raise RuntimeError(body.error)
    if body is None:
        raise RuntimeError("no data")
    if hasattr(body, "raw_text"):
        raise RuntimeError("portal answered with something other than JSON")
    if not isinstance(body, dict) or not body.get("success") or not body.get("data"):
        raise RuntimeError("portal reported no data")
    return body["data"]


# ─── Counters ────────────────────────────────────────────────────────────────

STATS_SOURCE = {"label": "OPMCM rescue portal", "url": f"{BASE}/"}

_REQUEST_KEYS = ["total", "open", "critical", "inProgress", "resolved", "cancelled"]
_OFFER_KEYS = ["total", "available", "helping", "completed", "unavailable"]
_PERSON_KEYS = [
    "total", "lost", "lostOpen", "found", "foundOpen", "resolved",
    "last24h", "childrenMissing", "elderlyMissing",
]


def _empty_stats(error: str | None, fetched_at: str) -> dict[str, Any]:
    return {
        "requests": dict.fromkeys(_REQUEST_KEYS),
        "offers": dict.fromkeys(_OFFER_KEYS),
        "persons": dict.fromkeys(_PERSON_KEYS),
        "error": error,
        "source": STATS_SOURCE,
        "fetchedAt": fetched_at,
    }


async def get_rescue_portal_stats() -> dict[str, Any]:
    """The portal's current counters."""
    fetched_at = now_iso()
    try:
        data = await _get_portal_json("/api/stats")
        requests_ = data.get("requests") or {}
        offers = data.get("offers") or {}
        persons = data.get("persons") or {}
        return {
            # `critical` is a severity flag rather than a state: a critical
            # request is also counted under whichever state it sits in.
            "requests": {k: count(requests_.get(k)) for k in _REQUEST_KEYS},
            "offers": {k: count(offers.get(k)) for k in _OFFER_KEYS},
            "persons": {k: count(persons.get(k)) for k in _PERSON_KEYS},
            "error": None,
            "source": STATS_SOURCE,
            "fetchedAt": fetched_at,
        }
    except Exception as exc:  # noqa: BLE001
        log.warning("rescue_portal_stats_unavailable", error=str(exc))
        return _empty_stats(str(exc) or exc.__class__.__name__, fetched_at)


# ─── Bilingual splitting ─────────────────────────────────────────────────────

DEVANAGARI = re.compile(r"[ऀ-ॿ]")
LATIN = re.compile(r"[A-Za-z]")
# Only whitespace and emoji, matching the original. A broader class such as \W
# would also eat a leading quote or bracket from an English paragraph, which is
# content rather than decoration.
_LEAD_SYMBOLS = re.compile(
    "^[\\s"
    "\U0001F300-\U0001FAFF"  # pictographs, symbols, flags
    "\U00002600-\U000027BF"  # misc symbols and dingbats
    "\U0001F1E6-\U0001F1FF"  # regional indicators (flag pairs)
    "\uFE0F\u200D"           # variation selector, zero-width joiner
    "]+"
)


def split_bilingual(raw: Any) -> dict[str, str | None]:
    """Split a government-effort description into its Nepali and English halves.

    The portal writes these as one string. Sometimes each half is flagged with
    a flag emoji, sometimes the two just sit in consecutive paragraphs. So the
    split is by script: each paragraph is filed under whichever alphabet it is
    mostly written in, and if a language ends up empty the other stands in for
    both rather than leaving a blank panel.
    """
    source = text(raw)
    if not source:
        return {"en": None, "ne": None}

    paragraphs = []
    for chunk in re.split(r"\n{2,}", source):
        cleaned = _LEAD_SYMBOLS.sub("", chunk).strip()
        if not cleaned:
            continue
        if re.match(r"^📢|official live updates", cleaned, re.I):
            continue
        paragraphs.append(cleaned)

    ne: list[str] = []
    en: list[str] = []
    for p in paragraphs:
        deva = len(DEVANAGARI.findall(p))
        latin = len(LATIN.findall(p))
        (ne if deva >= latin else en).append(p)

    ne_text = "\n\n".join(ne) or None
    en_text = "\n\n".join(en) or None
    return {"en": en_text or ne_text, "ne": ne_text or en_text}


def split_title(raw: Any) -> dict[str, str | None]:
    """Best-effort split of a "<Nepali> — <English>" title."""
    t = text(raw)
    if not t:
        return {"title": None, "titleNe": None}
    parts = re.split(r"\s+[—–-]\s+", t)
    if len(parts) == 2:
        a, b = parts
        if DEVANAGARI.search(a) and LATIN.search(b) and not DEVANAGARI.search(b):
            return {"title": b.strip(), "titleNe": a.strip()}
    return {"title": t, "titleNe": t}


# ─── Content endpoints ───────────────────────────────────────────────────────

EFFORTS_SOURCE = {
    "label": "OPMCM rescue portal — government efforts",
    "url": f"{BASE}/government-efforts",
}
CONTACTS_SOURCE = {"label": "OPMCM rescue portal — emergency contacts", "url": f"{BASE}/"}
PERSONS_SOURCE = {
    "label": "OPMCM rescue portal — person reports",
    "url": f"{BASE}/person-reports",
}
MAP_SOURCE = {"label": "OPMCM rescue portal — help requests", "url": f"{BASE}/"}
CAROUSEL_SOURCE = {"label": "OPMCM rescue portal — photographs", "url": f"{BASE}/"}
DONATIONS_SOURCE = {"label": "OPMCM rescue portal — donations", "url": f"{BASE}/donations"}
LATEST_SOURCE = {"label": "OPMCM rescue portal — latest filings", "url": f"{BASE}/"}
PERSON_MAP_SOURCE = {"label": "OPMCM rescue portal — person reports", "url": f"{BASE}/"}


async def get_government_efforts(limit: int = 20) -> dict[str, Any]:
    """What the government is doing, as the portal logs it."""
    fetched_at = now_iso()

    async def load() -> dict[str, Any]:
        data = await _get_portal_json(f"/api/government-efforts?limit={max(1, limit)}")
        rows = data.get("items") or []
        items = []
        for r in rows:
            title = split_title(r.get("title"))
            body = split_bilingual(r.get("description"))
            items.append(
                {
                    "id": text(r.get("_id")),
                    "title": title["title"],
                    "titleNe": title["titleNe"],
                    "bodyEn": body["en"],
                    "bodyNe": body["ne"],
                    "agency": text(r.get("agency")),
                    "district": text(r.get("district")),
                    "province": text(r.get("province")),
                    "link": text(r.get("link")),
                    "createdAt": text(r.get("createdAt")) or text(r.get("updatedAt")),
                }
            )
        if not items:
            raise RuntimeError("no government-effort entries in the response")
        return {"items": items, "error": None, "source": EFFORTS_SOURCE, "fetchedAt": fetched_at}

    try:
        return await _cached(f"efforts:{limit}", load)
    except Exception as exc:  # noqa: BLE001
        log.warning("rescue_portal_efforts_unavailable", error=str(exc))
        return {"items": [], "error": str(exc), "source": EFFORTS_SOURCE, "fetchedAt": fetched_at}


async def get_emergency_contacts(limit: int = 50) -> dict[str, Any]:
    """The portal's own emergency-contact directory.

    These are the portal's words, English only — it publishes no Nepali twin
    for the name or note. Shown in their own section, attributed to the portal,
    and never folded into the hand-verified national lines Atlas maintains
    separately.
    """
    fetched_at = now_iso()

    async def load() -> dict[str, Any]:
        data = await _get_portal_json(f"/api/emergency-contacts?limit={max(1, limit)}")
        items = []
        for r in data.get("items") or []:
            if r.get("isActive") is False:
                continue
            phones = [p for p in (text(x) for x in (r.get("phones") or [])) if p]
            name = text(r.get("name"))
            if not name or not phones:
                continue
            items.append(
                {
                    "id": text(r.get("_id")),
                    "name": name,
                    "nameNe": text(r.get("name_ne")),
                    "organization": text(r.get("organization")),
                    "category": text(r.get("category")),
                    "phones": phones,
                    "email": text(r.get("email")),
                    "description": text(r.get("description")),
                    "descriptionNe": text(r.get("description_ne")),
                    "district": text(r.get("district")),
                    "isNationwide": bool(r.get("isNationwide")),
                    "available24x7": bool(r.get("available24x7")),
                }
            )
        if not items:
            raise RuntimeError("no emergency contacts in the response")
        return {"items": items, "error": None, "source": CONTACTS_SOURCE, "fetchedAt": fetched_at}

    try:
        return await _cached(f"contacts:{limit}", load)
    except Exception as exc:  # noqa: BLE001
        log.warning("rescue_portal_contacts_unavailable", error=str(exc))
        return {"items": [], "error": str(exc), "source": CONTACTS_SOURCE, "fetchedAt": fetched_at}


# ─── The missing-and-found register ──────────────────────────────────────────
#
# Every record is a named living person, filed by a relative or imported from a
# District Administration Office. Nothing here is merged with the NDRRMA
# register or the community bulletin — the same person may sit on several lists
# under different spellings, and reconciling them by machine would either hide
# someone still missing or announce a reunion that has not happened.

# The portal's page size ceiling. Asking for more silently returns 500.
PERSON_PAGE = 500
# Enough pages for four times the current register, and a stop either way.
PERSON_MAX_PAGES = 60
# Breathing room between pages. Seventeen requests fired back to back earns a
# 429 from this portal — "Too many requests. Please slow down." — which costs
# the whole register for that cycle. Four seconds spread across a ten-minute
# cycle is nothing to us and far gentler on a government service everyone else
# is also reading.
PERSON_PAGE_PAUSE_S = 0.25
# How long the whole sweep may take before it settles for what it has.
#
# Seventeen pages, each able to spend 20s on a timeout and retry once, is a
# worst case of roughly twelve minutes — longer than the refresh interval
# itself. A cycle stuck there never finishes, so the desk's timestamp stops
# moving while the schedule quietly skips tick after tick. A partial register
# is far better than a stalled desk: the caller reports how many rows it read
# against the total the portal states, and the page says so.
PERSON_SWEEP_BUDGET_S = 90.0


def person_row(row: dict[str, Any], fallback_type: str | None) -> dict[str, Any]:
    """One person report, as the portal published it."""
    images = row.get("images")
    first_image = images[0] if isinstance(images, list) and images else row.get("imageUrl")
    return {
        "id": text(row.get("_id")),
        "type": text(row.get("type")) or fallback_type,
        "name": text(row.get("fullName")),
        "age": text(row.get("approximateAge")),
        "gender": text(row.get("gender")),
        "place": text(row.get("locationText")),
        "eventAt": text(row.get("eventAt")) or text(row.get("createdAt")),
        "description": text(row.get("description")),
        "status": text(row.get("status")),
        "daoStatus": text(row.get("daoStatus")),
        "daoOffice": text(row.get("daoOffice")),
        "origin": text(row.get("source")),
        # The portal ships a base64 thumbnail inline on rows that have a
        # photograph. Deliberately dropped: at eight thousand rows those data
        # URIs are tens of megabytes, and the same photograph is available as a
        # URL, which the media proxy streams on demand.
        "image": absolute(first_image),
    }


async def _collect_persons(query: str) -> dict[str, Any]:
    """Page through the register until the portal runs out of rows.

    Termination is decided by three things — the stated total reached, a short
    page, or the page cap — because during a live response the register is
    being written to while it is being read, and `total` moves between requests.
    """
    items: list[dict[str, Any]] = []
    total: int | None = None
    deadline = time.monotonic() + PERSON_SWEEP_BUDGET_S

    for page in range(1, PERSON_MAX_PAGES + 1):
        if time.monotonic() > deadline:
            log.warning(
                "person_register_budget_spent",
                read=len(items),
                total=total,
                detail="returning a partial register rather than holding up the cycle",
            )
            break
        if page > 1:
            await asyncio.sleep(PERSON_PAGE_PAUSE_S)

        data = await _get_portal_json(
            f"/api/person-reports?{query}&page={page}&limit={PERSON_PAGE}"
        )
        rows = data.get("items") or []
        items.extend(rows)
        if isinstance(data.get("total"), int):
            total = data["total"]
        if not rows or len(rows) < PERSON_PAGE:
            break
        if total is not None and len(items) >= total:
            break

    return {"rows": items, "total": total}


async def get_person_reports(
    type_: str | None = None, status: str = "open"
) -> dict[str, Any]:
    """One half of the missing-and-found register, in full."""
    fetched_at = now_iso()

    async def load() -> dict[str, Any]:
        from urllib.parse import quote

        params = "&".join(
            p
            for p in (
                f"status={quote(status)}" if status else None,
                f"type={quote(type_)}" if type_ else None,
            )
            if p
        )
        collected = await _collect_persons(params)
        return {
            "items": [person_row(r, type_) for r in collected["rows"]],
            "total": collected["total"],
            "error": None,
            "source": PERSONS_SOURCE,
            "fetchedAt": fetched_at,
        }

    try:
        return await _cached(f"persons:{type_}:{status}", load)
    except Exception as exc:  # noqa: BLE001
        log.warning("rescue_portal_persons_unavailable", type=type_, error=str(exc))
        return {
            "items": [],
            "total": None,
            "error": str(exc),
            "source": PERSONS_SOURCE,
            "fetchedAt": fetched_at,
        }


async def get_person_register() -> dict[str, Any]:
    """The whole open register, split by the type the portal filed each row under.

    Read in one sweep rather than two: the portal's untyped query returns every
    open report, including the handful filed under neither `lost` nor `found`,
    and each row carries its own type. Fetching once and splitting locally means
    the two halves are always the same read of the same register, and no row is
    dropped for being filed oddly.

    This is the register a family searches by name, so it is fetched whole. A
    search covering the first two hundred of eight thousand names is worse than
    no search: it answers "not found" about someone who is on the list.
    """
    fetched_at = now_iso()

    async def load() -> dict[str, Any]:
        collected = await _collect_persons("status=open")
        lost, found, other = [], [], []
        for raw in collected["rows"]:
            row = person_row(raw, None)
            if row["type"] == "lost":
                lost.append(row)
            elif row["type"] == "found":
                found.append(row)
            else:
                # Rows the portal files under neither heading. Kept rather than
                # discarded — an unusual type is still somebody's relative.
                other.append(row)
        return {
            "lost": lost,
            "found": found,
            "other": other,
            # What the portal said the register holds, against what was read.
            "total": collected["total"],
            "fetched": len(collected["rows"]),
            "error": None,
            "source": PERSONS_SOURCE,
            "fetchedAt": fetched_at,
        }

    try:
        return await _cached("persons:register", load)
    except Exception as exc:  # noqa: BLE001
        log.warning("rescue_portal_register_unavailable", error=str(exc))
        return {
            "lost": [],
            "found": [],
            "other": [],
            "total": None,
            "fetched": 0,
            "error": str(exc),
            "source": PERSONS_SOURCE,
            "fetchedAt": fetched_at,
        }


def _coords(node: dict[str, Any]) -> dict[str, float | None]:
    c = (node.get("location") or {}).get("coordinates")
    c = c if isinstance(c, list) else []
    return {
        "lon": c[0] if len(c) > 0 and isinstance(c[0], (int, float)) else None,
        "lat": c[1] if len(c) > 1 and isinstance(c[1], (int, float)) else None,
    }


async def get_help_requests_map(limit: int = 200) -> dict[str, Any]:
    """Geolocated help requests, for the situation map.

    These are requests the public filed — one person in trouble can be the
    subject of several — so they map demand, not casualties.
    """
    fetched_at = now_iso()

    async def load() -> dict[str, Any]:
        data = await _get_portal_json(f"/api/map?limit={max(1, limit)}")
        requests_ = []
        for r in data.get("requests") or []:
            point = _coords(r)
            if not _in_nepal(point["lat"], point["lon"]):
                continue
            requests_.append(
                {
                    "id": text(r.get("_id")),
                    "ref": text(r.get("referenceId")),
                    "title": text(r.get("title")),
                    "problemType": text(r.get("problemType")),
                    "helpTypes": [
                        h for h in (text(x) for x in (r.get("helpTypes") or [])) if h
                    ],
                    "urgency": text(r.get("urgency")),
                    "status": text(r.get("status")),
                    "place": text(r.get("placeName")),
                    **point,
                }
            )
        return {"requests": requests_, "error": None, "source": MAP_SOURCE, "fetchedAt": fetched_at}

    try:
        return await _cached(f"map:{limit}", load)
    except Exception as exc:  # noqa: BLE001
        log.warning("rescue_portal_map_unavailable", error=str(exc))
        return {"requests": [], "error": str(exc), "source": MAP_SOURCE, "fetchedAt": fetched_at}


async def get_carousel() -> dict[str, Any]:
    """The photographs the portal runs on its home page.

    Served from the portal's own API path rather than a file URL, so the
    address is made absolute and the caller signs it through the media proxy —
    Atlas never copies the image.
    """
    fetched_at = now_iso()

    async def load() -> dict[str, Any]:
        data = await _get_portal_json("/api/carousel")
        items = []
        for r in data.get("items") or []:
            if r.get("isActive") is False:
                continue
            image = absolute(r.get("imageUrl"))
            if not image:
                continue
            items.append(
                {
                    "id": text(r.get("_id")),
                    # The portal writes a real caption in both languages. It is
                    # the only description these photographs have, so it is
                    # carried as written.
                    "altEn": text(r.get("altEn")),
                    "altNe": text(r.get("altNe")),
                    "order": order(r.get("order")),
                    "createdAt": text(r.get("createdAt")),
                    "image": image,
                }
            )
        items.sort(key=lambda i: i["order"] if i["order"] is not None else 1e9)
        if not items:
            raise RuntimeError("no carousel photographs in the response")
        return {"items": items, "error": None, "source": CAROUSEL_SOURCE, "fetchedAt": fetched_at}

    try:
        return await _cached("carousel", load)
    except Exception as exc:  # noqa: BLE001
        log.warning("rescue_portal_carousel_unavailable", error=str(exc))
        return {"items": [], "error": str(exc), "source": CAROUSEL_SOURCE, "fetchedAt": fetched_at}


async def get_donation_channels(limit: int = 12) -> dict[str, Any]:
    """The donation channels the Office of the Prime Minister publishes.

    Government relief-fund details read from the government's own portal — but
    they arrive live, and the giving page keeps its reviewed accounts separate
    for that reason. Every field passes through as published; an account the
    portal leaves blank stays blank rather than being filled in from anywhere
    else.
    """
    fetched_at = now_iso()

    async def load() -> dict[str, Any]:
        data = await _get_portal_json(f"/api/donations?limit={max(1, limit)}")
        items = []
        for r in data.get("items") or []:
            if r.get("isActive") is False:
                continue
            qr = text(r.get("qrImage"))
            item = {
                "id": text(r.get("_id")),
                "title": text(r.get("title")),
                "organization": text(r.get("organization")),
                "description": text(r.get("description")),
                "bankName": text(r.get("bankName")),
                "accountName": text(r.get("accountName")),
                "accountNumber": text(r.get("accountNumber")),
                "branch": text(r.get("branch")),
                "swiftCode": text(r.get("swiftCode")),
                "walletName": text(r.get("walletName")),
                "walletId": text(r.get("walletId")),
                # Inline base64 QR, usable as an <img> src verbatim.
                "qrData": data_thumb(qr),
                # Raw absolute URL — the caller signs it through the proxy.
                "qrImage": absolute(qr) if qr and not qr.startswith("data:") else None,
                "priority": order(r.get("priority")),
            }
            # A channel with nothing to pay into is not a channel.
            if item["accountNumber"] or item["walletId"] or item["qrData"] or item["qrImage"]:
                items.append(item)
        items.sort(key=lambda i: i["priority"] if i["priority"] is not None else 1e9)
        if not items:
            raise RuntimeError("no donation channels in the response")
        return {"items": items, "error": None, "source": DONATIONS_SOURCE, "fetchedAt": fetched_at}

    try:
        return await _cached(f"donations:{limit}", load)
    except Exception as exc:  # noqa: BLE001
        log.warning("rescue_portal_donations_unavailable", error=str(exc))
        return {"items": [], "error": str(exc), "source": DONATIONS_SOURCE, "fetchedAt": fetched_at}


async def get_latest_activity(limit: int = 6) -> dict[str, Any]:
    """What has just been filed — requests for help, and offers of it.

    The filer's name and telephone number are deliberately dropped; see the
    privacy note at the top of this module. The inline base64 thumbnail is
    dropped too: this is a ticker of what is being asked for, and a dozen full
    photographs on every refresh would cost far more than they tell a reader.
    """
    fetched_at = now_iso()

    async def load() -> dict[str, Any]:
        data = await _get_portal_json(f"/api/latest?limit={max(1, limit)}")
        requests_ = [
            {
                "id": text(r.get("_id")),
                "ref": text(r.get("referenceId")),
                "title": text(r.get("title")),
                "description": text(r.get("description")),
                "problemType": text(r.get("problemType")),
                "helpTypes": [h for h in (text(x) for x in (r.get("helpTypes") or [])) if h],
                "affectedCount": count(r.get("affectedCount")),
                "urgency": text(r.get("urgency")),
                "status": text(r.get("status")),
                "district": text(r.get("district")),
                "place": text(r.get("placeName")),
                "createdAt": text(r.get("createdAt")),
                **_coords(r),
            }
            for r in (data.get("requests") or [])
        ]
        offers = [
            {
                "id": text(r.get("_id")),
                "ref": text(r.get("referenceId")),
                "title": text(r.get("title")),
                "description": text(r.get("description")),
                # An organisation's name is published as the offer itself; an
                # individual volunteer's is not carried.
                "providerType": text(r.get("providerType")),
                "providerName": None
                if text(r.get("providerType")) == "INDIVIDUAL"
                else text(r.get("providerName")),
                "resourceTypes": [
                    t for t in (text(x) for x in (r.get("resourceTypes") or [])) if t
                ],
                "quantity": count(r.get("quantity")),
                "capacity": text(r.get("capacity")),
                "status": text(r.get("status")),
                "district": text(r.get("district")),
                "place": text(r.get("placeName")),
                "createdAt": text(r.get("createdAt")),
                **_coords(r),
            }
            for r in (data.get("offers") or [])
        ]
        if not requests_ and not offers:
            raise RuntimeError("no recent filings in the response")
        return {
            "requests": requests_,
            "offers": offers,
            "error": None,
            "source": LATEST_SOURCE,
            "fetchedAt": fetched_at,
        }

    try:
        return await _cached(f"latest:{limit}", load)
    except Exception as exc:  # noqa: BLE001
        log.warning("rescue_portal_latest_unavailable", error=str(exc))
        return {
            "requests": [],
            "offers": [],
            "error": str(exc),
            "source": LATEST_SOURCE,
            "fetchedAt": fetched_at,
        }


async def get_person_map_points(limit: int = 200) -> dict[str, Any]:
    """The missing-and-found register as map points.

    The photograph is dropped: a face pinned to a map is a different act from a
    face in a list a relative is searching, and this feed exists to show where
    people are being reported from.
    """
    fetched_at = now_iso()

    async def load() -> dict[str, Any]:
        data = await _get_portal_json(
            f"/api/person-reports?limit={max(1, limit)}&fields=map"
        )
        points = []
        for r in data.get("items") or []:
            point = _coords(r)
            if not _in_nepal(point["lat"], point["lon"]):
                continue
            points.append(
                {
                    "id": text(r.get("_id")),
                    "type": text(r.get("type")),
                    "name": text(r.get("fullName")),
                    "age": text(r.get("approximateAge")),
                    "gender": text(r.get("gender")),
                    "eventAt": text(r.get("eventAt")) or text(r.get("createdAt")),
                    **point,
                }
            )
        return {
            "points": points,
            "error": None,
            "source": PERSON_MAP_SOURCE,
            "fetchedAt": fetched_at,
        }

    try:
        return await _cached(f"personmap:{limit}", load)
    except Exception as exc:  # noqa: BLE001
        log.warning("rescue_portal_person_map_unavailable", error=str(exc))
        return {
            "points": [],
            "error": str(exc),
            "source": PERSON_MAP_SOURCE,
            "fetchedAt": fetched_at,
        }
