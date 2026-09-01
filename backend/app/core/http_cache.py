"""Cache headers, in one place.

Ported from src/lib/http-cache.ts. Two rules worth keeping straight:

  A response that carries real, periodically refreshed data can sit at the
  edge for a while — the sweep only moves every fifteen minutes.

  A response that represents an *absence* — no sweep yet, a source down, a
  feature switched off — must never be cached. Otherwise a deployment that
  later gains that data keeps serving the empty version until the TTL expires,
  which during a live response is exactly the wrong failure.
"""

from fastapi import Response


def cache_for(response: Response, *, edge: int, browser: int = 0) -> Response:
    """Allow caching for `edge` seconds, serving stale while revalidating."""
    response.headers["Cache-Control"] = (
        f"public, max-age={browser}, s-maxage={edge}, stale-while-revalidate={edge * 2}"
    )
    return response


def no_store(response: Response) -> Response:
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    return response
