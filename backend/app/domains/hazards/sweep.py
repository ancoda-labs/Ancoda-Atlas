"""The national hazard sweep orchestrator.

Ported from src/apis/briefing.mjs. Runs every source concurrently, each under
its own timeout, and returns a structured result whether they succeed or not.

Scope: natural hazards only. Earthquakes, monsoon flood and landslide,
wildfire, hazardous air, and the humanitarian response that follows them.

Runnable alone:  python -m app.domains.hazards.sweep
"""

import asyncio
import time
from typing import Any, Awaitable, Callable

from app.core.config import settings
from app.core.http import now_iso
from app.core.logging import get_logger
from app.core.openapi_metadata import VERSION
from app.domains.hazards.sources import airquality, firms, reliefweb, seismic, weather

log = get_logger(__name__)

SOURCE_TIMEOUT_S = 30.0

SOURCES: list[tuple[str, Callable[[], Awaitable[dict[str, Any]]]]] = [
    # === Geophysical hazard ===
    ("Seismic", seismic.briefing),
    # === Hydro-meteorological hazard ===
    ("Weather", weather.briefing),
    # === Wildfire and smoke ===
    ("FIRMS", firms.briefing),
    ("AirQuality", airquality.briefing),
    # === Humanitarian response ===
    ("ReliefWeb", reliefweb.briefing),
]


async def run_source(name: str, fn: Callable[[], Awaitable[dict[str, Any]]]) -> dict[str, Any]:
    """One source, with its own timeout and no ability to raise.

    The timeout is per source rather than for the sweep as a whole, so one
    hanging government portal cannot hold up the four that answered.
    """
    start = time.monotonic()
    try:
        data = await asyncio.wait_for(fn(), timeout=SOURCE_TIMEOUT_S)
        return {
            "name": name,
            "status": "ok",
            "durationMs": int((time.monotonic() - start) * 1000),
            "data": data,
        }
    except asyncio.TimeoutError:
        return {
            "name": name,
            "status": "error",
            "durationMs": int((time.monotonic() - start) * 1000),
            "error": f"Source {name} timed out after {SOURCE_TIMEOUT_S:.0f}s",
        }
    except Exception as exc:  # noqa: BLE001 - a failed source is data, not a crash
        log.warning("source_failed", source=name, error=str(exc))
        return {
            "name": name,
            "status": "error",
            "durationMs": int((time.monotonic() - start) * 1000),
            "error": str(exc) or exc.__class__.__name__,
        }


async def full_briefing() -> dict[str, Any]:
    log.info("sweep_start", sources=len(SOURCES))
    start = time.monotonic()

    results = await asyncio.gather(*(run_source(name, fn) for name, fn in SOURCES))
    total_ms = int((time.monotonic() - start) * 1000)

    ok = [r for r in results if r["status"] == "ok"]
    failed = [r for r in results if r["status"] != "ok"]

    output = {
        "atlas": {
            "version": f"{VERSION}-nepal-hazard",
            "focus": "Nepal",
            "timestamp": now_iso(),
            "totalDurationMs": total_ms,
            "sourcesQueried": len(results),
            "sourcesOk": len(ok),
            "sourcesFailed": len(failed),
            # How often this sweep repeats, so a reader can be told not just
            # how old the figures are but when they next move.
            "refreshIntervalMinutes": settings.REFRESH_INTERVAL_MINUTES,
        },
        "sources": {r["name"]: r["data"] for r in ok},
        "errors": [{"name": r["name"], "error": r["error"]} for r in failed],
        "timing": {r["name"]: {"status": r["status"], "ms": r["durationMs"]} for r in results},
    }

    log.info("sweep_complete", ms=total_ms, ok=len(ok), queried=len(results))
    return output


if __name__ == "__main__":
    import json

    print(json.dumps(asyncio.run(full_briefing()), indent=2, ensure_ascii=False))
