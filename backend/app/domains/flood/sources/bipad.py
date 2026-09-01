"""BIPAD Portal — the Government of Nepal disaster information platform.

gauges.py reads BIPAD's river stations. This module reads the rest of the open
API: the incident register (much of it fed straight from Nepal Police
reporting), the loss record attached to each incident, the live DHM alerts, and
the government's own district contact register. It is why Atlas does not scrape
nepalpolice.gov.np — the police figures arrive here as structured data, already
reconciled by the government.

ONE RULE RUNS THROUGH THIS WHOLE MODULE.

BIPAD stores an unfilled loss record as a row of zeros, so "nobody died" and
"nobody has typed the figures in yet" are the same bytes. During a live
response the second is overwhelmingly more likely, and printing a confident 0
next to the word "deaths" on a page a grieving family might open is not a
rounding error. Every aggregate here therefore reports how many incidents
actually carried figures, and callers are expected to say so.
"""

import asyncio
import time
from typing import Any

from app.core.http import is_error, now_iso, safe_fetch
from app.core.logging import get_logger
from app.domains.flood.scope import (
    AFFECTED_DISTRICTS,
    EVENT_START,
    in_corridor,
    is_placeholder,
    phone,
)

log = get_logger(__name__)

BASE = "https://bipadportal.gov.np/api/v1"
UA = (
    "AncodaAtlas/4.0 (Nepal hazard monitoring; "
    "+https://github.com/ancoda-labs/Ancoda-Atlas)"
)
TIMEOUT_S = 20.0
PAGE = 100
HEADERS = {"Accept": "application/json", "User-Agent": UA}

SOURCE = {"label": "BIPAD Portal", "url": "https://bipadportal.gov.np/"}
CONTACTS_SOURCE = {
    "label": "BIPAD Portal — district contacts",
    "url": "https://bipadportal.gov.np/",
}

# BIPAD hazard ids. Flood and landslide are the pair this desk cares about.
HAZARD_FLOOD = 11
HAZARD_LANDSLIDE = 17
HAZARD_HEAVY_RAINFALL = 12
HAZARD_THUNDERBOLT = 23

TTL_S = 3 * 60
_cache: dict[str, tuple[float, Any]] = {}


async def _cached(key: str, loader: Any) -> Any:
    hit = _cache.get(key)
    if hit and (time.monotonic() - hit[0]) < TTL_S:
        return hit[1]
    value = await loader()
    _cache[key] = (time.monotonic(), value)
    return value


async def _get_json(path: str) -> Any:
    data = await safe_fetch(f"{BASE}/{path}", timeout=TIMEOUT_S, headers=HEADERS, retries=1)
    if is_error(data):
        raise RuntimeError(data.error)
    return data


async def _collect(path: str, max_pages: int = 10) -> list[dict[str, Any]]:
    """Page through a list endpoint.

    BIPAD reports `count` as 2^63-1 on every list — a sentinel, not a total — so
    termination is decided by a short page or an absent `next`, never by count.
    """
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


def _coords_of(node: dict[str, Any] | None) -> tuple[float | None, float | None]:
    coords = ((node or {}).get("point") or {}).get("coordinates")
    if isinstance(coords, list) and len(coords) >= 2:
        return coords[1], coords[0]
    return None, None


LOSS_FIELDS = {
    "deaths": "peopleDeathCount",
    "missing": "peopleMissingCount",
    "injured": "peopleInjuredCount",
    "affected": "peopleAffectedCount",
    "familiesAffected": "familyAffectedCount",
    "familiesEvacuated": "familyEvacuatedCount",
    "familiesRelocated": "familyRelocatedCount",
    "livestockLost": "livestockDestroyedCount",
    "housesDestroyed": "infrastructureDestroyedHouseCount",
    "housesAffected": "infrastructureAffectedHouseCount",
    "roadsDestroyed": "infrastructureDestroyedRoadCount",
    "bridgesDestroyed": "infrastructureDestroyedBridgeCount",
    "electricityDestroyed": "infrastructureDestroyedElectricityCount",
}


