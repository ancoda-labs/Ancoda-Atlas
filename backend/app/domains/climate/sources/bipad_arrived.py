"""National BIPAD incident series for the climate What Arrived panel.

Atlas already reads BIPAD for the flood desk. This module pages the same
incident API nationally, then keeps only yearly totals by hazard. Individual
incidents are not stored.

BIPAD stores an unfilled loss record as zeros. Deaths and people-affected
totals therefore travel with how many records actually carried figures.
An absent total is None, never 0.

The year window is a rolling eight calendar years. That is a fetch bound, not
a claim that BIPAD's methodology was stable across it. The panel caption
must say that recorded counts also reflect changing reporting coverage.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote

from app.core.http import now_iso
from app.core.logging import get_logger
from app.domains.flood.sources.bipad import (
    PAGE,
    SOURCE,
    collect_pages,
    normalise_loss,
)

log = get_logger(__name__)

WINDOW_YEARS = 8
MAX_PAGES_PER_YEAR = 12
HAZARD_CAP = 6

# Titles for ids the flood desk already uses, so a bare integer hazard still
# has a name. Anything else takes BIPAD's own title when the field is expanded.
KNOWN_HAZARDS: dict[int, tuple[str, str]] = {
    11: ("Flood", "बाढी"),
    12: ("Heavy rainfall", "अधिक वर्षा"),
    17: ("Landslide", "पहिरो"),
    23: ("Thunderbolt", "चट्याङ"),
}


def window_years(now: datetime | None = None) -> list[int]:
    """Inclusive calendar years covering the last WINDOW_YEARS years."""
    moment = now or datetime.now(timezone.utc)
    end = moment.year
    start = end - (WINDOW_YEARS - 1)
    return list(range(start, end + 1))


def _year_of(stamp: Any) -> int | None:
    if not isinstance(stamp, str) or len(stamp) < 4:
        return None
    try:
        return int(stamp[:4])
    except ValueError:
        return None


def _hazard_meta(raw: Any) -> tuple[str, str, str]:
    if isinstance(raw, dict):
        hid = str(raw.get("id") or raw.get("title") or "other")
        en = (raw.get("titleEn") or raw.get("title") or "").strip() or f"Hazard {hid}"
        ne = (raw.get("titleNe") or "").strip() or en
        return hid, en, ne
    if isinstance(raw, int):
        known = KNOWN_HAZARDS.get(raw)
        if known:
            return str(raw), known[0], known[1]
        return str(raw), f"Hazard {raw}", f"Hazard {raw}"
    return "other", "Other", "Other"


def aggregate(
    incidents: list[dict[str, Any]],
    years: list[int],
) -> list[dict[str, Any]]:
    """Yearly incidents / deaths / affected by hazard. Pure; no I/O."""
    year_index = {year: i for i, year in enumerate(years)}
    n = len(years)
    buckets: dict[str, dict[str, Any]] = {}

    for row in incidents:
        year = _year_of(row.get("incidentOn"))
        if year not in year_index:
            continue
        hid, label_en, label_ne = _hazard_meta(row.get("hazard"))
        slot = year_index[year]
        bucket = buckets.get(hid)
        if bucket is None:
            bucket = {
                "id": hid,
                "labelEn": label_en,
                "labelNe": label_ne,
                "incidents": [0] * n,
                "deaths": [None] * n,
                "affected": [None] * n,
                "deathsRecords": [0] * n,
                "affectedRecords": [0] * n,
            }
            buckets[hid] = bucket
        bucket["incidents"][slot] += 1
        raw_loss = row.get("loss")
        loss = normalise_loss(raw_loss) if isinstance(raw_loss, dict) else None
        if not loss or not loss.get("reported"):
            continue
        deaths = loss.get("deaths") or 0
        affected = loss.get("affected") or 0
        if deaths:
            current = bucket["deaths"][slot]
            bucket["deaths"][slot] = (current or 0) + deaths
            bucket["deathsRecords"][slot] += 1
        if affected:
            current = bucket["affected"][slot]
            bucket["affected"][slot] = (current or 0) + affected
            bucket["affectedRecords"][slot] += 1

    ranked = sorted(
        buckets.values(),
        key=lambda item: sum(item["incidents"]),
        reverse=True,
    )
    return ranked[:HAZARD_CAP]


def empty_arrived(error: str | None = None) -> dict[str, Any]:
    years = window_years()
    return {
        "years": years,
        "hazards": [],
        "windowStart": years[0],
        "windowEnd": years[-1],
        "truncated": False,
        "error": error,
        "stale": True,
        "source": SOURCE,
        "fetchedAt": None,
        "lastAttemptAt": now_iso(),
    }


async def _incidents_for_year(year: int) -> tuple[list[dict[str, Any]], bool]:
    start = quote(f"{year}-01-01T00:00:00+05:45")
    end = quote(f"{year + 1}-01-01T00:00:00+05:45")
    rows = await collect_pages(
        f"incident/?incident_on__gte={start}&incident_on__lt={end}"
        "&expand=hazard,loss&ordering=-incident_on",
        MAX_PAGES_PER_YEAR,
    )
    truncated = len(rows) >= PAGE * MAX_PAGES_PER_YEAR
    return rows, truncated


async def fetch_arrived() -> dict[str, Any]:
    """Page BIPAD nationally and reduce to yearly hazard totals."""
    years = window_years()
    fetched_at = now_iso()
    incidents: list[dict[str, Any]] = []
    truncated = False
    try:
        for year in years:
            rows, year_truncated = await _incidents_for_year(year)
            incidents.extend(rows)
            truncated = truncated or year_truncated
        hazards = aggregate(incidents, years)
        return {
            "years": years,
            "hazards": hazards,
            "windowStart": years[0],
            "windowEnd": years[-1],
            "truncated": truncated,
            "error": None,
            "stale": False,
            "source": SOURCE,
            "fetchedAt": fetched_at,
            "lastAttemptAt": fetched_at,
        }
    except Exception as exc:  # noqa: BLE001
        log.warning("climate_arrived_failed", error=str(exc))
        return empty_arrived(str(exc) or exc.__class__.__name__)
