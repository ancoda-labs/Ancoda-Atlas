"""Check that the flood desk's Supabase schema has been applied.

Ported from scripts/migrate.mjs, and it still does not apply anything. Atlas
reaches Supabase over PostgREST, which executes queries and functions but not
DDL, so there is no path from here to a CREATE TABLE. What it can do — and what
actually goes wrong on a new deploy — is tell you whether the tables the desk
needs are reachable with the key you configured, before a reader finds out for
you.

Apply the schema once per project:

    supabase db push        (or paste supabase/migrations/0001_flood_desk.sql
                             into the SQL editor)
"""

import asyncio

from postgrest.types import CountMethod

from app.core.config import settings
from app.core.supabase import get_db

TABLES = ["flood_photos", "flood_photo_reports", "rescue_corrections", "news_digests"]

# A uuid that will never exist. The recount function is being probed for
# presence and permission, not for an effect.
NOWHERE = "00000000-0000-0000-0000-000000000000"


async def check() -> int:
    if not settings.is_db_configured:
        print("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are not both set.")
        print("Copy .env.example to .env and fill them in.")
        print()
        print("This is not fatal. Without them the ground-report photos, the")
        print("rescue corrections and the news digests hide themselves, and the")
        print("rest of Atlas — sweeps, gauges, reviewed relief content — runs.")
        return 1

    db = await get_db()
    assert db is not None  # is_db_configured was just checked

    missing: list[str] = []

    for table in TABLES:
        try:
            # Presence and permission are the whole question; no rows needed.
            await db.table(table).select("id", count=CountMethod.exact, head=True).execute()
            print(f"  ok   {table}")
        except Exception as exc:  # noqa: BLE001 - report every failure, not the first
            missing.append(table)
            print(f"  MISS {table} — {exc}")

    # The recount function is as load-bearing as the tables: without it a
    # flagged photo can never reach the takedown threshold.
    try:
        await db.rpc("flood_photo_recount", {"p_photo_id": NOWHERE, "p_threshold": 3}).execute()
        print("  ok   flood_photo_recount()")
    except Exception as exc:  # noqa: BLE001
        missing.append("flood_photo_recount()")
        print(f"  MISS flood_photo_recount() — {exc}")

    print()
    if not missing:
        print(f"Schema present on {settings.supabase_url}")
        return 0

    print(f"{len(missing)} object(s) missing or unreachable on {settings.supabase_url}.")
    print("Apply supabase/migrations/0001_flood_desk.sql with `supabase db push`")
    print("or by pasting it into the SQL editor, then run this again.")
    return 1


def main() -> int:
    return asyncio.run(check())


if __name__ == "__main__":
    raise SystemExit(main())
