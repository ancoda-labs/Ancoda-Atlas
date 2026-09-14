"""Local reference-layer paths and availability."""

from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "eco"

PROTECTED_AREAS = DATA_DIR / "protected_areas.geojson"
RAMSAR_SITES = DATA_DIR / "ramsar_sites.geojson"
LANDCOVER_TIF = DATA_DIR / "landcover_nepal.tif"


def any_layer_present() -> bool:
    return PROTECTED_AREAS.is_file() or RAMSAR_SITES.is_file() or LANDCOVER_TIF.is_file()


def layer_vintages() -> dict[str, int]:
    """Reference years for layers that are present.

    Defaults are placeholders until ATTRIBUTION.md records the shipped vintage.
    """
    vintages: dict[str, int] = {}
    if PROTECTED_AREAS.is_file():
        vintages["protected_areas"] = 2020
    if RAMSAR_SITES.is_file():
        vintages["ramsar_sites"] = 2020
    if LANDCOVER_TIF.is_file():
        vintages["landcover_nepal"] = 2019
    return vintages
