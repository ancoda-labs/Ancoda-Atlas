"""The climate-context HTTP surface.

Reads the weekly OWID snapshot, the BIPAD yearly reduce, and the reviewed
glacier/GLOF facts. Does not reach Our World in Data or BIPAD on the request
path.
"""

from typing import Any

from fastapi import APIRouter, Response

from app.core.http_cache import cache_for, no_store
from app.domains.climate import service

router = APIRouter(prefix="/climate", tags=["climate"])

# The underlying CO₂ file moves annually. Ten minutes is plenty; a cold
# snapshot must not be cached or a later first fetch stays invisible.
TTL_S = 600


@router.get("", summary="Climate context — emissions snapshot and reviewed facts")
async def get_climate(response: Response) -> dict[str, Any]:
    payload = service.payload()
    emissions = payload.get("emissions") or {}
    arrived = payload.get("arrived") or {}
    warm = bool(emissions.get("metrics")) and bool(arrived.get("hazards"))
    if warm:
        cache_for(response, edge=TTL_S)
    else:
        no_store(response)
    return payload
