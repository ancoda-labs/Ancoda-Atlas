"""Weekly climate-context refresh.

Our World in Data's CO₂ file changes on the order of a year. The task still
runs weekly so a lagging fetch is retried, and a failure leaves the last good
figures standing with their timestamp rather than blanking the section.
"""

import asyncio
from datetime import datetime, timezone
from typing import Any

from celery.signals import worker_ready

from app.core.celery_app import celery_app
from app.core.logging import configure_logging, get_logger
from app.domains.climate import service
from app.domains.climate.sources.bipad_arrived import fetch_arrived
from app.domains.climate.sources.owid_co2 import fetch_owid_co2

log = get_logger(__name__)

# A week. The file itself is annual; this is how often a failed read is retried.
INTERVAL_S = 7 * 24 * 60 * 60


async def run_arrived_refresh() -> dict[str, Any]:
    """One national BIPAD yearly reduce. Safe to call directly."""
    previous = service.load_arrived()
    result = await fetch_arrived()
    if result.get("error") or not result.get("hazards"):
        message = result.get("error") or "no hazards"
        if previous and previous.get("hazards"):
            payload = service.keep_last_good(previous, message)
            service.persist_arrived(payload)
            log.warning(
                "climate_arrived_stale",
                error=message,
                fetched_at=payload.get("fetchedAt"),
            )
            return payload
        service.persist_arrived(result)
        log.warning("climate_arrived_empty", error=message)
        return result
    service.persist_arrived(result)
    log.info(
        "climate_arrived_ok",
        years=result.get("years"),
        hazards=len(result.get("hazards") or []),
        truncated=bool(result.get("truncated")),
    )
    return result


async def run_climate_refresh() -> dict[str, Any]:
    """One OWID pull. Safe to call directly — the manual script does."""
    previous = service.load_emissions()
    result = await fetch_owid_co2()

    if result.get("error") or not result.get("metrics"):
        message = result.get("error") or "no metrics"
        if previous and previous.get("metrics"):
            payload = service.keep_last_good(previous, message)
            service.persist_emissions(payload)
            log.warning(
                "climate_context_stale",
                error=message,
                year=payload.get("year"),
                fetched_at=payload.get("fetchedAt"),
            )
            return payload
        service.persist_emissions(result)
        log.warning("climate_context_empty", error=message)
        return result

    service.persist_emissions(result)
    log.info(
        "climate_context_ok",
        year=result.get("year"),
        metrics=sorted((result.get("metrics") or {}).keys()),
    )
    return result


@celery_app.task(name="climate.context", queue="sweeps")
def refresh_climate_context() -> dict[str, Any]:
    configure_logging()
    try:
        payload = asyncio.run(run_climate_refresh())
        arrived = asyncio.run(run_arrived_refresh())
    except Exception as exc:  # noqa: BLE001 - the beat schedule must survive
        log.exception("climate_context_failed", error=str(exc))
        return {"ok": False, "error": str(exc)}

    return {
        "ok": not payload.get("error"),
        "year": payload.get("year"),
        "stale": bool(payload.get("stale")),
        "metrics": sorted((payload.get("metrics") or {}).keys()),
        "arrivedYears": arrived.get("years"),
        "arrivedHazards": len(arrived.get("hazards") or []),
        "arrivedStale": bool(arrived.get("stale")),
    }


@worker_ready.connect
def climate_on_worker_start(**_kwargs: Any) -> None:
    """Fill climate context on start if it is missing or older than a week."""
    stored = service.load_emissions()
    age_s = _age_seconds((stored or {}).get("fetchedAt"))
    if stored and stored.get("metrics") and age_s is not None and age_s < INTERVAL_S:
        log.info("cold_start_climate_skipped", reason="recent", age_s=int(age_s))
    else:
        log.info("cold_start_climate_queued")
        refresh_climate_context.apply_async(queue="sweeps")
        return

    arrived = service.load_arrived()
    if not arrived or not arrived.get("hazards"):
        log.info("cold_start_arrived_queued")
        refresh_climate_context.apply_async(queue="sweeps")


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
