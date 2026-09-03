"""The versioned API surface.

Domain routers are mounted here as each one is ported. Route paths deliberately
mirror the ones the Node build served — /data, /news, /flood and the rest — so
the frontend's service layer maps one to one onto what it replaced.
"""

from fastapi import APIRouter

from app.domains.ai.routers import router as ai_router
from app.domains.climate.routers import router as climate_router
from app.domains.flood.routers import router as flood_router
from app.domains.hazards.routers import router as hazards_router
from app.domains.media.routers import router as media_router
from app.domains.photos.routers import router as photos_router

api_router = APIRouter()
api_router.include_router(hazards_router)
api_router.include_router(flood_router)
api_router.include_router(climate_router)
api_router.include_router(media_router)
api_router.include_router(photos_router)
api_router.include_router(ai_router)
