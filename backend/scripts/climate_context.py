"""Run one climate-context refresh by hand, without waiting for the schedule."""

import asyncio

from app.core.logging import configure_logging
from app.domains.climate.tasks import run_arrived_refresh, run_climate_refresh


def main() -> int:
    configure_logging()
    payload = asyncio.run(run_climate_refresh())
    arrived = asyncio.run(run_arrived_refresh())
    metrics = payload.get("metrics") or {}
    default = metrics.get(payload.get("defaultMetric") or "cumulative_1750") or {}
    nepal = next((row for row in default.get("rows") or [] if row.get("id") == "nepal"), None)

    print()
    print(f"  year         {payload.get('year') or '—'}")
    print(f"  metrics      {', '.join(sorted(metrics)) or '—'}")
    print(f"  nepal        {nepal.get('value') if nepal else '—'}")
    print(f"  stale        {bool(payload.get('stale'))}")
    print(f"  fetched      {payload.get('fetchedAt') or '—'}")
    if payload.get("error"):
        print(f"  error        {payload['error']}")
    print(f"  arrived      {len(arrived.get('hazards') or [])} hazards, years {arrived.get('windowStart')}–{arrived.get('windowEnd')}")
    if arrived.get("error"):
        print(f"  arrived err  {arrived['error']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
