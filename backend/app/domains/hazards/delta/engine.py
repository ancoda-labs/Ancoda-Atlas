"""Compares two synthesized sweeps and produces structured changes.

Ported from src/lib/delta/engine.mjs. The thresholds are Nepal-specific and
tuned rather than generic — "any new earthquake matters" is a real editorial
judgement about this country, not a placeholder.
"""

from typing import Any, Callable, NamedTuple

# ─── Default thresholds ──────────────────────────────────────────────────────

DEFAULT_NUMERIC_THRESHOLDS: dict[str, float] = {
    "max_magnitude": 10,  # % change in the largest recorded quake
    "worst_aqi": 15,      # % change in the peak AQI across monitored cities
    "max_rain_5d": 20,    # % change in the wettest station's 5-day rainfall
}

DEFAULT_COUNT_THRESHOLDS: dict[str, float] = {
    "quakes_24h": 1,        # any new earthquake matters in Nepal
    "quakes_7d": 3,
    "weather_alerts": 1,    # any new flood or landslide alert matters
    "extreme_alerts": 1,    # an extreme-severity alert is never routine
    "thermal_total": 200,   # Nepal's fire counts run smaller than regional ones
    "night_fires": 20,      # overnight burning means fires running unchecked
    "active_disasters": 1,  # any new declared response matters
    "hazard_news": 5,
    "impact_reports": 3,    # casualties, missing or rescue
    "sources_ok": 1,        # any source going down matters
}


class Metric(NamedTuple):
    key: str
    extract: Callable[[dict[str, Any]], Any]
    label: str


def _max_rain(d: dict[str, Any]) -> float | None:
    rains = [s.get("rain5dMm") or 0 for s in ((d.get("weather") or {}).get("stations") or [])]
    return max(rains) if rains else None


def _news_count(d: dict[str, Any]) -> int:
    """News is a list on a full sweep and a {count} stub once compacted."""
    news = d.get("news")
    if isinstance(news, list):
        return len(news)
    if isinstance(news, dict):
        return news.get("count") or 0
    return 0


NUMERIC_METRICS = [
    Metric("max_magnitude", lambda d: (d.get("seismic") or {}).get("maxMagnitude"), "Max Magnitude"),
    Metric("worst_aqi", lambda d: ((d.get("airQuality") or {}).get("worst") or {}).get("aqi"), "Peak AQI"),
    Metric("max_rain_5d", _max_rain, "Peak 5-day Rainfall"),
]

COUNT_METRICS = [
    Metric("quakes_24h", lambda d: (d.get("seismic") or {}).get("events24h") or 0, "Earthquakes (24h)"),
    Metric("quakes_7d", lambda d: (d.get("seismic") or {}).get("events7d") or 0, "Earthquakes (7d)"),
    Metric("weather_alerts", lambda d: (d.get("weather") or {}).get("totalAlerts") or 0, "Weather Alerts"),
    Metric(
        "extreme_alerts",
        lambda d: len([a for a in ((d.get("weather") or {}).get("alerts") or []) if a.get("severity") == "extreme"]),
        "Extreme Weather Alerts",
    ),
    Metric("thermal_total", lambda d: (d.get("fire") or {}).get("totalDetections") or 0, "Fire Detections"),
    Metric("night_fires", lambda d: (d.get("fire") or {}).get("nightDetections") or 0, "Overnight Fire Detections"),
    Metric("active_disasters", lambda d: len((d.get("relief") or {}).get("disasters") or []), "Active Declared Disasters"),
    Metric("hazard_news", _news_count, "Hazard Headlines"),
    Metric("impact_reports", lambda d: (d.get("impact") or {}).get("count") or 0, "Reported Impact Headlines"),
    Metric("sources_ok", lambda d: (d.get("meta") or {}).get("sourcesOk") or 0, "Sources OK"),
]

# Used for the overall direction. Every one is a hazard exposure measure.
RISK_KEYS = {
    "quakes_24h",
    "weather_alerts",
    "extreme_alerts",
    "worst_aqi",
    "max_rain_5d",
    "active_disasters",
    "impact_reports",
}

SIGNIFICANT_QUAKE_MAG = 5.5


