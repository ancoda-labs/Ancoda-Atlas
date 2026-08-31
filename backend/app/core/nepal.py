"""Nepal geography — the single source of truth for every geo-scoped source.

Ported from src/apis/utils/nepal.mjs. Every bounding box, province and city in
Atlas resolves back to this file. Do not scatter coordinates: a source that
carries its own box drifts from the rest silently, and the symptom is a hazard
that appears on one panel and not another.
"""

from typing import NamedTuple


class BBox(NamedTuple):
    lamin: float
    lomin: float
    lamax: float
    lomax: float


class Point(NamedTuple):
    lat: float
    lon: float


# National bounding box, generous by ~0.2 deg so border districts are not clipped.
NEPAL_BBOX = BBox(lamin=26.3, lomin=79.9, lamax=30.6, lomax=88.3)

# Geographic centre, for radius searches and default map framing.
NEPAL_CENTER = Point(lat=28.35, lon=84.1)

NEPAL_ISO = {"alpha2": "NP", "alpha3": "NPL", "numeric": 524, "name": "Nepal"}

# Nepal sits on the Main Himalayan Thrust. The seismic source widens the
# national box to catch ruptures that shake Nepal from just across the border.
SEISMIC_BBOX = BBox(lamin=25.5, lomin=79.0, lamax=31.5, lomax=89.5)


class Province(NamedTuple):
    label: str
    lamin: float
    lomin: float
    lamax: float
    lomax: float
    capital: str


# The seven federal provinces. Boxes are approximate rectangles that together
# tile the country — good enough to bucket a lat/lon into a province.
PROVINCES: dict[str, Province] = {
    "koshi": Province("Koshi", 26.35, 86.5, 28.15, 88.3, "Biratnagar"),
    "madhesh": Province("Madhesh", 26.3, 84.8, 27.35, 86.9, "Janakpur"),
    "bagmati": Province("Bagmati", 27.0, 84.3, 28.4, 86.4, "Hetauda"),
    "gandaki": Province("Gandaki", 27.5, 82.9, 29.35, 85.2, "Pokhara"),
    "lumbini": Province("Lumbini", 27.3, 81.4, 29.0, 84.4, "Deukhuri"),
    "karnali": Province("Karnali", 28.1, 81.0, 30.45, 83.6, "Birendranagar"),
    "sudurpashchim": Province("Sudurpashchim", 28.3, 79.9, 30.6, 81.8, "Godawari"),
}


class City(NamedTuple):
    label: str
    lat: float
    lon: float
    province: str


# Population and administrative centres — the anchors for weather, air quality
# and news geo-tagging.
CITIES: dict[str, City] = {
    "kathmandu": City("Kathmandu", 27.7172, 85.3240, "bagmati"),
    "pokhara": City("Pokhara", 28.2096, 83.9856, "gandaki"),
    "biratnagar": City("Biratnagar", 26.4525, 87.2718, "koshi"),
    "birgunj": City("Birgunj", 27.0104, 84.8770, "madhesh"),
    "bharatpur": City("Bharatpur", 27.6768, 84.4360, "bagmati"),
    "butwal": City("Butwal", 27.7006, 83.4484, "lumbini"),
    "nepalgunj": City("Nepalgunj", 28.0500, 81.6167, "lumbini"),
    "dhangadhi": City("Dhangadhi", 28.6833, 80.6000, "sudurpashchim"),
    "janakpur": City("Janakpur", 26.7288, 85.9266, "madhesh"),
    "birendranagar": City("Birendranagar", 28.6000, 81.6333, "karnali"),
}


def in_nepal(lat: float | None, lon: float | None) -> bool:
    if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
        return False
    if isinstance(lat, bool) or isinstance(lon, bool):
        return False
    return (
        NEPAL_BBOX.lamin <= lat <= NEPAL_BBOX.lamax
        and NEPAL_BBOX.lomin <= lon <= NEPAL_BBOX.lomax
    )


def province_of(lat: float | None, lon: float | None) -> str | None:
    """Bucket a coordinate into a province key, or None if outside Nepal."""
    if not in_nepal(lat, lon):
        return None
    for key, p in PROVINCES.items():
        if p.lamin <= lat <= p.lamax and p.lomin <= lon <= p.lomax:  # type: ignore[operator]
            return key
    return None


# Keyword set for filtering global text feeds (ReliefWeb, RSS) down to Nepal.
# Kept deliberately tight — "Everest" and "Himalaya" alone pull in too much
# Indian and Chinese coverage without a Nepal token present.
NEPAL_KEYWORDS = [
    "Nepal", "Nepali", "Nepalese", "Kathmandu", "Pokhara", "Biratnagar", "Birgunj",
    "Lalitpur", "Bhaktapur", "Janakpur", "Butwal", "Nepalgunj", "Dhangadhi",
    "Chitwan", "Lumbini", "Terai", "Madhesh", "Koshi", "Gandaki", "Karnali",
    "Bagmati", "Sudurpashchim", "Sherpa", "Solukhumbu", "Mustang", "Dolpa",
    "Rasuwa", "Sindhupalchok", "Gorkha", "Rukum", "Jajarkot",
]


def mentions_nepal(text: str | None) -> bool:
    if not text:
        return False
    return any(keyword in text for keyword in NEPAL_KEYWORDS)
