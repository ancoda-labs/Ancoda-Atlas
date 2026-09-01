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

# One client, one connection pool, for the whole process.
#
# This started as a fresh AsyncClient per request, which is the obvious
# translation of JavaScript's bare fetch() — and it is wrong for the same
# reason it would be wrong there if fetch did not pool internally. A sweep
# makes around forty requests, many of them concurrently to the same handful of
# hosts, and a new client means a new TLS handshake for every one of them.
#
# It was not merely slow. Two concurrent POSTs to ReliefWeb raced their
# handshakes and one came back ConnectTimeout, which the fallback then reported
# as the reason ReliefWeb was unavailable — burying the actual 403 about an
# unapproved appname under a network error that had not really happened.
_client: httpx.AsyncClient | None = None
_client_lock = asyncio.Lock()


async def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        async with _client_lock:
            if _client is None or _client.is_closed:
                _client = httpx.AsyncClient(
                    follow_redirects=True,
                    timeout=httpx.Timeout(DEFAULT_TIMEOUT_S, connect=10.0),
                    limits=httpx.Limits(
                        max_connections=50, max_keepalive_connections=20
                    ),
                    headers={"User-Agent": USER_AGENT},
                )
    return _client


async def close_client() -> None:
    """Release the pool on shutdown. Called from the app lifespan."""
    global _client
    if _client is not None and not _client.is_closed:
        await _client.aclose()
    _client = None


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
            client = await get_client()
            response = await client.get(
                url, headers=request_headers, params=params, timeout=timeout
            )
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
            # str() is empty for several httpx timeout classes; the class name
            # is vague but a blank reason is worse.
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
        client = await get_client()
        response = await client.post(
            url, json=payload, headers=request_headers, timeout=timeout
        )
        if response.status_code >= 400:
            return FetchError(
                error=f"HTTP {response.status_code}: {response.text[:200]}", source=url
            )
        try:
            return response.json()
        except ValueError:
            return RawText(raw_text=response.text[:500])
    except Exception as exc:  # noqa: BLE001
        # An exception's str() is empty for several httpx timeout classes, and
        # an empty reason is worse than a vague one — it reaches the desk as a
        # blank explanation of why a feed is missing.
        reason = str(exc) or exc.__class__.__name__
        log.warning("post_failed", url=url, error=reason)
        return FetchError(error=reason, source=url)


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
