"""Reading the flood desk.

The API never fetches from a government portal. It reads what the worker's
ten-minute cycle wrote, and reports honestly when a section has not been filled
yet.

That is a deliberate change from the Node build, where a cold request fell back
to fetching every source inline. In the split architecture the API is a
separate process that mounts runs/ read-only, so a request-path fetch would
duplicate the worker's job, double the load on portals that are already
struggling, and write nothing anyone else could read. Instead the worker
refreshes the desk as soon as it starts (see tasks.sweep_on_worker_start), so
the cold window is one cycle rather than indefinite — and until then each
section says it is waiting rather than showing a figure nobody produced.
"""

from typing import Any

from app.core.http import now_iso

__all__ = ["desk_payload", "empty_feed", "get_store", "is_warm", "now_iso"]
from app.domains.flood import store as desk_store
from app.domains.flood.content import load_flood_content
from app.domains.flood.merge import merge_damage, merge_sitrep


def get_store() -> dict[str, Any]:
    return desk_store.load()


def is_warm(store: dict[str, Any] | None = None) -> bool:
    """Whether a cycle has ever completed."""
    return bool((store or get_store()).get("lastRunAt"))


def empty_feed(label: str, url: str, reason: str = "awaiting_first_cycle") -> dict[str, Any]:
    """What a section answers before the first cycle.

    `error` carries a reason rather than being null, so the page can say "not
    collected yet" instead of rendering an empty list as though the portal had
    returned nothing.
    """
    return {
        "items": [],
        "error": reason,
        "source": {"label": label, "url": url},
        "fetchedAt": now_iso(),
    }


def desk_payload() -> dict[str, Any]:
    """The overview payload: reviewed content with the live cycle laid over it."""
    store = get_store()
    content = load_flood_content()
    rescue = store.get("rescue") or {}

    return {
        **content,
        "river": store.get("river")
        or {"gauges": [], "error": None, "fetchedAt": now_iso()},
        "sitrep": merge_sitrep(content.get("sitrep"), store.get("sitrep")),
        "damage": merge_damage(content.get("damage"), store.get("damage")),
        # The corridor tally and NDRRMA's rescued totals ride along so the
        # overview can put live government figures beside the reviewed toll.
        # The rescue register itself does not: it is thousands of names, and
        # the page that searches them fetches it on its own route.
        "corridor": store.get("corridor"),
        "rescueSummary": rescue.get("summary"),
        "rescueFetchedAt": rescue.get("fetchedAt"),
        "portal": store.get("portal"),
        "dailyBulletin": store.get("dailyBulletin"),
        "advisories": store.get("advisories"),
        "govEfforts": store.get("govEfforts"),
        "portalContacts": store.get("portalContacts"),
        "popups": store.get("popups"),
        # The cycle's own timings, so every page can say how old its figures
        # are without asking a second route.
        "refreshedAt": store.get("lastRunAt"),
        "nextRefreshAt": store.get("nextRunAt"),
        "refreshIntervalMinutes": store.get("intervalMinutes"),
        "generatedAt": now_iso(),
    }
