"""The versioned API surface.

Domain routers are mounted here as each one is ported. Route paths deliberately
mirror the ones the Node build served — /flood, /news, /data and the rest — so
the frontend's service layer maps one to one onto what it replaced.
"""

from fastapi import APIRouter

api_router = APIRouter()
