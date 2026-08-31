"""Turns the raw sweep into the shape the dashboard renders.

Ported from src/lib/synthesize.mjs. The output keys are the contract with
frontend/src/types/index.ts and are camelCase throughout — a snake_case slip
here breaks a panel at runtime with no error to catch it.
"""

from typing import Any

from app.domains.hazards.keywords import IMPACT_TERMS
from app.domains.hazards.news_rss import build_news_feed, fetch_all_news

# Tags that mean "untagged" rather than a real district: the outlet fallback
# puts everything it cannot place in Kathmandu, and counting those would make
# the capital top the impact ranking during a flood in Rasuwa.
OUTLET_FALLBACK = {"Kathmandu", "Nepal", "नेपाल"}


def summarize_reported_impact(news: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    news = news or []
    impact = [
        n
        for n in news
        if any(term in (n.get("title") or "").lower() for term in IMPACT_TERMS)
    ]

    by_region: dict[str, int] = {}
    for n in impact:
        region = n.get("region")
        if not region or region in OUTLET_FALLBACK:
            continue
        by_region[region] = by_region.get(region, 0) + 1

    ranked = sorted(by_region.items(), key=lambda kv: kv[1], reverse=True)

    return {
        "count": len(impact),
        "topRegions": [{"region": r, "count": c} for r, c in ranked[:3]],
        "headline": impact[0]["title"] if impact else None,
    }


def _thousands(n: float) -> str:
    """JavaScript's toLocaleString for a plain integer count."""
    return f"{int(n):,}"


def generate_ideas(v2: dict[str, Any]) -> list[dict[str, Any]]:
    """The rule-based actionable reads.

    Each rule fires only when the data clears a threshold meaningful for Nepal
    specifically. `type` mirrors the dashboard's vocabulary: prepare / respond
    / watch. This is the fallback when no LLM is configured.
    """
    ideas: list[dict[str, Any]] = []

    seismic = v2.get("seismic") or {}
    quakes_24h = seismic.get("events24h") or 0
    max_mag = seismic.get("maxMagnitude") or 0
    shallow = len(
        [
            q
            for q in (seismic.get("significant") or [])
            if q.get("depthKm") is not None and q["depthKm"] < 35
        ]
    )

    weather = v2.get("weather") or {}
    alerts = weather.get("alerts") or []
    flood_alerts = len([a for a in alerts if "flood" in a.get("event", "").lower() or "landslide" in a.get("event", "").lower()])
    heat_alerts = len([a for a in alerts if "heat" in a.get("event", "").lower()])
    extreme_alerts = len([a for a in alerts if a.get("severity") == "extreme"])
    monsoon = bool(weather.get("monsoonSeason"))
    stations = sorted(
        weather.get("stations") or [], key=lambda s: s.get("rain5dMm") or 0, reverse=True
    )
    wettest = stations[0] if stations else None

    worst_aqi = ((v2.get("airQuality") or {}).get("worst") or {}).get("aqi") or 0
    fire = v2.get("fire") or {}
    thermal_total = fire.get("totalDetections") or 0
    night_burning = fire.get("nightDetections") or 0
    active_disasters = len((v2.get("relief") or {}).get("disasters") or [])

    # --- Seismic ---
    if max_mag >= 5.5:
        ideas.append(
            {
                "title": "Significant Earthquake — Damage Assessment Window",
                "text": (
                    f"M{max_mag} event recorded in the Nepal region. Expect aftershocks "
                    "for weeks. Priority checks: highway integrity on the Prithvi and "
                    "Araniko corridors, rural district hospital capacity, and school "
                    "building stock."
                ),
                "type": "respond",
                "confidence": "High",
                "horizon": "immediate",
            }
        )
    elif quakes_24h >= 5 and shallow >= 2:
        ideas.append(
            {
                "title": "Seismic Sequence Building",
                "text": (
                    f"{quakes_24h} events in 24h with {shallow} shallow M4.5+ ruptures. "
                    "Shallow clusters precede damaging events more often than deep ones. "
                    "Worth flagging to district preparedness contacts."
                ),
                "type": "watch",
                "confidence": "Medium",
                "horizon": "days",
            }
        )

    # --- Monsoon compound risk: rain plus terrain already shaken ---
    if flood_alerts >= 2 and monsoon:
        seismic_primed = quakes_24h >= 3 or max_mag >= 4.5
        ideas.append(
            {
                "title": (
                    "Compound Hazard — Saturated Slopes on Shaken Ground"
                    if seismic_primed
                    else "Monsoon Flood and Landslide Exposure"
                ),
                "text": (
                    f"{flood_alerts} flood/landslide alerts active during monsoon, with "
                    "recent seismic activity loosening the same slopes. This is the "
                    "combination that closed the Araniko highway in 2015. Treat road "
                    "access as unreliable."
                    if seismic_primed
                    else f"{flood_alerts} flood/landslide alerts active in monsoon season. "
                    "Terai inundation and hill-district road closures are both likely. "
                    "Pre-position relief stock while highways are still open."
                ),
                "type": "respond" if seismic_primed else "prepare",
                "confidence": "High" if seismic_primed else "Medium",
                "horizon": "days",
            }
        )

    # --- Sustained rainfall saturation ---
    if wettest and (wettest.get("rain5dMm") or 0) > 200:
        ideas.append(
            {
                "title": "Slope Saturation Threshold Crossed",
                "text": (
                    f"{wettest['rain5dMm']}mm forecast over five days at {wettest['city']}. "
                    "Nepal's hill slopes fail on cumulative saturation rather than on any "
                    "single day's rainfall, so landslide risk keeps climbing for days "
                    "after the rain stops."
                ),
                "type": "prepare",
                "confidence": "Medium",
                "horizon": "days",
            }
        )

    # --- Extreme weather ---
    if extreme_alerts > 0:
        ideas.append(
            {
                "title": "Extreme Weather Alert Active",
                "text": (
                    f"{extreme_alerts} station{'s are' if extreme_alerts > 1 else ' is'} "
                    "under an extreme-severity weather alert. Confirm against DHM's own "
                    "bulletin before issuing district guidance — Atlas reads model "
                    "output, not the national warning."
                ),
                "type": "respond",
                "confidence": "High",
                "horizon": "immediate",
            }
        )

    # --- Heat ---
    if heat_alerts > 0:
        ideas.append(
            {
                "title": "Terai Heat Stress",
                "text": (
                    f"{heat_alerts} station{'s' if heat_alerts > 1 else ''} at or above "
                    "40°C. Heat casualties in the Terai concentrate among outdoor workers "
                    "and the elderly, and district health posts see the load a day or two "
                    "behind the peak."
                ),
                "type": "prepare",
                "confidence": "Medium",
                "horizon": "days",
            }
        )

    # --- Fire ---
    if thermal_total > 500:
        overnight = (
            f", including {night_burning} overnight — fires running unchecked past dark"
            if night_burning > 20
            else ""
        )
        ideas.append(
            {
                "title": "Active Fire Season",
                "text": (
                    f"{_thousands(thermal_total)} thermal detections nationwide{overnight}. "
                    "Expect smoke to degrade valley air quality and reduce visibility at "
                    "hill airstrips."
                ),
                "type": "watch",
                "confidence": "High",
                "horizon": "days",
            }
        )

    # --- Air quality ---
    if worst_aqi > 150:
        fire_driven = thermal_total > 500
        ideas.append(
            {
                "title": (
                    "Fire-Driven Air Quality Emergency"
                    if fire_driven
                    else "Air Quality Above Unhealthy Threshold"
                ),
                "text": (
                    f"Peak AQI {worst_aqi} alongside {_thousands(thermal_total)} active "
                    "thermal detections. Forest fire smoke, not just traffic and dust. "
                    "School closure and flight disruption at Tribhuvan both become live "
                    "possibilities."
                    if fire_driven
                    else f"Peak AQI {worst_aqi} across monitored cities. Valley inversion "
                    "trapping particulates. Health system load rises with a few days' lag."
                ),
                "type": "respond" if fire_driven else "watch",
                "confidence": "High" if fire_driven else "Medium",
                "horizon": "days",
            }
        )

    # --- Event already under way, seen through district reporting ---
    impact = v2.get("impact") or {"count": 0, "topRegions": []}
    if impact["count"] >= 5:
        where = (
            ", ".join(f"{r['region']} ({r['count']})" for r in impact["topRegions"])
            if impact["topRegions"]
            else "no single district dominant"
        )
        ideas.append(
            {
                "title": "Reported Disaster Impact Under Way",
                "text": (
                    f"{impact['count']} of the last {len(v2.get('news') or [])} hazard "
                    "headlines report casualties, missing persons, displacement or active "
                    f"rescue. Concentration: {where}. Sensor layers describe conditions, "
                    "not consequences — treat this as the live event and confirm scale "
                    "with NDRRMA."
                ),
                "type": "respond",
                "confidence": "High" if impact["count"] >= 12 else "Medium",
                "horizon": "immediate",
            }
        )

    # --- Humanitarian response already under way ---
    if active_disasters > 0:
        ideas.append(
            {
                "title": "Declared Response Operations Active",
                "text": (
                    f"{active_disasters} disaster"
                    f"{'s are' if active_disasters > 1 else ' is'} listed as active for "
                    "Nepal on ReliefWeb. Cluster coordination is already standing, so new "
                    "district requests should route through the existing operation rather "
                    "than opening a parallel one."
                ),
                "type": "respond",
                "confidence": "High",
                "horizon": "weeks",
            }
        )

    return ideas[:8]


async def synthesize(data: dict[str, Any]) -> dict[str, Any]:
    sources = data.get("sources") or {}

    # === Seismic (USGS) ===
    s = sources.get("Seismic") or {}
    seismic = {
        "totalEvents": s.get("totalEvents") or 0,
        "events24h": s.get("events24h") or 0,
        "events7d": s.get("events7d") or 0,
        "maxMagnitude": s.get("maxMagnitude"),
        "strongest": s.get("strongest"),
        "byProvince": s.get("byProvince") or {},
        "significant": (s.get("significant") or [])[:15],
        "recent": [
            {
                "mag": q.get("mag"),
                "place": q.get("place"),
                "time": q.get("time"),
                "lat": q.get("lat"),
                "lon": q.get("lon"),
                "depthKm": q.get("depthKm"),
                "province": q.get("province"),
            }
            for q in (s.get("recent") or [])[:25]
        ],
        "signals": s.get("signals") or [],
    }

    # === Weather — monsoon, flood, landslide, heat ===
    w = sources.get("Weather") or {}
    weather = {
        "monsoonSeason": bool(w.get("monsoonSeason")),
        "totalAlerts": w.get("totalSevereAlerts") or 0,
        "alerts": [
            a
            for a in (w.get("topAlerts") or [])
            if a.get("lat") is not None and a.get("lon") is not None
        ][:12],
        "signals": w.get("signals") or [],
        "stations": [
            {
                "city": st.get("city"),
                "province": st.get("province"),
                "lat": st.get("lat"),
                "lon": st.get("lon"),
                "temperature": st.get("temperature"),
                "precipitation": st.get("precipitation"),
                "rain5dMm": st.get("rain5dMm"),
                "maxDailyRainMm": st.get("maxDailyRainMm"),
            }
            for st in (w.get("stations") or [])
        ],
    }

    # === Wildfire (NASA FIRMS) ===
    f = sources.get("FIRMS") or {}
    fire_regions = [
        {
            "region": h.get("region"),
            "det": h.get("totalDetections") or 0,
            "night": h.get("nightDetections") or 0,
            "hc": h.get("highConfidence") or 0,
            "fires": [
                {"lat": x.get("lat"), "lon": x.get("lon"), "frp": x.get("frp") or 0}
                for x in (h.get("highIntensity") or [])[:8]
            ],
        }
        for h in (f.get("hotspots") or [])
    ]
    fire = {
        "status": f.get("status") or "unavailable",
        "fireSeason": bool(f.get("fireSeason")),
        "totalDetections": f.get("totalDetections") or sum(r["det"] for r in fire_regions),
        "nightDetections": sum(r["night"] for r in fire_regions),
        "highConfidence": sum(r["hc"] for r in fire_regions),
        "regions": fire_regions,
        "signals": f.get("signals") or [],
    }

    # === Air quality — wildfire smoke and valley inversion ===
    a = sources.get("AirQuality") or {}
    air_quality = {
        "totalReadings": a.get("totalReadings") or 0,
        "stations": [
            {
                "location": r.get("location"),
                "province": r.get("state") or r.get("province"),
                "lat": r.get("lat"),
                "lon": r.get("lon"),
                "pm25": r.get("pm25"),
                "aqi": r.get("aqi"),
                "band": r.get("band"),
                "severity": r.get("severity"),
            }
            for r in (a.get("readings") or [])[:10]
        ],
        "worst": a.get("worst"),
        "kathmandu": a.get("kathmandu"),
        "signals": a.get("signals") or [],
    }

    # === Humanitarian response ===
    rw = sources.get("ReliefWeb") or {}
    relief = {
        "disasters": (rw.get("activeDisasters") or [])[:10],
        "reports": (rw.get("latestReports") or [])[:10],
        "error": rw.get("rwError") or rw.get("error"),
    }

    health = [
        {"n": name, "err": bool(src.get("error")), "stale": bool(src.get("stale"))}
        for name, src in sources.items()
    ]

    news = await fetch_all_news()

    return {
        "meta": data.get("atlas"),
        "seismic": seismic,
        "weather": weather,
        "fire": fire,
        "airQuality": air_quality,
        "relief": relief,
        "health": health,
        "news": news,
        "impact": summarize_reported_impact(news),
        "newsFeed": build_news_feed(news),
        "ideas": [],
        "ideasSource": "disabled",
    }
