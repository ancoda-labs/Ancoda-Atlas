"""The reviewed flood-desk content.

Every fund, helpline and figure under content/bhotekoshi-flood/ has a primary
source on the record. This module only loads and validates arithmetic — it
never fetches, and it never fills a gap with a plausible value.

Read from disk rather than bundled. The Node build static-imported these files
because it deployed to Cloudflare Workers, where there is no filesystem behind
process.cwd(). A long-lived Python process has one, so the set of relief funds
is no longer fixed at build time — dropping a reviewed file into relief-funds/
picks it up on the next reload.
"""

import json
import time
from pathlib import Path
from typing import Any

from app.core.logging import get_logger

log = get_logger(__name__)

CONTENT_DIR = Path(__file__).resolve().parents[3] / "content" / "bhotekoshi-flood"
GEO_DIR = Path(__file__).resolve().parents[3] / "content" / "geo"


# Mtime-aware content cache 
#
# The previous @lru_cache(maxsize=1) loaded each file once and never re-read
# it, so editing a helpline or fund file had no effect until the container
# restarted. This replacement re-stats the source directory every
# _CHECK_INTERVAL_S seconds — a handful of stat() calls on ~15 files — and
# reloads only when a file's mtime has actually changed.  The admin reload
# endpoint calls clear() for immediate effect.

_CHECK_INTERVAL_S = 30

_SENTINEL = object()


def _max_mtime(directory: Path, pattern: str = "**/*.json") -> float:
    """The newest mtime across all matching files, or 0 if none exist."""
    newest = 0.0
    try:
        for p in directory.glob(pattern):
            try:
                newest = max(newest, p.stat().st_mtime)
            except OSError:
                continue
    except OSError:
        pass
    return newest


class _MtimeCache:
    """Cache a computed value; invalidate when source files change on disk."""

    __slots__ = ("_value", "_mtime", "_checked_at", "_directory", "_pattern")

    def __init__(self, directory: Path, pattern: str = "**/*.json") -> None:
        self._value: Any = _SENTINEL
        self._mtime: float = 0.0
        self._checked_at: float = 0.0
        self._directory = directory
        self._pattern = pattern

    def get(self, loader: Any) -> Any:
        now = time.monotonic()
        if self._value is not _SENTINEL and (now - self._checked_at) < _CHECK_INTERVAL_S:
            return self._value

        current_mtime = _max_mtime(self._directory, self._pattern)
        self._checked_at = now

        if self._value is not _SENTINEL and current_mtime == self._mtime:
            return self._value

        # First load, or an mtime changed — reload from disk.
        if self._value is not _SENTINEL:
            log.info("content_reloaded", directory=str(self._directory), trigger="mtime")
        self._value = loader()
        self._mtime = current_mtime
        return self._value

    def clear(self) -> None:
        """Force the next ``get()`` to reload regardless of mtime."""
        self._value = _SENTINEL
        self._mtime = 0.0
        self._checked_at = 0.0


_content_cache = _MtimeCache(CONTENT_DIR)
_funds_cache = _MtimeCache(CONTENT_DIR / "relief-funds", pattern="*.json")
_geo_cache = _MtimeCache(GEO_DIR, pattern="*.json")


def _read(name: str) -> Any:
    path = CONTENT_DIR / name
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except FileNotFoundError:
        log.error("content_missing", file=str(path))
        return None
    except json.JSONDecodeError as exc:
        # A malformed reviewed file is a deploy error, not a runtime condition.
        # Log it loudly; the page renders the section empty rather than wrong.
        log.error("content_unparseable", file=str(path), error=str(exc))
        return None


def _summed(breakdown: dict[str, Any]) -> int:
    return sum((item.get("value") or 0) for item in (breakdown.get("items") or []))


