"""Open-Meteo Air Quality — Nepal PM2.5 / AQI.

Free, no key. Kathmandu regularly ranks among the world's most polluted cities
in the winter inversion and spring wildfire seasons, so this is a first-order
feed rather than a nice-to-have.

Runnable alone:  python -m app.domains.hazards.sources.airquality
"""

import asyncio
from typing import Any, NamedTuple

from app.core.http import is_error, now_iso, safe_fetch
from app.core.nepal import CITIES, PROVINCES, City

BASE = "https://air-quality-api.open-meteo.com/v1/air-quality"


class Band(NamedTuple):
    max: float
    label: str
    severity: str


# US EPA AQI breakpoints — the scale Nepali outlets and embassies quote.
AQI_BANDS = [
    Band(50, "Good", "none"),
    Band(100, "Moderate", "low"),
    Band(150, "Unhealthy for Sensitive Groups", "moderate"),
    Band(200, "Unhealthy", "high"),
    Band(300, "Very Unhealthy", "severe"),
    Band(float("inf"), "Hazardous", "extreme"),
]

UNKNOWN_BAND = Band(float("inf"), "Unknown", "none")


def aqi_band(aqi: float | None) -> Band:
    if aqi is None:
        return UNKNOWN_BAND
    for band in AQI_BANDS:
        if aqi <= band.max:
            return band
    return AQI_BANDS[-1]


async def get_air_quality(lat: float, lon: float) -> Any:
    return await safe_fetch(
        BASE,
        timeout=20.0,
        params={
            "latitude": lat,
            "longitude": lon,
            "current": "pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,us_aqi",
            "timezone": "Asia/Kathmandu",
        },
    )


async def _for_city(city: City) -> dict[str, Any]:
    reading = await get_air_quality(city.lat, city.lon)
    if is_error(reading) or not isinstance(reading, dict):
        error = reading.error if is_error(reading) else "Unexpected response shape"
        return {"city": city.label, "error": error}

    current = reading.get("current") or {}
    band = aqi_band(current.get("us_aqi"))
    province = PROVINCES.get(city.province)
    return {
        "location": city.label,
        "state": province.label if province else None,
        "lat": city.lat,
        "lon": city.lon,
        "aqi": current.get("us_aqi"),
        "band": band.label,
        "severity": band.severity,
        "pm25": current.get("pm2_5"),
        "pm10": current.get("pm10"),
        "no2": current.get("nitrogen_dioxide"),
        "so2": current.get("sulphur_dioxide"),
        "co": current.get("carbon_monoxide"),
        "ozone": current.get("ozone"),
    }


async def briefing() -> dict[str, Any]:
    results = await asyncio.gather(*(_for_city(city) for city in CITIES.values()))

    readings = [r for r in results if "error" not in r]
    failed = [r for r in results if "error" in r]

    if not readings:
        return {
            "source": "AirQuality",
            "timestamp": now_iso(),
            "error": failed[0]["error"]
            if failed
            else "Open-Meteo air quality returned no data",
        }

    ranked = sorted(
        (r for r in readings if r["aqi"] is not None),
        key=lambda r: r["aqi"],
        reverse=True,
    )
    worst = ranked[0] if ranked else None
    kathmandu = next((r for r in readings if r["location"] == "Kathmandu"), None)
    unhealthy = [r for r in ranked if r["aqi"] > 150]

    signals: list[str] = []
    if worst and worst["aqi"] > 200:
        signals.append(
            f"AQI {worst['aqi']} at {worst['location']} — {worst['band']}. "
            "Outdoor exposure hazardous."
        )
    elif worst and worst["aqi"] > 150:
        signals.append(f"AQI {worst['aqi']} at {worst['location']} — {worst['band']}.")
    if len(unhealthy) >= 3:
        signals.append(
            f"{len(unhealthy)} Nepal cities above AQI 150 — regional pollution "
            "episode, not a local source"
        )
    if kathmandu and kathmandu["pm25"] is not None and kathmandu["pm25"] > 55:
        signals.append(
            f"Kathmandu PM2.5 at {kathmandu['pm25']} µg/m³ — valley inversion "
            "trapping particulates"
        )

    out: dict[str, Any] = {
        "source": "AirQuality",
        "timestamp": now_iso(),
        "totalReadings": len(readings),
        "worst": worst,
        "kathmandu": kathmandu,
        "readings": readings,
        "signals": signals,
    }
    if failed:
        out["partialErrors"] = [{"city": f["city"], "error": f["error"]} for f in failed]
    return out


if __name__ == "__main__":
    import json

    print(json.dumps(asyncio.run(briefing()), indent=2, ensure_ascii=False))
