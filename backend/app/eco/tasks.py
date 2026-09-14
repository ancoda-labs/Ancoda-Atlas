"""Worker-side exposure computation."""

from __future__ import annotations

from typing import Any

from app.core.celery_app import celery_app
from app.core.logging import configure_logging, get_logger
from app.eco import store
from app.eco.exposure import compute_from_footprint_record
from app.eco.footprint import DEFAULT_EVENT_ID, persist_buffer_footprint

log = get_logger(__name__)


def run_exposure_for_event(event_id: str) -> dict[str, Any]:
    footprint = store.read_footprint(event_id)
    if not footprint:
        return {"ok": False, "reason": "no_footprint", "eventId": event_id}

    exposure = compute_from_footprint_record(footprint)
    store.write_exposure(event_id, exposure)
    log.info(
        "eco_exposure_computed",
        event_id=event_id,
        has_exposure=exposure is not None,
        footprint_source=footprint.get("source"),
    )
    return {"ok": True, "eventId": event_id, "hasExposure": exposure is not None}


@celery_app.task(name="eco.exposure", queue="sweeps")
def compute_eco_exposure(event_id: str = DEFAULT_EVENT_ID) -> dict[str, Any]:
    configure_logging()
    try:
        return run_exposure_for_event(event_id)
    except Exception as exc:  # noqa: BLE001
        log.exception("eco_exposure_failed", event_id=event_id, error=str(exc))
        return {"ok": False, "eventId": event_id, "error": str(exc)}


def schedule_exposure_after_footprint(event_id: str = DEFAULT_EVENT_ID) -> None:
    """Queue exposure recomputation after a footprint write."""
    compute_eco_exposure.apply_async(args=[event_id], queue="sweeps")


def refresh_flood_footprint_and_exposure(event_id: str = DEFAULT_EVENT_ID) -> None:
    """Buffer footprint for the active flood event, then queue exposure."""
    persist_buffer_footprint(event_id)
    schedule_exposure_after_footprint(event_id)
