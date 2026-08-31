"""What Atlas can currently do, and what it cannot.

Ported from scripts/diag.mjs. The point is to answer "why is this section
empty" in one command, so it reports which optional services are configured
rather than only whether the process starts.
"""

import sys
from importlib import import_module

from app.core.config import settings
from app.core.openapi_metadata import VERSION

OK = "ok"
OFF = "not configured"


def main() -> int:
    print(f"Ancoda Atlas backend {VERSION}")
    print(f"Python      {sys.version.split()[0]}")
    print(f"Environment {settings.APP_ENV}")
    print(f"Runs dir    {settings.runs_dir}  ({'exists' if settings.runs_dir.is_dir() else 'MISSING'})")
    print()

    print("Imports")
    failed = 0
    for name in ("fastapi", "celery", "httpx", "redis", "supabase", "minio", "structlog"):
        try:
            import_module(name)
            print(f"  {name:<12} {OK}")
        except Exception as exc:  # noqa: BLE001 - report, do not raise
            failed += 1
            print(f"  {name:<12} FAILED — {exc}")
    print()

    print("Services")
    print(f"  redis        {settings.REDIS_URL}")
    print(f"  supabase     {OK if settings.is_db_configured else OFF}")
    print(f"  storage      {OK if settings.is_storage_configured else OFF}")
    print(f"  llm          {settings.LLM_PROVIDER or OFF}")
    print()

    print("Hazard source keys")
    print(f"  FIRMS_MAP_KEY       {'set' if settings.FIRMS_MAP_KEY else 'unset — wildfire empty'}")
    print(f"  RELIEFWEB_APPNAME   {'set' if settings.RELIEFWEB_APPNAME else 'unset — degrades to HDX'}")
    print(f"  YOUTUBE_API_KEY     {'set' if settings.YOUTUBE_API_KEY else 'unset — known channels only'}")
    print()

    print("Production foot-guns")
    for var, why in (
        ("ATLAS_MEDIA_SECRET", "image links break on restart and across replicas"),
        ("ATLAS_IP_SALT", "upload rate limits reset on restart"),
        ("FLOOD_ADMIN_TOKEN", "photo takedown answers 404"),
    ):
        value = getattr(settings, var)
        status = "set" if value else f"UNSET — {why}"
        print(f"  {var:<20} {status}")

    print()
    print("Sweeps and gauges work with none of the optional services above.")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
