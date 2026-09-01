"""What "this flood" means, in one place.

Three facts define the desk's scope: when the event started, which districts it
covers, and the box the corridor sits in. They were previously typed into four
files that disagreed — the incident window was 2026-08-25 in one source and
2026-08-20 in both its callers, so the same question asked two ways returned
different answers, and the district list existed in three different lengths.

This is deliberately configuration, not a live feed. No portal publishes "the
districts affected by the Rasuwa flood" as data. The district list is an
editorial judgement about scope, and deriving it from whichever districts
happen to have logged an incident in the last hour would make the map and the
contact list flicker as the register moves.
"""

import os
import re
from typing import NamedTuple

# The day the flood began, as the incident window's lower bound. Override with
# FLOOD_EVENT_START to re-point the desk at a different event without a code
# change.
EVENT_START = os.getenv("FLOOD_EVENT_START") or "2026-08-20"


class District(NamedTuple):
    id: int
    en: str
    ne: str


# Rasuwa down the Trishuli to the Narayani, plus the downstream districts the
# toll is reported for. Ids come from bipadportal.gov.np/api/v1/district/.
AFFECTED_DISTRICTS = [
    District(23, "Rasuwa", "रसुवा"),
    District(25, "Nuwakot", "नुवाकोट"),
    District(26, "Dhading", "धादिङ"),
    District(24, "Sindhupalchok", "सिन्धुपाल्चोक"),
    District(44, "Gorkha", "गोरखा"),
    District(43, "Tanahu", "तनहुँ"),
    District(35, "Chitwan", "चितवन"),
    District(481, "Nawalparasi East", "नवलपरासी पूर्व"),
    District(482, "Nawalparasi West", "नवलपरासी पश्चिम"),
]

# A point inside each district, for pins that only know a name — a headline, or
# a photo tagged with a district rather than a GPS fix. These are district
# centres, not places the water reached; anything placed from this table must be
# drawn as approximate.
DISTRICT_PINS: dict[str, dict[str, float]] = {
    "Rasuwa": {"lat": 28.1167, "lon": 85.3000},
    "Nuwakot": {"lat": 27.9167, "lon": 85.1667},
    "Dhading": {"lat": 27.8667, "lon": 84.9000},
    "Sindhupalchok": {"lat": 27.9500, "lon": 85.6833},
    "Gorkha": {"lat": 28.0000, "lon": 84.6333},
    "Tanahu": {"lat": 27.9500, "lon": 84.2500},
    "Chitwan": {"lat": 27.5833, "lon": 84.5000},
    "Nawalparasi East": {"lat": 27.6700, "lon": 84.1400},
    "Nawalparasi West": {"lat": 27.5300, "lon": 83.6700},
}

# Longer needles first so "Nawalparasi East" wins over "Nawalparasi".
PIN_NEEDLES: list[tuple[str, list[str]]] = [
    ("Nawalparasi East", ["nawalparasi east", "nawalparasi purba", "east nawalparasi", "नवलपरासी पूर्व", "nawalpur", "नवलपुर"]),
    ("Nawalparasi West", ["nawalparasi west", "nawalparasi paschim", "west nawalparasi", "नवलपरासी पश्चिम"]),
    ("Sindhupalchok", ["sindhupalchok", "sindhupalchowk", "सिन्धुपाल्चोक"]),
    ("Nuwakot", ["nuwakot", "नुवाकोट", "betrawati", "बेत्रावती"]),
    ("Dhading", ["dhading", "धादिङ", "galchhi", "घल्छी", "krishna bhir", "कृष्णभीर"]),
    ("Gorkha", ["gorkha", "गोरखा", "ghyalchok", "घ्याल्चोक"]),
    ("Tanahu", ["tanahu", "tanahun", "तनहुँ"]),
    ("Chitwan", ["chitwan", "चितवन", "narayanghat", "नारायणगढ"]),
    # Timure is written both ways in Nepali and the government portal uses the
    # ट spelling, so a post about the border point missed the corridor entirely.
    ("Rasuwa", ["rasuwa", "रसुवा", "timure", "तिमुरे", "टिमुरे", "syaphrubesi", "स्याफ्रु", "bhotekoshi", "bhote koshi", "भोटेकोशी"]),
]


