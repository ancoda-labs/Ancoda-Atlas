"""The hazard dashboard's HTTP surface.

Paths mirror what the Node build served, under the /api/v1 prefix:

    /api/data   ->  /api/v1/data
    /api/news   ->  /api/v1/news
"""

from typing import Any

from fastapi import APIRouter, Response

from app.core.http_cache import cache_for, no_store
from app.domains.hazards import service
from app.domains.hazards.sources import bipad_telemetry
from app.domains.news import ledger
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


@router.get("/news/ledger.csv", summary="Every headline Atlas has shown, as CSV")
async def get_news_ledger() -> Response:
    """The collected-news table behind issue #37.

    Served as a file a spreadsheet can pull directly rather than as JSON: the
    point of the ledger is to be scored by hand, and Google Sheets' IMPORTDATA
    takes a CSV URL and nothing else. See docs/news-ledger.md.

    The worker appends to this file; this route only reads it, so the export
    can never be the thing that creates a row.
    """
    return cache_for(
        Response(
            ledger.read_csv(),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": 'attachment; filename="atlas-news-ledger.csv"'},
        ),
        edge=60,
    )


@router.get("/bipad", summary="BIPAD live telemetry layer for the dashboard map")
async def get_bipad(response: Response) -> dict[str, Any]:
    """River gauges, rain stations, alerts, incidents and earthquakes for the map."""
    payload = await bipad_telemetry.get_bipad_telemetry()
    cache_for(response, edge=180)
    return payload
