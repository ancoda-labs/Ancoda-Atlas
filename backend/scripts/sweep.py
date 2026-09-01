"""Run one hazard sweep by hand, without waiting for the schedule.

Writes the same runs/ files the worker does, so the dashboard picks it up.
"""

import asyncio

from app.core.logging import configure_logging
from app.domains.hazards.tasks import _run_cycle


def main() -> int:
    configure_logging()
    synthesized = asyncio.run(_run_cycle())
    meta = synthesized.get("meta") or {}
    print()
    print(f"  sources ok   {meta.get('sourcesOk')}/{meta.get('sourcesQueried')}")
    print(f"  quakes 7d    {synthesized['seismic']['events7d']}")
    print(f"  alerts       {synthesized['weather']['totalAlerts']}")
    print(f"  fire         {synthesized['fire']['totalDetections']}")
    print(f"  peak AQI     {(synthesized['airQuality']['worst'] or {}).get('aqi', '--')}")
    print(f"  hazard news  {len(synthesized['news'])}")
    print(f"  impact       {synthesized['impact']['count']}")
    print(f"  reads        {len(synthesized['ideas'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
