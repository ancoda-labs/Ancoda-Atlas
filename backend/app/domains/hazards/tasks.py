"""The sweep cycle, run by the Celery worker.

This is the only writer of runs/dashboard.json and runs/latest.json. See
app/core/runs_store.py for why that matters.

The cycle is deliberately not transactional. A source that fails is recorded
as failed and the rest of the sweep proceeds — the alternative is that one
government portal being down produces no dashboard at all.
"""

import asyncio
from datetime import datetime, timezone
from typing import Any

from celery.signals import worker_ready

from app.core import runs_store
from app.core.celery_app import celery_app
from app.core.config import settings
from app.core.http import now_iso
from app.core.logging import configure_logging, get_logger
from app.domains.hazards.delta.memory import MemoryManager
from app.domains.hazards.sweep import full_briefing
from app.domains.hazards.synthesize import generate_ideas, synthesize
from app.domains.stream import bus

log = get_logger(__name__)


async def _run_cycle() -> dict[str, Any]:
    # Tell any open dashboard a cycle has started, so it can say "updating now"
    # rather than reporting the last sweep as overdue while this one runs.
    bus.publish_sync({"type": bus.SWEEP_START, "timestamp": now_iso()})

    # 1. Sweep every source.
    raw = await full_briefing()
    runs_store.write_json(runs_store.LATEST, raw)

    # 2. Synthesize into the shape the dashboard renders.
    synthesized = await synthesize(raw)

    # 3. Compare against the previous sweep.
    memory = MemoryManager()
    delta = memory.add_run(synthesized)
    synthesized["delta"] = delta

    # 4. Actionable reads. The LLM writes them when one is configured; the rule
    #    engine is the fallback, and a failed model call falls back rather than
    #    leaving the panel empty.
    from app.domains.ai.ideas import generate_llm_ideas
    from app.domains.ai.providers.factory import get_provider

    provider = get_provider()
    llm_ideas = None
    if provider and provider.is_configured:
        previous = (memory.get_last_run() or {}).get("ideas") or []
        llm_ideas = await generate_llm_ideas(provider, synthesized, delta, previous)

    if llm_ideas:
        synthesized["ideas"] = llm_ideas
        synthesized["ideasSource"] = "llm"
    elif provider and provider.is_configured:
        # Configured but unusable. Distinct from `disabled` so an operator can
        # see the difference between "no key" and "the key is not working".
        synthesized["ideas"] = []
        synthesized["ideasSource"] = "llm-failed"
    else:
        synthesized["ideas"] = generate_ideas(synthesized)
        synthesized["ideasSource"] = "rules" if synthesized["ideas"] else "disabled"

    # 5. Publish.
    runs_store.write_json(runs_store.DASHBOARD, synthesized)
    memory.prune_alerted_signals()

    # The file is written; now tell the API replicas to re-read it. Published
    # after the write, never before, or a listener races the bytes it is being
    # told about.
    bus.publish_sync({"type": bus.UPDATE, "timestamp": now_iso()})

    log.info(
        "sweep_cycle_complete",
        sources_ok=(raw.get("atlas") or {}).get("sourcesOk"),
        news=len(synthesized.get("news") or []),
        ideas=len(synthesized.get("ideas") or []),
        changes=(delta or {}).get("summary", {}).get("totalChanges"),
    )
    return synthesized


@celery_app.task(name="hazards.sweep", queue="sweeps")
def sweep_hazards() -> dict[str, Any]:
    """Run one national hazard sweep.

    Returns a small summary rather than the payload: Celery stores the return
    value in Redis, and a full sweep is megabytes.
    """
    configure_logging()
    try:
        synthesized = asyncio.run(_run_cycle())
    except Exception as exc:  # noqa: BLE001 - the beat schedule must survive a bad cycle
        log.exception("sweep_cycle_failed", error=str(exc))
        return {"ok": False, "error": str(exc)}

    return {
        "ok": True,
        "sourcesOk": (synthesized.get("meta") or {}).get("sourcesOk"),
        "news": len(synthesized.get("news") or []),
        "ideas": len(synthesized.get("ideas") or []),
    }


# ─── Cold start ──────────────────────────────────────────────────────────────


@worker_ready.connect
def sweep_on_worker_start(**_kwargs: Any) -> None:
    """Sweep once when a worker comes up, if the picture is missing or stale.

    Celery Beat does not fire on start — it waits a full interval. Without this
    a fresh box would show the empty skeleton for fifteen minutes after
    `make up`, which the Node sweeper did not do: it ran a cycle immediately and
    then set its interval.

    The staleness guard is the part Node did not have and needs adding here.
    The worker restarts on every code change in development, and sweeping on
    each one would hammer five public feeds for no benefit. A dashboard younger
    than one refresh interval is left alone.
    """
    dashboard = runs_store.read_json(runs_store.DASHBOARD)
    if isinstance(dashboard, dict):
        timestamp = (dashboard.get("meta") or {}).get("timestamp")
        age_s = _age_seconds(timestamp)
        if age_s is not None and age_s < settings.REFRESH_INTERVAL_MINUTES * 60:
            log.info("cold_start_sweep_skipped", reason="recent", age_s=int(age_s))
            return

    log.info("cold_start_sweep_queued")
    sweep_hazards.apply_async(queue="sweeps")


@worker_ready.connect
def refresh_flood_on_worker_start(**_kwargs: Any) -> None:
    """Fill the flood desk on start, if it is missing or stale.

    The API is read-only against runs/ and never fetches from a government
    portal on the request path, so until this runs every desk section reports
    "awaiting first cycle". Beat would not fire for ten minutes. Same staleness
    guard as the sweep, so a code-change restart does not re-pull sixteen
    thousand register rows for nothing.
    """
    from app.domains.flood import store as desk_store
    from app.domains.flood.tasks import refresh_flood_desk

    store = desk_store.load()
    age_s = _age_seconds(store.get("lastRunAt"))
    if age_s is not None and age_s < desk_store.interval_minutes() * 60:
        log.info("cold_start_flood_skipped", reason="recent", age_s=int(age_s))
        return

    log.info("cold_start_flood_queued")
    refresh_flood_desk.apply_async(queue="sweeps")


def _age_seconds(timestamp: str | None) -> float | None:
    if not timestamp:
        return None
    try:
        moment = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    except ValueError:
        return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - moment).total_seconds()
