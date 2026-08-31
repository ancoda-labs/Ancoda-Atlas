"""The one HTTP client every hazard source uses.

Ported from src/apis/utils/fetch.mjs, and it keeps that module's central
contract: **safe_fetch never raises**. A failed request resolves to a
FetchError, so a caller has to look at what it got before using it. That is
what makes the sweep's `gather` safe — one government portal falling over
degrades its own section and nothing else.

The retry is deliberately shallow. These are public feeds during a disaster,
when everyone else is hammering them too; a source that retries hard is part of
the problem rather than a client that copes with it.
"""

import asyncio
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

import httpx

from app.core.logging import get_logger

log = get_logger(__name__)

USER_AGENT = "Atlas/1.0"
DEFAULT_TIMEOUT_S = 15.0
DEFAULT_RETRIES = 1


@dataclass(frozen=True)
class FetchError:
    """What a failed request resolves to, instead of an exception.

    Sources check `isinstance(result, FetchError)` and return their own stale or
    empty shape. They never substitute a figure.
    """

    error: str
    source: str


@dataclass(frozen=True)
class RawText:
    """A JSON request that got something that is not JSON.

    Carries the first 500 characters so an endpoint answering with an HTML error
    page is debuggable, rather than showing up as an empty object.
    """

    raw_text: str


async def safe_fetch(
    url: str,
    *,
    timeout: float = DEFAULT_TIMEOUT_S,
    retries: int = DEFAULT_RETRIES,
    headers: dict[str, str] | None = None,
    params: dict[str, Any] | None = None,
    as_: Literal["json", "text"] = "json",
) -> Any:
    """Fetch with a timeout, one retry, and no throwing.

    `as_` decides what comes back. Under "json" the body is parsed, and when
    that fails a RawText stub is returned instead — HTML scrapers must ask for
    "text", or an HTML page can never parse and always arrives as the stub.

    Returns the parsed body, a string, RawText, or FetchError.
    """
    last_error = "Unknown error"
    request_headers = {"User-Agent": USER_AGENT, **(headers or {})}

    for attempt in range(retries + 1):
        try:
            async with httpx.AsyncClient(
                timeout=timeout, follow_redirects=True
            ) as client:
                response = await client.get(url, headers=request_headers, params=params)
                if response.status_code >= 400:
                    body = response.text[:200]
                    raise httpx.HTTPStatusError(
                        f"HTTP {response.status_code}: {body}",
                        request=response.request,
                        response=response,
                    )
                text = response.text
                if as_ == "text":
                    return text
                try:
                    return json.loads(text)
                except json.JSONDecodeError:
                    return RawText(raw_text=text[:500])
        except Exception as exc:  # noqa: BLE001 - the whole point is not to raise
            last_error = str(exc) or exc.__class__.__name__
            if attempt < retries:
                # Linear back-off. Sources that need more room set their own
                # timeout rather than this growing a tier.
                await asyncio.sleep(2 * (attempt + 1))

    log.warning("fetch_failed", url=url, error=last_error)
    return FetchError(error=last_error, source=url)


async def post_json(
    url: str,
    payload: dict[str, Any],
    *,
    timeout: float = 30.0,
    headers: dict[str, str] | None = None,
) -> Any:
    """POST a JSON body. Same no-raise contract as safe_fetch.

    Used by the LLM providers and the alerters, none of which should be able to
    take down a sweep by failing.
    """
    request_headers = {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/json",
        **(headers or {}),
    }
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            response = await client.post(url, json=payload, headers=request_headers)
            if response.status_code >= 400:
                return FetchError(
                    error=f"HTTP {response.status_code}: {response.text[:200]}", source=url
                )
            try:
                return response.json()
            except ValueError:
                return RawText(raw_text=response.text[:500])
    except Exception as exc:  # noqa: BLE001
        log.warning("post_failed", url=url, error=str(exc))
        return FetchError(error=str(exc) or exc.__class__.__name__, source=url)


def is_error(value: Any) -> bool:
    """Whether a safe_fetch result is a failure."""
    return isinstance(value, FetchError)


# ─── Time helpers ────────────────────────────────────────────────────────────
# Ported alongside safe_fetch because every source builds its query window with
# them, and they must agree on UTC.


def now_iso() -> str:
    """The current instant, in the shape the frontend's types expect."""
    return _iso(datetime.now(timezone.utc))


def ago(hours: float) -> str:
    return _iso(datetime.now(timezone.utc) - timedelta(hours=hours))


def today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def days_ago(n: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=n)).strftime("%Y-%m-%d")


def _iso(value: datetime) -> str:
    """JavaScript's toISOString: milliseconds, Z suffix.

    Python's isoformat() gives microseconds and +00:00, which is the same
    instant written differently — and the frontend compares these as strings.
    """
    return f"{value:%Y-%m-%dT%H:%M:%S}.{value.microsecond // 1000:03d}Z"
