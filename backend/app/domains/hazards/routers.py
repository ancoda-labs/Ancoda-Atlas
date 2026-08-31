"""The hazard dashboard's HTTP surface.

Paths mirror what the Node build served, under the /api/v1 prefix:

    /api/data   ->  /api/v1/data
    /api/news   ->  /api/v1/news
"""

from typing import Any

from fastapi import APIRouter, Response

from app.core.http_cache import cache_for, no_store
from app.domains.hazards import service
from app.domains.news.cache import NEWS_CACHE_TTL_S, load_news_bundle, load_topic_news

router = APIRouter(tags=["hazards"])

# The sweeper refreshes on an interval, so a minute at the edge costs a reader
# nothing in freshness.
CACHE_TTL_S = 60


@router.get("/data", summary="The synthesized hazard snapshot")
async def get_data(response: Response) -> dict[str, Any]:
    """What the landing dashboard renders.

    Before the first sweep lands this answers an empty skeleton — every
    counter zero, every list empty. That response is deliberately not cached:
    a deployment that later gains a data source must not keep serving zeros.
    """
    if not service.has_swept():
        no_store(response)
        return service.empty_snapshot()

    cache_for(response, edge=CACHE_TTL_S)
    return service.get_dashboard()


@router.get("/news", summary="The disaster-filtered Nepali news wire")
async def get_news(
    response: Response,
    topic: str = "all",
    window: str = "24h",
    limit: int = 48,
    sourceCap: int = 12,  # noqa: N803 - the query parameter the frontend sends
    bundle: bool = False,
) -> dict[str, Any]:
    """Ranked hazard headlines, from the warm cache.

    `bundle=true` returns every dashboard panel at once. That is the shape the
    page asks for: eight separate routes on a high-latency mobile connection
    each pay 200-400ms before any RSS work starts.

    The sweep's own `news` array stays available on /data — it is the
    geo-tagged set the map plots, which is a different thing from these ranked
    per-topic panels.
    """
    if bundle:
        payload = await load_news_bundle(window)
    else:
        payload = await load_topic_news(topic, window, limit, sourceCap)
    cache_for(response, edge=int(NEWS_CACHE_TTL_S))
    return payload
