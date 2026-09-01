"""Response pieces shared across domains."""

from typing import Any

from pydantic import BaseModel, ConfigDict


class AtlasModel(BaseModel):
    """Base for every response model.

    The frontend is unchanged from the Node build, and its types are camelCase
    — so serialization is camelCase too, and a field named in snake_case here
    still goes out in the shape the UI already reads.
    """

    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=lambda name: "".join(
            part if i == 0 else part.capitalize() for i, part in enumerate(name.split("_"))
        ),
    )


class ErrorBody(AtlasModel):
    code: str
    message: str
    details: dict[str, Any] = {}


class ErrorResponse(AtlasModel):
    error: ErrorBody


class HealthResponse(AtlasModel):
    status: str
    version: str


class ReadinessResponse(AtlasModel):
    status: str
    checks: dict[str, str]
