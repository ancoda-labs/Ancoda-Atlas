"""Open-Meteo — Nepal weather and monsoon/flood watch.

Free, no key. Monsoon flooding and landslides are Nepal's dominant recurring
hazard, which is why the rain thresholds below are seasonal rather than fixed.

Runnable alone:  python -m app.domains.hazards.sources.weather
"""

import asyncio
from datetime import datetime, timezone
from typing import Any

from app.core.http import is_error, now_iso, safe_fetch
from app.core.nepal import CITIES, PROVINCES, City

BASE = "https://api.open-meteo.com/v1/forecast"

# WMO weather codes worth flagging. Everything else is ordinary weather.
SEVERE_CODES: dict[int, dict[str, str]] = {
    65: {"event": "Heavy Rain", "severity": "severe"},
    67: {"event": "Heavy Freezing Rain", "severity": "severe"},
    75: {"event": "Heavy Snowfall", "severity": "severe"},
    82: {"event": "Violent Rain Showers", "severity": "extreme"},
    86: {"event": "Heavy Snow Showers", "severity": "severe"},
    95: {"event": "Thunderstorm", "severity": "moderate"},
    96: {"event": "Thunderstorm with Hail", "severity": "severe"},
    99: {"event": "Thunderstorm with Heavy Hail", "severity": "extreme"},
}


async def get_forecast(lat: float, lon: float) -> Any:
    return await safe_fetch(
        BASE,
        timeout=20.0,
        params={
            "latitude": lat,
            "longitude": lon,
            "current": "temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m",
            "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max",
            "timezone": "Asia/Kathmandu",
            "forecast_days": 5,
        },
    )


def is_monsoon_season(when: datetime | None = None) -> bool:
    """Nepal's monsoon runs roughly June through September.

    Rain thresholds that are unremarkable in July are notable in December, so
    this gates the heavy-rainfall threshold rather than only labelling output.
    """
    month = (when or datetime.now(timezone.utc)).month
    return 6 <= month <= 9


def _at(series: Any, index: int, default: Any = None) -> Any:
    if not isinstance(series, list) or index >= len(series):
        return default
    value = series[index]
    return default if value is None else value


def _classify(city: City, forecast: dict[str, Any]) -> dict[str, Any]:
    current = forecast.get("current") or {}
    daily = forecast.get("daily") or {}
    dates = daily.get("time") or []

    days = [
        {
            "date": date,
            "code": _at(daily.get("weather_code"), i),
            "tMax": _at(daily.get("temperature_2m_max"), i),
            "tMin": _at(daily.get("temperature_2m_min"), i),
            "precip": _at(daily.get("precipitation_sum"), i, 0),
            "precipChance": _at(daily.get("precipitation_probability_max"), i),
        }
        for i, date in enumerate(dates)
    ]

    rain_5d = sum(d["precip"] or 0 for d in days)
    max_daily = max((d["precip"] or 0 for d in days), default=0)

    province = PROVINCES.get(city.province)
    return {
        "city": city.label,
        "province": province.label if province else None,
        "lat": city.lat,
        "lon": city.lon,
        "temperature": current.get("temperature_2m"),
        "humidity": current.get("relative_humidity_2m"),
        "precipitation": current.get("precipitation"),
        "windSpeed": current.get("wind_speed_10m"),
        "weatherCode": current.get("weather_code"),
        "forecast": days,
        "rain5dMm": round(rain_5d, 1),
        "maxDailyRainMm": round(max_daily, 1),
    }


async def _for_city(city: City) -> dict[str, Any]:
    forecast = await get_forecast(city.lat, city.lon)
    if is_error(forecast) or not isinstance(forecast, dict):
        error = forecast.error if is_error(forecast) else "Unexpected response shape"
        return {"city": city.label, "lat": city.lat, "lon": city.lon, "error": error}
    return _classify(city, forecast)


async def briefing() -> dict[str, Any]:
    results = await asyncio.gather(*(_for_city(city) for city in CITIES.values()))

    stations = [r for r in results if "error" not in r]
    failed = [r for r in results if "error" in r]

    if not stations:
        return {
            "source": "Weather",
            "timestamp": now_iso(),
            "error": failed[0]["error"]
            if failed
            else "Open-Meteo returned no data for any Nepal station",
        }

    monsoon = is_monsoon_season()
    # 100mm/day is the threshold Nepal's DHM broadly treats as heavy rainfall.
    heavy_rain_threshold = 100 if monsoon else 50

    alerts: list[dict[str, Any]] = []
    for s in stations:
        severe = SEVERE_CODES.get(s["weatherCode"])
        if severe:
            alerts.append(
                {
                    "event": severe["event"],
                    "severity": severe["severity"],
                    "headline": f"{severe['event']} at {s['city']}, {s['province'] or 'Nepal'}",
                    "lat": s["lat"],
                    "lon": s["lon"],
                }
            )
        if s["maxDailyRainMm"] >= heavy_rain_threshold:
            alerts.append(
                {
                    "event": "Flood / Landslide Risk",
                    "severity": "extreme"
                    if s["maxDailyRainMm"] >= heavy_rain_threshold * 1.5
                    else "severe",
                    "headline": (
                        f"{s['maxDailyRainMm']}mm daily rainfall forecast at "
                        f"{s['city']} — flood and landslide risk"
                    ),
                    "lat": s["lat"],
                    "lon": s["lon"],
                }
            )
        if s["temperature"] is not None and s["temperature"] >= 40:
            alerts.append(
                {
                    "event": "Extreme Heat",
                    "severity": "severe",
                    "headline": f"{s['temperature']}°C at {s['city']} — heat stress in the Terai",
                    "lat": s["lat"],
                    "lon": s["lon"],
                }
            )

    signals: list[str] = []
    wettest = max(stations, key=lambda s: s["rain5dMm"], default=None)
    if wettest and wettest["rain5dMm"] > 150:
        signals.append(
            f"{wettest['rain5dMm']}mm forecast over 5 days at {wettest['city']} — "
            "sustained saturation, landslide risk rising"
        )
    if monsoon:
        signals.append(
            "Monsoon season active — elevated baseline flood and landslide exposure"
        )
    if any(a["severity"] == "extreme" for a in alerts):
        signals.append("Extreme weather alert active in at least one Nepal district")

    out: dict[str, Any] = {
        "source": "Weather",
        "timestamp": now_iso(),
        "monsoonSeason": monsoon,
        "totalSevereAlerts": len(alerts),
        "topAlerts": alerts[:12],
        "stations": stations,
        "signals": signals,
    }
    if failed:
        out["partialErrors"] = [{"city": f["city"], "error": f["error"]} for f in failed]
    return out


if __name__ == "__main__":
    import json

    print(json.dumps(asyncio.run(briefing()), indent=2, ensure_ascii=False))
