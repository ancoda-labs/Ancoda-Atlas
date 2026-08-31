"""The hazard dashboard's HTTP surface.

Paths mirror what the Node build served, under the /api/v1 prefix:

    /api/data   ->  /api/v1/data
    /api/news   ->  /api/v1/news
"""

from typing import Any

from fastapi import APIRouter, Response

from app.core.http_cache import cache_for, no_store
from app.domains.hazards import service

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
async def get_news(response: Response) -> dict[str, Any]:
    """The hazard headlines, read off the last sweep.

    Served from the sweep rather than fetched per request: the wire is eight
    RSS feeds, and fetching them on a reader's request during a live event is
    how a desk falls over.
    """
    data = service.get_dashboard()
    cache_for(response, edge=CACHE_TTL_S)
    return {
        "news": data.get("news") or [],
        "newsFeed": data.get("newsFeed") or [],
        "impact": data.get("impact") or {"count": 0, "topRegions": [], "headline": None},
        "generatedAt": (data.get("meta") or {}).get("timestamp"),
    }