def reconcile(breakdowns: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    """Re-add every breakdown and report the ones that no longer close.

    This is a live public-safety desk: a casualty breakdown whose parts stop
    summing to its stated total means one of the two is wrong, and the page
    says so rather than picking whichever looks better.

    Groups whose parts overlap rather than partition the total opt out with
    ``no_total_check``; for them the arithmetic was never meant to close.
    """
    discrepancies: list[dict[str, Any]] = []
    for breakdown in breakdowns or []:
        if breakdown.get("no_total_check"):
            continue
        total = _summed(breakdown)
        if total != breakdown.get("total"):
            discrepancies.append(
                {"id": breakdown.get("id"), "stated": breakdown.get("total"), "summed": total}
            )

    if discrepancies:
        log.error(
            "sitrep_does_not_reconcile",
            detail="; ".join(
                f"{d['id']} states {d['stated']}, parts sum to {d['summed']}"
                for d in discrepancies
            ),
        )
    return discrepancies


def _load_relief_funds() -> list[dict[str, Any]]:
    """Read every reviewed donation route from disk."""
    funds_dir = CONTENT_DIR / "relief-funds"
    funds: list[dict[str, Any]] = []
    if not funds_dir.is_dir():
        log.error("relief_funds_missing", dir=str(funds_dir))
        return funds

    for path in sorted(funds_dir.glob("*.json")):
        try:
            with path.open("r", encoding="utf-8") as handle:
                fund = json.load(handle)
        except (json.JSONDecodeError, OSError) as exc:
            log.error("fund_unparseable", file=str(path), error=str(exc))
            continue
        if fund.get("tier") == 3 and fund.get("moderation") != "approved":
            continue
        if fund.get("status") == "inactive":
            continue
        funds.append(fund)

    return sorted(funds, key=lambda f: f.get("tier") or 9)


def relief_funds() -> list[dict[str, Any]]:
    """Every reviewed donation route, most-trusted tier first.

    Tier 3 is community-submitted. Nothing ships at tier 3 today, but the gate
    exists so an unreviewed donation link can never reach the page — this is
    money reaching people during a disaster.
    """
    return _funds_cache.get(_load_relief_funds)


def _load_flood_content() -> dict[str, Any]:
    """Build the full content dict from disk."""
    sitrep = _read("sitrep.json") or {}
    if sitrep:
        sitrep = {**sitrep, "discrepancies": reconcile(sitrep.get("breakdowns"))}

    received = _read("relief-received.json") or {}
    if received:
        received = {**received, "discrepancies": reconcile(received.get("breakdowns"))}

    return {
        "site": _read("site.json"),
        "whatHappened": _read("what-happened.json"),
        "alerts": _read("alerts.json"),
        "floodPath": _read("flood-path.json"),
        "helplines": _read("helplines.json"),
        "bankAccounts": _read("bank-accounts.json"),
        "districtContacts": _read("district-contacts.json"),
        "sitrep": sitrep or None,
        "reliefReceived": received or None,
        "reliefNeeded": _read("relief-needed.json"),
        "damage": _read("damage.json"),
        "funds": relief_funds(),
    }


def load_flood_content() -> dict[str, Any]:
    """The reviewed content, cached and invalidated by file mtime."""
    return _content_cache.get(_load_flood_content)


def reload_content() -> dict[str, Any]:
    """Clear all content caches, forcing a full re-read from disk.

    Called by the admin ``POST /content/reload`` endpoint.  The mtime watcher
    picks up edits within ``_CHECK_INTERVAL_S`` seconds on its own; this is
    for when a maintainer wants the change live immediately.
    """
    _content_cache.clear()
    _funds_cache.clear()
    _geo_cache.clear()
    log.info("content_reloaded", trigger="admin")

    # Eagerly reload so the response can confirm what was loaded.
    content = load_flood_content()
    shapes = _district_shapes()
    return {
        "reloaded": True,
        "contentKeys": sorted(content.keys()),
        "funds": len(content.get("funds") or []),
        "districtShapes": len(shapes),
    }


# ─── District lookup ─────────────────────────────────────────────────────────
#
# A gauge's district used to be typed in beside its name. Five of the fourteen
# disagreed with the coordinates BIPAD publishes for the same station, and two
# were badly wrong — "Trishuli at Bhorle" was labelled Nuwakot while its
# coordinates sit in Chitwan, about 75 km away. The map plots by coordinate and
# the table printed the label, so the two contradicted each other and the pin
# looked misplaced.
#
# The district is derived from the position now. A hand-typed label can no
# longer disagree with where the pin lands, because there is one source for both.


def _load_district_shapes() -> list[dict[str, Any]]:
    """Read the district boundary GeoJSON from disk."""
    path = GEO_DIR / "flood-affected-districts.json"
    try:
        with path.open("r", encoding="utf-8") as handle:
            geo = json.load(handle)
    except (FileNotFoundError, json.JSONDecodeError, OSError) as exc:
        log.warning("district_shapes_unavailable", error=str(exc))
        return []

    shapes = []
    for feature in geo.get("features") or []:
        geometry = feature.get("geometry") or {}
        coordinates = geometry.get("coordinates") or []
        if geometry.get("type") == "Polygon":
            rings = coordinates
        else:
            # MultiPolygon: one level deeper.
            rings = [ring for polygon in coordinates for ring in polygon]
        props = feature.get("properties") or {}
        shapes.append(
            {"nameEn": props.get("name_en"), "nameNe": props.get("name_ne"), "rings": rings}
        )
    return shapes


def _district_shapes() -> list[dict[str, Any]]:
    return _geo_cache.get(_load_district_shapes)


def _point_in_ring(lon: float, lat: float, ring: list[list[float]]) -> bool:
    """Ray casting. ``ring`` is [lon, lat] pairs, as GeoJSON stores them."""
    inside = False
    count = len(ring)
    j = count - 1
    for i in range(count):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > lat) != (yj > lat) and lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def district_at(lat: float | None, lon: float | None) -> dict[str, str] | None:
    """The district a coordinate falls in, or None if outside every shape."""
    if lat is None or lon is None:
        return None
    for shape in _district_shapes():
        for ring in shape["rings"]:
            if _point_in_ring(lon, lat, ring):
                return {"en": shape["nameEn"], "ne": shape["nameNe"]}
    return None
