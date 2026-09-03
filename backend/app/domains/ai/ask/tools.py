"""Building the snapshot the sandbox answers from, and reading it.

The model never touches a live source. It is handed a snapshot assembled here
from what the desk already holds, and told that block is data rather than
instructions. Everything it can say has to already be on the desk.
"""

import re
from typing import Any

from app.domains.ai.ask.view import display_name_for_id, district_id_from_label

PLACE_TO_DISTRICT = {
    "betrawati": "nuwakot",
    "बेत्रावती": "nuwakot",
    "syaphrubesi": "rasuwa",
    "timure": "rasuwa",
    "galchhi": "dhading",
    "bidur": "nuwakot",
    "devghat": "chitwan",
    "adamghat": "dhading",
}

# Prompt-injection shapes that reach the model through a headline it did not
# write. The wrapper already tells it the block is data; this removes the most
# direct attempts anyway, because defence in depth costs nothing here.
IMPERATIVE = re.compile(
    r"\b(ignore (all )?previous instructions|disregard (all )?prior"
    r"|you are now|system prompt)\b",
    re.I,
)


def sanitize_headline(title: str) -> str:
    return IMPERATIVE.sub("[removed]", title or "")[:240]


def hazard_slice(hazards: dict[str, Any] | None) -> dict[str, Any]:
    """The dashboard's hazards, trimmed to what an answer can cite.

    Only the fields a template reads. The snapshot is pasted into a prompt, so
    handing over the whole 8 MB sweep would cost tokens on data no answer uses
    and give a prompt-injection payload more room to hide.
    """
    h = hazards or {}
    seismic = h.get("seismic") or {}
    weather = h.get("weather") or {}
    fire = h.get("fire") or {}
    air = h.get("airQuality") or {}
    return {
        "hazardsAsOf": (h.get("meta") or {}).get("timestamp"),
        "seismic": {
            "events24h": seismic.get("events24h"),
            "events7d": seismic.get("events7d"),
            "maxMagnitude": seismic.get("maxMagnitude"),
            "strongest": seismic.get("strongest"),
            "recent": (seismic.get("recent") or [])[:5],
        },
        "weather": {
            "monsoonSeason": weather.get("monsoonSeason"),
            "totalAlerts": weather.get("totalAlerts"),
            "alerts": (weather.get("alerts") or [])[:5],
            "stations": (weather.get("stations") or [])[:5],
        },
        "fire": {
            "status": fire.get("status"),
            "fireSeason": fire.get("fireSeason"),
            "totalDetections": fire.get("totalDetections"),
            "nightDetections": fire.get("nightDetections"),
            "regions": (fire.get("regions") or [])[:5],
        },
        "airQuality": {
            "totalReadings": air.get("totalReadings"),
            "worst": air.get("worst"),
            "kathmandu": air.get("kathmandu"),
            "stations": (air.get("stations") or [])[:5],
        },
    }


def build_snapshot(
    content: dict[str, Any],
    sitrep: dict[str, Any] | None,
    gauges: list[dict[str, Any]],
    news: list[dict[str, Any]],
    hazards: dict[str, Any] | None = None,
    register: dict[str, Any] | None = None,
) -> dict[str, Any]:
    sitrep = sitrep or {}
    reg = (register or {}).get("summary") or {}
    return {
        **hazard_slice(hazards),
        # Counts only. The register holds thousands of named people and none of
        # them belong in a prompt — the box refuses to search names, and the
        # cheapest way to keep that true is to never hand it any.
        "registerTotal": reg.get("total"),
        "registerNepali": reg.get("nepali"),
        "registerForeign": reg.get("foreign"),
        "registerSource": ((register or {}).get("source") or {}).get("label"),
        "registerUrl": ((register or {}).get("source") or {}).get("url"),
        "registerFetchedAt": (register or {}).get("fetchedAt"),
        "sitrepAsOf": sitrep.get("as_of"),
        "sitrepAsOfLabelEn": sitrep.get("as_of_label_en"),
        "sitrepAsOfLabelNe": sitrep.get("as_of_label_ne"),
        "sitrepSources": [
            {"source": s.get("label"), "as_of": sitrep.get("as_of"), "url": s.get("url")}
            for s in (sitrep.get("sources") or [])
        ][:4],
        "discrepancies": sitrep.get("discrepancies") or [],
        "headlines": sitrep.get("headline") or [],
        "breakdowns": [
            {
                "id": b.get("id"),
                "total": b.get("total"),
                "title_en": b.get("title_en"),
                "items": [
                    {
                        "label_en": i.get("label_en"),
                        "label_ne": i.get("label_ne"),
                        "value": i.get("value"),
                    }
                    for i in (b.get("items") or [])
                ],
            }
            for b in (sitrep.get("breakdowns") or [])
        ],
        "gauges": [
            {
                "id": g.get("id"),
                "label": g.get("label"),
                "district": g.get("district"),
                "level": g.get("level"),
                "waterLevel": g.get("waterLevel"),
                "warningLevel": g.get("warningLevel"),
                "dangerLevel": g.get("dangerLevel"),
                "measuredAt": g.get("measuredAt"),
                "stale": g.get("stale"),
            }
            for g in gauges
        ],
        "news": [
            {
                "title": sanitize_headline(n.get("title") or ""),
                "source": n.get("source"),
                "link": n.get("link"),
            }
            for n in news[:8]
        ],
        "helplines": (content.get("helplines") or {}).get("lines") or [],
        "funds": [
            {"name": f.get("name_en") or f.get("name"), "tier": f.get("tier")}
            for f in (content.get("funds") or [])
        ],
        "pathPoints": (content.get("floodPath") or {}).get("points") or [],
    }