def compute_delta(
    current: dict[str, Any] | None,
    previous: dict[str, Any] | None,
    threshold_overrides: dict[str, dict[str, float]] | None = None,
) -> dict[str, Any] | None:
    """None on the first run — there is nothing to compare against yet."""
    if not previous or not current:
        return None

    overrides = threshold_overrides or {}
    num_thresholds = {**DEFAULT_NUMERIC_THRESHOLDS, **(overrides.get("numeric") or {})}
    cnt_thresholds = {**DEFAULT_COUNT_THRESHOLDS, **(overrides.get("count") or {})}

    signals: dict[str, list[Any]] = {
        "new": [],
        "escalated": [],
        "deescalated": [],
        "unchanged": [],
    }
    critical_changes = 0

    # ─── Numeric metrics: percentage change ──────────────────────────────
    for m in NUMERIC_METRICS:
        curr, prev = m.extract(current), m.extract(previous)
        if curr is None or prev is None:
            continue

        threshold = num_thresholds.get(m.key, 5)
        pct_change = ((curr - prev) / abs(prev)) * 100 if prev != 0 else 0

        if abs(pct_change) > threshold:
            entry = {
                "key": m.key,
                "label": m.label,
                "from": prev,
                "to": curr,
                "pctChange": round(pct_change, 2),
                "direction": "up" if pct_change > 0 else "down",
                "severity": (
                    "critical"
                    if abs(pct_change) > threshold * 3
                    else "high"
                    if abs(pct_change) > threshold * 2
                    else "moderate"
                ),
            }
            signals["escalated" if pct_change > 0 else "deescalated"].append(entry)
            if abs(pct_change) > 10:
                critical_changes += 1
        else:
            signals["unchanged"].append(m.key)

    # ─── Count metrics: absolute change ──────────────────────────────────
    for m in COUNT_METRICS:
        curr, prev = m.extract(current), m.extract(previous)
        diff = curr - prev
        threshold = cnt_thresholds.get(m.key, 1)

        if abs(diff) >= threshold:
            pct_change = (diff / prev) * 100 if prev > 0 else (100 if diff > 0 else 0)
            entry = {
                "key": m.key,
                "label": m.label,
                "from": prev,
                "to": curr,
                "change": diff,
                "direction": "up" if diff > 0 else "down",
                "pctChange": round(pct_change, 1),
                "severity": (
                    "critical"
                    if abs(diff) >= threshold * 5
                    else "high"
                    if abs(diff) >= threshold * 2
                    else "moderate"
                ),
            }
            signals["escalated" if diff > 0 else "deescalated"].append(entry)
            # Counts only count as critical when the change is extreme.
            if entry["severity"] == "critical":
                critical_changes += 1
        else:
            signals["unchanged"].append(m.key)

    # ─── Damaging-earthquake tripwire ────────────────────────────────────
    curr_anom = ((current.get("seismic") or {}).get("maxMagnitude") or 0) >= SIGNIFICANT_QUAKE_MAG
    prev_anom = ((previous.get("seismic") or {}).get("maxMagnitude") or 0) >= SIGNIFICANT_QUAKE_MAG
    if curr_anom and not prev_anom:
        signals["new"].append(
            {
                "key": "seismic_event",
                "reason": "Significant earthquake detected (M5.5+)",
                "severity": "critical",
            }
        )
        critical_changes += 5
    elif not curr_anom and prev_anom:
        signals["deescalated"].append(
            {
                "key": "seismic_event",
                "label": "Significant Earthquake",
                "direction": "resolved",
                "severity": "high",
            }
        )

    # ─── Source health degradation ───────────────────────────────────────
    curr_down = len([s for s in (current.get("health") or []) if s.get("err")])
    prev_down = len([s for s in (previous.get("health") or []) if s.get("err")])
    if curr_down > prev_down + 2:
        signals["new"].append(
            {
                "key": "source_degradation",
                "reason": (
                    f"{curr_down - prev_down} additional sources failing "
                    f"({curr_down} total down)"
                ),
                "severity": "critical" if curr_down > 5 else "moderate",
            }
        )

    # ─── Overall direction ───────────────────────────────────────────────
    risk_up = len([s for s in signals["escalated"] if s.get("key") in RISK_KEYS])
    risk_down = len([s for s in signals["deescalated"] if s.get("key") in RISK_KEYS])
    direction = "mixed"
    if risk_up > risk_down + 1:
        direction = "risk-off"
    elif risk_down > risk_up + 1:
        direction = "risk-on"

    from app.core.http import now_iso

    return {
        "timestamp": (current.get("meta") or {}).get("timestamp") or now_iso(),
        "previous": (previous.get("meta") or {}).get("timestamp"),
        "signals": signals,
        "summary": {
            "totalChanges": len(signals["new"])
            + len(signals["escalated"])
            + len(signals["deescalated"]),
            "criticalChanges": critical_changes,
            "direction": direction,
            "signalBreakdown": {
                "new": len(signals["new"]),
                "escalated": len(signals["escalated"]),
                "deescalated": len(signals["deescalated"]),
                "unchanged": len(signals["unchanged"]),
            },
        },
    }
