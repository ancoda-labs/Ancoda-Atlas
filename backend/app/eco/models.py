"""Typed exposure results."""

from datetime import datetime
from typing import Literal

from app.schemas.common import AtlasModel


class ProtectedAreaOverlap(AtlasModel):
    name: str
    designation: str
    overlap_km2: float
    pct_of_pa: float


class LandcoverBreakdown(AtlasModel):
    class_name: str
    area_km2: float


class RamsarOverlap(AtlasModel):
    name: str
    overlap_km2: float


class EcosystemExposure(AtlasModel):
    footprint_source: Literal["polygon", "buffer_estimate"]
    protected_areas: list[ProtectedAreaOverlap]
    landcover_breakdown: list[LandcoverBreakdown]
    ramsar_sites: list[RamsarOverlap]
    layer_vintages: dict[str, int]
    computed_at: datetime
