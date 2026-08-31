"""The flood desk's store: what the last cycle produced.

Every live source behind the desk is pulled on a schedule rather than on a
reader's request. Two reasons, and the second is the important one:

  Speed. A cold request used to mean waiting on BIPAD, NDRRMA, YouTube's oEmbed
  endpoint and half a dozen RSS feeds in series.

  Survivability. Government portals go down hardest exactly when a disaster
  makes everyone load them at once. Because each source keeps its last good
  result, an upstream outage degrades to slightly older figures with an honest
  timestamp instead of an empty page. A failed source never overwrites good
  data with nothing.
"""

from typing import Any

from app.core import runs_store
from app.core.config import settings
from app.core.logging import get_logger

log = get_logger(__name__)

# Bump this whenever a field in the store changes shape — a renamed key, a new
# required sub-field, a list that gains a third bucket.
#
# Without it the restore below is a trap: it merges whatever is on disk over
# the empty store, so a file written by an older build silently supplies an
# older shape for a key the new code assumes it owns, and the first component
# to read a field that did not exist then crashes the page. That is exactly how
# the rescue page went down for a reader after the OPMCM register grew its
# third list — the previous build's {lost, found} restored cleanly over a shape
# that now also expects `other`.
#
# A mismatched file is discarded rather than migrated. The cost is one cold
# cycle after a deploy; the alternative is a page that throws.
STORE_VERSION = 4

# The keys the cycle fills. Declared so an empty store has every one of them
# present as None rather than absent — a reader destructuring a missing key
# crashes just as hard as one reading a wrong value.
_FEED_KEYS = [
    "river", "corridor", "rescue", "portal", "videos", "sitrep", "damage",
    "dailyBulletin", "pressReleases", "advisories", "govEfforts", "portalContacts",
    "opmcmPersons", "helpRequests", "officialContacts", "featuredPhotos", "popups",
    "carousel", "donationChannels", "latestActivity", "personPoints",
]


def interval_minutes() -> int:
    """Never faster than two minutes.

    Below that this would hammer government portals during the exact event that
    already has everyone else hammering them.
    """
    return settings.flood_refresh_minutes


def empty_store() -> dict[str, Any]:
    return {
        **{key: None for key in _FEED_KEYS},
        "alerts": [],
        "news": [],
        "health": [],
        "lastRunAt": None,
        "nextRunAt": None,
        "intervalMinutes": interval_minutes(),
    }


def load() -> dict[str, Any]:
    """The last cycle's results. Never None — an unwarmed store is simply empty."""
    parsed = runs_store.read_json(runs_store.FLOOD_DESK)
    if not isinstance(parsed, dict):
        return empty_store()

    version = parsed.get("version")
    if version not in (3, STORE_VERSION):
        log.info(
            "flood_store_shape_mismatch",
            found=version,
            expected=STORE_VERSION,
            detail="discarding and starting cold",
        )
        return empty_store()

    store = {**empty_store(), **parsed}

    # The heavy registers live in sidecar files — see persist().
    if not store.get("opmcmPersons"):
        persons = runs_store.read_json(runs_store.FLOOD_PERSONS)
        if persons:
            store["opmcmPersons"] = persons
    rescue = store.get("rescue")
    if not (rescue or {}).get("persons"):
        stored = runs_store.read_json(runs_store.FLOOD_RESCUE)
        if stored:
            store["rescue"] = stored

    log.info("flood_store_restored")
    return store


def persist(store: dict[str, Any]) -> None:
    """Write the store, with the two heavy registers in their own files.

    OPMCM persons is roughly 6MB and the NDRRMA register another 3. Writing
    nine megabytes of JSON inline was stalling the desk route for every open
    tab, so they are split out and the main store stays small.
    """
    rescue = store.get("rescue")
    slim = {
        **store,
        "version": STORE_VERSION,
        "opmcmPersons": None,
        "rescue": {**rescue, "persons": []} if rescue else None,
    }
    runs_store.write_json(runs_store.FLOOD_DESK, slim)

    if store.get("opmcmPersons"):
        runs_store.write_json(runs_store.FLOOD_PERSONS, store["opmcmPersons"])
    if rescue:
        runs_store.write_json(runs_store.FLOOD_RESCUE, rescue)
