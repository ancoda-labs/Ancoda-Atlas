"""Delete the runtime sweep and desk files.

Ported from scripts/clean.mjs. The flood desk's restore snapshot is on this
list deliberately: it was missing from an earlier version, so a clean followed
by a restart brought the same stale figures straight back — exactly the
confusion this script exists to clear.
"""

import shutil

from app.core import runs_store

FILES = [
    runs_store.LATEST,
    runs_store.DASHBOARD,
    runs_store.FLOOD_DESK,
    runs_store.FLOOD_PERSONS,
    runs_store.FLOOD_RESCUE,
    runs_store.CLIMATE,
    runs_store.CLIMATE_ARRIVED,
]


def main() -> int:
    for name in FILES:
        if runs_store.remove(name):
            print(f"removed: {name}")

    memory = runs_store.runs_dir() / runs_store.MEMORY_DIR
    if memory.is_dir():
        shutil.rmtree(memory, ignore_errors=True)
        print(f"removed: {runs_store.MEMORY_DIR}/")

    print()
    print("Cleared. The next sweep rebuilds them; until it lands the dashboard")
    print("renders its empty skeleton rather than stale figures.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