def normalise_loss(raw: dict[str, Any] | None) -> dict[str, Any] | None:
    """The loss fields Atlas surfaces, mapped off BIPAD's much wider record."""
    if not raw:
        return None

    def n(key: str) -> float:
        """A non-numeric or absent field counts as zero.

        Note this is the ONLY place a zero is manufactured, and it is why
        `reported` below exists: a record of all zeros is indistinguishable
        from one nobody has filled in, so the count of records that carried
        figures travels alongside every total.
        """
        value = raw.get(key)
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return 0
        return value

    loss: dict[str, Any] = {"id": raw.get("id")}
    for out_key, in_key in LOSS_FIELDS.items():
        loss[out_key] = n(in_key)
    loss["economicLoss"] = n("infrastructureEconomicLoss") + n("agricultureEconomicLoss")

    # The distinction the whole module turns on: has anyone filled this in?
    loss["reported"] = any(v > 0 for k, v in loss.items() if k != "id" and isinstance(v, (int, float)))
    return loss


async def get_incidents(
    hazard: int = HAZARD_FLOOD, since: str = EVENT_START, corridor_only: bool = True
) -> list[dict[str, Any]]:
    async def load() -> list[dict[str, Any]]:
        # `expand=loss` returns the loss record inline. Without it every
        # incident needed a second request, which during a live response meant a
        # few hundred extra calls against a portal already under load.
        from urllib.parse import quote

        rows = await _collect(
            f"incident/?hazard={hazard}&incident_on__gt={quote(since)}"
            "&expand=loss&ordering=-incident_on",
            5,
        )
        out = []
        for r in rows:
            lat, lon = _coords_of(r)
            raw_loss = r.get("loss")
            # Expanded, `loss` is the record itself; unexpanded it is just its id.
            expanded = normalise_loss(raw_loss) if isinstance(raw_loss, dict) else None
            incident = {
                "id": r.get("id"),
                "title": r.get("title") or None,
                "titleNe": r.get("titleNe") or None,
                "incidentOn": r.get("incidentOn") or None,
                "reportedOn": r.get("reportedOn") or None,
                "streetAddress": r.get("streetAddress") or None,
                "hazard": r.get("hazard"),
                "lossId": (expanded or {}).get("id")
                or (raw_loss if isinstance(raw_loss, int) else None),
                "loss": expanded,
                # BIPAD's provenance field: 'nepal_police', 'dhm', 'other'.
                "source": r.get("source") or None,
                "verified": bool(r.get("verified")),
                "lat": lat,
                "lon": lon,
            }
            if not corridor_only or in_corridor(lat, lon):
                out.append(incident)
        return out

    return await _cached(f"incidents:{hazard}:{since}:{corridor_only}", load)


async def get_losses(loss_ids: list[int]) -> dict[int, dict[str, Any] | None]:
    """Loss records for a set of incidents, a few at a time."""
    ids = list({i for i in loss_ids if i is not None})
    out: dict[int, dict[str, Any] | None] = {}
    concurrency = 6
    for i in range(0, len(ids), concurrency):
        chunk = ids[i : i + concurrency]
        results = await asyncio.gather(
            *(_get_json(f"loss/{loss_id}/") for loss_id in chunk), return_exceptions=True
        )
        for loss_id, result in zip(chunk, results):
            if not isinstance(result, BaseException):
                out[loss_id] = normalise_loss(result)
    return out


async def get_alerts(limit: int = 40) -> list[dict[str, Any]]:
    """Live DHM alerts, newest first."""

    async def load() -> list[dict[str, Any]]:
        data = await _get_json(f"alert/?limit={limit}&ordering=-started_on")
        rows = data.get("results") if isinstance(data, dict) else None
        rows = rows if isinstance(rows, list) else []
        out = []
        for a in rows:
            lat, lon = _coords_of(a)
            out.append(
                {
                    "id": a.get("id"),
                    "title": a.get("title") or None,
                    "titleNe": a.get("titleNe") or None,
                    "description": a.get("description") or None,
                    "source": a.get("source") or None,
                    "startedOn": a.get("startedOn") or None,
                    "expireOn": a.get("expireOn") or None,
                    "referenceType": a.get("referenceType") or None,
                    "public": bool(a.get("public")),
                    "verified": bool(a.get("verified")),
                    "lat": lat,
                    "lon": lon,
                }
            )
        return out

    return await _cached(f"alerts:{limit}", load)


