"""Refreshing one collector on the request path, when the desk's copy is stale.

THE RULE THIS BENDS, AND HOW FAR.

`api` is otherwise forbidden from touching a government portal while serving a
request: the worker collects on its own cycle and the API only reads runs/.
That rule exists because those portals are slow and go down — daq.hydrology
was unreachable for an afternoon this week — and a request that waits on one
is a request that hangs.

The ask box is the single exception, and it is drawn as narrowly as it can be:

  Never from the question. A reader's text is never turned into a URL, a host,
  or a path. What can be called is the fixed set below, and each entry is an
  existing collector whose endpoint is hardcoded inside its own module. There
  is no new network surface here at all — the same functions the worker calls,
  called earlier.

  Only when the desk's copy is actually stale. A warm snapshot is answered from
  memory; this runs when the data is older than STALE_AFTER_S or missing.

  Once, briefly, and never twice. One attempt, a short timeout, and a
  per-topic cooldown, so a burst of questions cannot turn into a burst of
  requests at a ministry.

  Never fatally. Every collector already answers an error shape rather than
  raising, and a refresh that fails leaves the cached answer standing with its
  original timestamp. A stale figure that says how old it is beats a spinner.
"""

import asyncio
import time
from typing import Any, Awaitable, Callable

from app.core.logging import get_logger

log = get_logger(__name__)

# Older than this and a question may trigger one refresh. The flood cycle runs
# every ten minutes, so anything past twice that means a cycle was missed.
STALE_AFTER_S = 20 * 60

# The floor between two refreshes of the same topic, however many people ask.
COOLDOWN_S = 120

# One attempt. The reader is waiting, and a portal that has not answered in
# eight seconds is not going to rescue this turn.
TIMEOUT_S = 8.0


async def _rescue_register() -> dict[str, Any]:
    from app.domains.flood.sources import ndrrma

    persons = await ndrrma.get_rescued_persons()
    return {"persons": persons, "count": len(persons)}


async def _rescue_portal() -> dict[str, Any]:
    from app.domains.flood.sources import rescue_portal

    return await rescue_portal.get_rescue_portal_stats()


async def _bulletin_sitrep() -> dict[str, Any]:
    from app.domains.flood.sources import bulletin_sitrep

    return await bulletin_sitrep.get_bulletin_sitrep()


# The whole allowlist, and the only thing a question can reach. Adding a row
# here is the one way to widen it — which is the point: it is a code change,
# reviewed, not a string that arrived in a text box.
COLLECTORS: dict[str, Callable[[], Awaitable[dict[str, Any]]]] = {
    "register": _rescue_register,
    "portal": _rescue_portal,
    "sitrep": _bulletin_sitrep,
}

# Which topic each intent would want refreshed. An intent that is not here
# never triggers a fetch, which is most of them — the hazard sweep runs every
# fifteen minutes and the dashboard readings are not worth a ministry round
# trip.
INTENT_TOPIC = {
    "rescued": "register",
    "nationality": "register",
    "uncontacted": "sitrep",
    "figures": "sitrep",
    "worst_districts": "sitrep",
}

_last_attempt: dict[str, float] = {}


def is_stale(as_of_epoch: float | None, now: float | None = None) -> bool:
    """Whether the desk's copy is old enough to be worth a request."""
    if as_of_epoch is None:
        return True
    return ((now or time.time()) - as_of_epoch) > STALE_AFTER_S


def _cooling_down(topic: str, now: float) -> bool:
    last = _last_attempt.get(topic)
    return last is not None and (now - last) < COOLDOWN_S


async def refresh_for_intent(
    intent: str, as_of_epoch: float | None
) -> dict[str, Any] | None:
    """One refresh, or None. Never raises, never blocks longer than TIMEOUT_S."""
    topic = INTENT_TOPIC.get(intent)
    if topic is None:
        return None

    now = time.time()
    if not is_stale(as_of_epoch, now):
        return None
    if _cooling_down(topic, now):
        log.info("ask_live_cooldown", topic=topic, intent=intent)
        return None

    _last_attempt[topic] = now
    collector = COLLECTORS[topic]
    try:
        data = await asyncio.wait_for(collector(), timeout=TIMEOUT_S)
    except (TimeoutError, asyncio.TimeoutError):
        log.warning("ask_live_timeout", topic=topic, seconds=TIMEOUT_S)
        return None
    except Exception as exc:  # noqa: BLE001
        # Collectors answer an error shape rather than raising, so reaching
        # here means something outside them broke. The cached answer stands.
        log.warning("ask_live_failed", topic=topic, error=str(exc))
        return None

    log.info("ask_live_refreshed", topic=topic, intent=intent)
    return {"topic": topic, "data": data, "fetchedAt": now}
