"""Run one flood desk refresh by hand, without waiting for the schedule."""

import asyncio

from app.core.logging import configure_logging
from app.domains.flood.tasks import run_flood_refresh


def main() -> int:
    configure_logging()
    store = asyncio.run(run_flood_refresh())
    health = store.get("health") or []
    failed = [h for h in health if not h["ok"]]

    print()
    print(f"  sources ok   {len(health) - len(failed)}/{len(health)}")
    print(f"  last run     {store.get('lastRunAt')}")
    print(f"  next run     {store.get('nextRunAt')}")
    if failed:
        print()
        print("  failed:")
        for f in failed:
            print(f"    {f['key']:<18} {f['error'][:70]}")
            print(f"    {'':18} last good: {f['lastSuccess'] or 'never'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
