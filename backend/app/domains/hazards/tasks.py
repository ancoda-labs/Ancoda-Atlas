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
from app.core.logging import configure_logging, get_logger
from app.domains.hazards.delta.memory import MemoryManager
from app.domains.hazards.sweep import full_briefing
from app.domains.hazards.synthesize import generate_ideas, synthesize

log = get_logger(__name__)


async def _run_cycle() -> dict[str, Any]:
    # 1. Sweep every source.
    raw = await full_briefing()
    runs_store.write_json(runs_store.LATEST, raw)

    # 2. Synthesize into the shape the dashboard renders.
    synthesized = await synthesize(raw)

    # 3. Compare against the previous sweep.
    memory = MemoryManager()
    delta = memory.add_run(synthesized)
    synthesized["delta"] = delta

    # 4. Actionable reads. The rule engine is the fallback; the LLM layer
    #    replaces this when one is configured (see the ai domain).
    synthesized["ideas"] = generate_ideas(synthesized)
    synthesized["ideasSource"] = "rules" if synthesized["ideas"] else "disabled"

    # 5. Publish.
    runs_store.write_json(runs_store.DASHBOARD, synthesized)
    memory.prune_alerted_signals()

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
