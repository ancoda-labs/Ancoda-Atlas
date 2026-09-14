"""Event ecosystem-exposure HTTP surface."""

from fastapi import APIRouter, Response, status

from app.core.http_cache import cache_for, no_store
from app.eco import store

router = APIRouter(prefix="/events", tags=["events"])

TTL_S = 600


@router.get(
    "/{event_id}/ecosystem-exposure",
    summary="Cached ecosystem exposure for one event",
    responses={204: {"description": "Not yet computed or layers unavailable"}},
)
async def get_ecosystem_exposure(event_id: str, response: Response) -> dict | None:
    exposure = store.read_exposure(event_id)
    if exposure is None:
        response.status_code = status.HTTP_204_NO_CONTENT
        no_store(response)
        return None

    cache_for(response, edge=TTL_S)
    return exposure.model_dump(mode="json", by_alias=True)