async def get_corridor_incidents(since: str = EVENT_START) -> dict[str, Any]:
    """Every flood and landslide incident logged since `since`, with whatever
    loss figures have actually been entered."""
    fetched_at = now_iso()
    try:
        floods, slides = await asyncio.gather(
            get_incidents(hazard=HAZARD_FLOOD, since=since),
            get_incidents(hazard=HAZARD_LANDSLIDE, since=since),
        )
        incidents = sorted(
            [*floods, *slides],
            key=lambda i: str(i.get("incidentOn") or ""),
            reverse=True,
        )

        # Most incidents carry their loss record from `expand=loss`; only the
        # stragglers are fetched one by one.
        missing = [i for i in incidents if not i["loss"] and i["lossId"] is not None]
        losses = await get_losses([i["lossId"] for i in missing])
        for incident in missing:
            incident["loss"] = losses.get(incident["lossId"])

        with_figures = [i for i in incidents if (i.get("loss") or {}).get("reported")]

        def total(key: str) -> int:
            return sum((i.get("loss") or {}).get(key, 0) for i in with_figures)

        return {
            "incidents": incidents,
            "totals": {
                # Explicitly the tally of what BIPAD holds, not the national
                # toll. The official toll lives in reviewed content and is
                # sourced separately.
                "incidentCount": len(incidents),
                "incidentsWithFigures": len(with_figures),
                "incidentsAwaitingFigures": len(incidents) - len(with_figures),
                "deaths": total("deaths"),
                "missing": total("missing"),
                "injured": total("injured"),
                "affected": total("affected"),
                "familiesAffected": total("familiesAffected"),
                "familiesEvacuated": total("familiesEvacuated"),
                "familiesRelocated": total("familiesRelocated"),
                "housesDestroyed": total("housesDestroyed"),
                "bridgesDestroyed": total("bridgesDestroyed"),
                "roadsDestroyed": total("roadsDestroyed"),
                "economicLoss": total("economicLoss"),
            },
            "error": None,
            "source": SOURCE,
            "fetchedAt": fetched_at,
        }
    except Exception as exc:  # noqa: BLE001
        log.warning("bipad_incidents_unavailable", error=str(exc))
        return {
            "incidents": [],
            "totals": None,
            "error": str(exc) or exc.__class__.__name__,
            "source": SOURCE,
            "fetchedAt": fetched_at,
        }


# ─── The local government's own contact register ─────────────────────────────
#
# BIPAD holds a contact list per district: the Chief District Officer, the
# district's disaster focal person, municipal police chiefs, ward officers. It
# is the government's own register of who is answering the phone in each
# affected district, kept by the same portal the incident data comes from.
#
# What is NOT done here: no number is presented as verified by Atlas. The page
# labels these as the portal's own register and says it has not rung them.


async def get_district_contacts() -> dict[str, Any]:
    """Live official contacts for the affected districts.

    A contact with no dialable number is dropped — the whole point of the
    section is that a reader can press it and be connected. Disaster focal
    persons are flagged so the page can put them first.
    """
    fetched_at = now_iso()

    async def load() -> dict[str, Any]:
        async def for_district(d: Any) -> dict[str, Any]:
            data = await _get_json(f"municipality-contact/?district={d.id}&limit=100")
            rows = data.get("results") if isinstance(data, dict) else None
            rows = rows if isinstance(rows, list) else []
            contacts = []
            for r in rows:
                number = phone(r.get("mobileNumber")) or phone(r.get("workNumber"))
                name = r.get("name") or None
                if not name or not number:
                    continue
                if is_placeholder(name, r.get("position"), number):
                    continue
                contacts.append(
                    {
                        "id": r.get("id"),
                        "name": name,
                        "position": r.get("position") or None,
                        "phone": number,
                        "email": r.get("email") or None,
                        # BIPAD's own flag for the disaster focal person.
                        "drrFocal": bool(r.get("isDrrFocalPerson")),
                    }
                )
            # Focal persons first, then whatever order the portal keeps.
            contacts.sort(key=lambda c: not c["drrFocal"])
            return {"id": d.id, "name": d.en, "nameNe": d.ne, "contacts": contacts}

        settled = await asyncio.gather(
            *(for_district(d) for d in AFFECTED_DISTRICTS), return_exceptions=True
        )
        districts = [
            r
            for r in settled
            if not isinstance(r, BaseException) and r["contacts"]
        ]
        if not districts:
            raise RuntimeError("no district contacts in the response")
        return {"districts": districts, "error": None, "source": CONTACTS_SOURCE, "fetchedAt": fetched_at}

    try:
        return await _cached("district-contacts", load)
    except Exception as exc:  # noqa: BLE001
        log.warning("bipad_contacts_unavailable", error=str(exc))
        return {
            "districts": [],
            "error": str(exc) or exc.__class__.__name__,
            "source": CONTACTS_SOURCE,
            "fetchedAt": fetched_at,
        }