def district_pin_for_text(text: str | None) -> dict[str, object] | None:
    """The district a headline or caption names, as an approximate pin.

    Never a claim that a photograph was taken at those coordinates.
    """
    if not text:
        return None
    hay = f" {str(text).lower()} "
    for district, needles in PIN_NEEDLES:
        if any(needle in hay for needle in needles):
            pin = DISTRICT_PINS.get(district)
            if not pin:
                return None
            return {"district": district, "lat": pin["lat"], "lon": pin["lon"]}
    return None


# How a ministry advisory says it is not about one place. A nationwide warning
# routinely names a corridor district among twenty others — "देशका केही स्थानमा
# आकस्मिक बाढीको सम्भावना" then lists half the country — and matching that one
# district would file a national warning as though it were about this flood.
NATIONWIDE_PHRASES = [
    "देशका",
    "देशभर",
    "देशभरि",
    "विभिन्न स्थानमा",
    "विभिन्न भूभागमा",
    "nationwide",
    "across the country",
    "various parts of the country",
]


def is_nationwide(text: str | None) -> bool:
    """Whether a post announces itself as covering the whole country."""
    if not text:
        return False
    lowered = text.lower()
    return any(phrase in lowered for phrase in NATIONWIDE_PHRASES)


def describes_corridor(title: str | None, body: str | None) -> str | None:
    """The corridor district a post is about, or None if it is about elsewhere.

    "Names a corridor district" and "is about this flood" are different
    questions, and answering the first as though it were the second is how a
    Mahakali warning ends up on the Bhotekoshi desk. Two rules separate them.

    A corridor place in the **title** is decisive — a ministry titles a post
    with what it is about, so "टिमुरेमा सीसी क्यामेरा जडान" is this flood no
    matter what the body goes on to mention.

    Otherwise the body decides, unless the post has already said it covers the
    country. A national advisory that lists Nuwakot among twenty districts is
    not corridor news.

    This deliberately under-claims. A corridor post that happens to use a
    nationwide phrase is shown under the wrong heading, which costs a reader
    one extra glance; a national warning shown as Bhotekoshi news would be read
    as saying something about this flood that nobody said.
    """
    from_title = district_pin_for_text(title)
    if from_title:
        return str(from_title["district"])

    if is_nationwide(f"{title or ''} {body or ''}"):
        return None

    from_body = district_pin_for_text(body)
    return str(from_body["district"]) if from_body else None


class BBox(NamedTuple):
    min_lat: float
    max_lat: float
    min_lon: float
    max_lon: float


# BIPAD's own `district` filter is unreliable on the incident endpoint, so an
# incident's membership is decided from its coordinates: the Trishuli catchment
# from the Tibet border down to the Narayani confluence.
CORRIDOR_BBOX = BBox(min_lat=27.4, max_lat=28.6, min_lon=84.3, max_lon=85.9)


def in_corridor(lat: float | None, lon: float | None) -> bool:
    if lat is None or lon is None:
        return False
    return (
        CORRIDOR_BBOX.min_lat <= lat <= CORRIDOR_BBOX.max_lat
        and CORRIDOR_BBOX.min_lon <= lon <= CORRIDOR_BBOX.max_lon
    )


# ─── Directory hygiene ───────────────────────────────────────────────────────

_PLACEHOLDER_WORDS = re.compile(r"\b(test|demo|dummy|sample|asdf)\b", re.I)
_REPEATED_DIGIT = re.compile(r"^(\d)\1+$")
_SEQUENCE = re.compile(r"123456|1234567")


def is_placeholder(name: str | None, position: str | None, number: str) -> bool:
    """A row somebody left behind while testing the portal.

    BIPAD's Nuwakot list carries a "Test / Test / 9811123456" entry. On an
    ordinary directory that is noise; on a page a person in trouble is dialling
    from, it is a wasted call.
    """
    text = f"{name or ''} {position or ''}".strip()
    if _PLACEHOLDER_WORDS.search(text):
        return True
    return bool(_REPEATED_DIGIT.match(number) or _SEQUENCE.search(number))


def phone(value: object) -> str | None:
    """A phone number reduced to digits, or None if there is nothing dialable."""
    if not isinstance(value, str):
        return None
    trimmed = re.sub(r"[^\d+]", "", value)
    return trimmed if len(trimmed) >= 6 else None