TOOLS_FOR_INTENT = {
    "figures": ["get_figures"],
    "worst_districts": ["get_figures"],
    "uncontacted": ["get_figures"],
    "gauges": ["get_gauges"],
    "district": ["get_district", "get_figures"],
    "funds": ["get_relief_funds"],
    "news": ["search_news"],
    "helplines": ["get_faq"],
    "faq": ["get_faq"],
    "rescued": ["get_figures"],
    "nationality": ["get_register"],
    "earthquake": ["get_seismic"],
    "air_quality": ["get_air_quality"],
    "wildfire": ["get_fire"],
    "weather": ["get_weather"],
}


def place_from_question(question: str) -> str | None:
    lowered = (question or "").lower()
    for place, district in PLACE_TO_DISTRICT.items():
        if place in lowered:
            return district
    for name in ("rasuwa", "nuwakot", "dhading", "chitwan", "gorkha", "tanahun"):
        if name in lowered:
            return name
    return None


def tools_for_intent(intent: str, question: str) -> list[dict[str, Any]]:
    names = TOOLS_FOR_INTENT.get(intent, ["get_figures"])
    calls: list[dict[str, Any]] = []
    for name in names:
        if name == "get_district":
            place = place_from_question(question)
            calls.append({"name": name, "args": {"district": place} if place else {}})
        else:
            calls.append({"name": name, "args": {}})
    return calls


def worst_death_districts(snap: dict[str, Any], n: int = 3) -> list[str]:
    deaths = next((b for b in snap["breakdowns"] if b["id"] == "deaths"), None)
    if not deaths:
        return []
    ranked = sorted(deaths["items"], key=lambda i: i.get("value") or 0, reverse=True)
    ids = [district_id_from_label(i.get("label_en") or "") for i in ranked]
    return [i for i in ids if i][:n]


def run_tool(name: str, args: dict[str, Any], snap: dict[str, Any]) -> Any:
    if name == "get_figures":
        return {
            "headlines": snap["headlines"],
            "breakdowns": snap["breakdowns"],
            "as_of": snap["sitrepAsOf"],
            "as_of_label": snap["sitrepAsOfLabelEn"],
            "discrepancies": snap["discrepancies"],
        }
    if name == "get_gauges":
        return {"gauges": snap["gauges"]}
    if name == "get_district":
        district = args.get("district")
        if not district:
            return {"district": None}
        name_en = display_name_for_id(district)
        return {
            "district": name_en,
            "gauges": [
                g for g in snap["gauges"] if (g["district"] or "").lower() == name_en.lower()
            ],
            "pathPoints": [
                p
                for p in snap["pathPoints"]
                if (p.get("district_en") or "").lower() == name_en.lower()
            ],
        }
    if name == "search_news":
        return {"news": snap["news"]}
    if name == "get_relief_funds":
        return {"funds": snap["funds"]}
    if name == "get_faq":
        return {"helplines": snap["helplines"]}
    # The hazard tools all answer from the 15-minute sweep, so each one hands
    # back the sweep's timestamp with the reading. A figure without the moment
    # it was taken is not a figure anyone can act on.
    if name == "get_register":
        return {
            "total": snap.get("registerTotal"),
            "nepali": snap.get("registerNepali"),
            "foreign": snap.get("registerForeign"),
            "source": snap.get("registerSource"),
            "url": snap.get("registerUrl"),
            "as_of": snap.get("registerFetchedAt"),
        }
    if name == "get_seismic":
        return {**snap["seismic"], "as_of": snap.get("hazardsAsOf")}
    if name == "get_air_quality":
        return {**snap["airQuality"], "as_of": snap.get("hazardsAsOf")}
    if name == "get_fire":
        return {**snap["fire"], "as_of": snap.get("hazardsAsOf")}
    if name == "get_weather":
        return {**snap["weather"], "as_of": snap.get("hazardsAsOf")}
    return None


def execute_tools(
    calls: list[dict[str, Any]], snap: dict[str, Any]
) -> list[dict[str, Any]]:
    return [
        {"name": c["name"], "result": run_tool(c["name"], c.get("args") or {}, snap)}
        for c in calls
    ]
