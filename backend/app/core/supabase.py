"""Supabase, for the parts of the flood desk that must remember something.

Ported from src/lib/db.ts, and keeping its central decision: the database is
optional. Atlas's hazard monitoring — sweeps, gauges, the reviewed relief
content — is file- and API-backed and must keep working on a box with no
database at all. Only the features that need to persist between requests
(ground-report photos, rescue corrections, news digests) depend on this module,
and each hides itself when the connection is unconfigured rather than failing
the page around it.

Why PostgREST rather than a Postgres socket: it is what Atlas already speaks,
the tables are few and the queries are simple, and there is no connection pool
to warm. The cost is that DDL cannot run from here — the schema lives in
supabase/migrations/ and is applied out of band. See scripts/migrate_check.py.

The client is async. A blocking HTTP call inside a route would stall the event
loop for every other reader on the same worker, which during a live response is
exactly when there are most of them.
"""

import asyncio
from datetime import datetime, timezone
from typing import Any, TypeVar

from postgrest.exceptions import APIError
from postgrest.types import CountMethod
from supabase import AsyncClient, AsyncClientOptions, acreate_client

from app.core.config import settings
from app.core.exceptions import ServiceUnavailableError, UpstreamError
from app.core.logging import get_logger

log = get_logger(__name__)

T = TypeVar("T")

_client: AsyncClient | None = None
_lock = asyncio.Lock()


def is_db_configured() -> bool:
    """Both the project URL and the secret key, or the database is off.

    Never the publishable key: every table here has row-level security on with
    no policies, so the browser-facing key can read and write none of it.
    """
    return settings.is_db_configured


async def get_db() -> AsyncClient | None:
    """The shared client, or None when Supabase is not configured."""
    global _client
    if not is_db_configured():
        return None
    if _client is None:
        async with _lock:
            # Re-checked inside the lock: several requests can queue here on a
            # cold worker and only the first should build a client.
            if _client is None:
                _client = await acreate_client(
                    settings.supabase_url,
                    settings.supabase_key,
                    options=AsyncClientOptions(
                        # A service client has no user session to keep. Left on,
                        # the SDK would try to persist and refresh one from
                        # storage that does not exist here.
                        auto_refresh_token=False,
                        persist_session=False,
                    ),
                )
    return _client


async def require_db() -> AsyncClient:
    """The client, or a 503 — for callers past their own configuration check."""
    db = await get_db()
    if db is None:
        raise ServiceUnavailableError(
            "The database is not configured.",
            details={"reason": "database_not_configured"},
        )
    return db


def unwrap(response: Any) -> Any:
    """The rows from a PostgREST response.

    postgrest-py raises APIError rather than returning it in the body, so this
    is thinner than the TypeScript `unwrap` it replaces — but it is still the
    one place that turns a driver exception into an Atlas one, so a failed
    query reads as an upstream failure rather than a 500.
    """
    return response.data


async def run(coro: Any, *, what: str) -> Any:
    """Await a PostgREST call and translate its failure.

    Every query goes through here so that a missing table — the usual symptom
    of an unapplied migration — produces one recognisable error instead of a
    different traceback per call site.
    """
    try:
        return await coro
    except APIError as exc:
        log.warning("postgrest_error", what=what, message=exc.message, code=exc.code)
        raise UpstreamError(
            f"Database query failed: {what}",
            details={"reason": exc.message, "code": exc.code},
        ) from exc


def iso_timestamp(value: str | None) -> str | None:
    """Normalise a Postgres timestamptz to ISO-8601 with a `Z`.

    PostgREST returns `2026-08-28T09:40:00+00:00`, while everything the desk
    produces itself is a `Z`-suffixed UTC string with milliseconds — what
    JavaScript's toISOString gives. Both are the same instant but not the same
    string, so anything that compares or keys on a timestamp has to put the two
    through here first.

    An unparseable value is returned unchanged rather than dropped: a timestamp
    Atlas cannot read is still a timestamp a human can.
    """
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return value
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    utc = parsed.astimezone(timezone.utc)
    return f"{utc:%Y-%m-%dT%H:%M:%S}.{utc.microsecond // 1000:03d}Z"


async def db_healthy() -> bool:
    """True when the database is reachable AND the schema has been applied.

    Counts a table the schema owns rather than pinging the project root: an
    unapplied migration is a database this desk cannot use, and should read as
    unhealthy rather than as configured-and-fine.
    """
    db = await get_db()
    if db is None:
        return False
    try:
        await db.table("flood_photos").select(
            "id", count=CountMethod.exact, head=True
        ).execute()
        return True
    except Exception as exc:  # noqa: BLE001 - a probe reports, it does not raise
        log.warning("db_health_check_failed", error=str(exc))
        return False
