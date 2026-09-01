"""LLM-generated actionable reads from the hazard sweep.

The rule-based engine in hazards/synthesize.py is the fallback and the default.
This runs only when a provider is configured, and returns None on any failure —
the caller then falls back rather than showing nothing.

The prompt is carried over verbatim in substance because it is not decoration:
it is what keeps the model inside Atlas's scope. Politics, markets and
diplomacy are named as out of scope, India and China are admitted only through
cross-boundary hazards, and the model is told that Atlas reads model output and
satellite feeds rather than official warnings.
"""

import json as jsonlib
import re
from typing import Any

from app.core.logging import get_logger
from app.domains.ai.providers.base import LLMProvider

log = get_logger(__name__)

SYSTEM_PROMPT = """You are an emergency management analyst covering natural disasters in Nepal. You receive structured hazard data from five Nepal-scoped sources — USGS seismic, Open-Meteo weather, NASA FIRMS fire detection, Open-Meteo air quality, and ReliefWeb — and produce 5-8 actionable reads.

Scope: natural hazards in Nepal only. Earthquakes, monsoon floods, landslides, glacial lake outburst floods, wildfire, hazardous air, extreme heat and cold, avalanches, and the humanitarian response to them. Politics, markets, trade, conflict and diplomacy are out of scope — never write a read whose subject is any of those. India and China are relevant solely through cross-boundary hazards such as upstream river discharge and transboundary smoke.

What matters in Nepal, in rough priority order:
- Earthquakes on the Main Himalayan Thrust — depth matters as much as magnitude
- Monsoon floods in the Terai and landslides in the hill districts, June through September
- Compound hazard: slopes loosened by shaking failing under later rainfall
- Glacial lake outburst floods in the high Himalaya
- Pre-monsoon forest fire season, March through May, and the smoke it pushes into the Kathmandu valley
- Terai heat waves in May and June, and cold waves in December and January
- Access: which highways, airstrips and river crossings a hazard takes out

Rules:
- Each read must cite specific data points from the input
- Include rationale, risk factors, and time horizon
- Cross-correlate across hazard layers — the strongest reads combine two independent signals
- Be specific: name districts, river basins, corridors and stations, not vague generalities
- Respect seasonality: fire detections in April and rainfall in July are normal; the same values off-season are not
- Atlas reads model output and satellite feeds, not official warnings — say so when a read would drive a public advisory
- If delta shows significant changes, lead with those
- Do NOT repeat reads from the "previous ideas" list unless conditions have materially changed
- Rate confidence: HIGH (multiple confirming signals), MEDIUM (thesis supported), LOW (speculative)

Output ONLY valid JSON array. Each object:
{
  "title": "Short title (max 10 words)",
  "type": "PREPARE|RESPOND|WATCH|STAND-DOWN",
  "ticker": "Primary subject: district, river basin, corridor, or monitoring station",
  "confidence": "HIGH|MEDIUM|LOW",
  "rationale": "2-3 sentence explanation citing specific data",
  "risk": "Key risk factor",
  "horizon": "Immediate|Days|Weeks|Months",
  "signals": ["signal1", "signal2"]
}"""


def compact_sweep(
    data: dict[str, Any], delta: dict[str, Any] | None, previous: list[dict[str, Any]]
) -> str:
    """Flatten the sweep to roughly 8KB of labelled lines.

    Sending the whole snapshot would be megabytes of mostly-repeated structure.
    What survives is what a read could actually cite.
    """
    sections: list[str] = []

    # Seismic — the highest-consequence feed for Nepal, so it leads.
    seismic = data.get("seismic") or {}
    if seismic.get("totalEvents") is not None:
        line = (
            f"SEISMIC: {seismic.get('events24h')} in 24h, {seismic.get('events7d')} in 7d, "
            f"max M{seismic.get('maxMagnitude') if seismic.get('maxMagnitude') is not None else 'n/a'}"
        )
        strongest = seismic.get("strongest")
        if strongest:
            depth = strongest.get("depthKm")
            line += f" ({strongest.get('place')}, depth {depth if depth is not None else '?'}km)"
        sections.append(line)

        shallow = [
            q
            for q in (seismic.get("significant") or [])
            if q.get("depthKm") is not None and q["depthKm"] < 35
        ]
        if shallow:
            listed = "; ".join(f"M{q['mag']} {q['place']}" for q in shallow[:5])
            sections.append(f"SHALLOW_RUPTURES (<35km): {listed}")

    weather = data.get("weather") or {}
    if weather:
        alerts = [
            f"{a.get('event')} [{a.get('severity')}] — {a.get('headline') or '?'}"
            for a in (weather.get("alerts") or [])[:6]
        ]
        monsoon = "ACTIVE" if weather.get("monsoonSeason") else "off-season"
        body = "\n  " + "\n  ".join(alerts) if alerts else ""
        sections.append(
            f"WEATHER: {weather.get('totalAlerts') or 0} alerts, monsoon={monsoon}{body}"
        )

        wettest = sorted(
            (st for st in (weather.get("stations") or []) if (st.get("rain5dMm") or 0) > 0),
            key=lambda st: st.get("rain5dMm") or 0,
            reverse=True,
        )[:4]
        if wettest:
            sections.append(
                "RAINFALL_5D: "
                + ", ".join(
                    f"{st['city']}={st['rain5dMm']}mm (peak day {st['maxDailyRainMm']}mm)"
                    for st in wettest
                )
            )

        hot = [
            st
            for st in (weather.get("stations") or [])
            if st.get("temperature") is not None and st["temperature"] >= 38
        ]
        if hot:
            sections.append(
                "HEAT: " + ", ".join(f"{st['city']}={st['temperature']}°C" for st in hot)
            )

    fire = data.get("fire") or {}
    if fire.get("totalDetections"):
        regions = [
            f"{r['region']}: {r['det']} detections ({r['hc']} high-conf, {r['night']} night)"
            for r in (fire.get("regions") or [])
            if (r.get("det") or 0) > 10
        ]
        season = "ACTIVE" if fire.get("fireSeason") else "off"
        suffix = f" — {', '.join(regions)}" if regions else ""
        sections.append(
            f"FIRE: {fire['totalDetections']} detections nationwide, season={season}{suffix}"
        )

    air = data.get("airQuality") or {}
    if air.get("stations"):
        top = sorted(air["stations"], key=lambda s: s.get("aqi") or 0, reverse=True)[:4]
        sections.append(
            "AIR_QUALITY: "
            + ", ".join(
                f"{s['location']}={s.get('aqi') if s.get('aqi') is not None else 'n/a'} "
                f"({s.get('band') or '?'})"
                for s in top
            )
        )

    relief = data.get("relief") or {}
    if relief.get("disasters"):
        listed = "; ".join(
            f"{d.get('name') or d.get('title')}"
            + (f" [{'/'.join(d['type'])}]" if d.get("type") else "")
            for d in relief["disasters"][:5]
        )
        sections.append(f"RELIEFWEB_ACTIVE: {listed}")

    # The only layer that sees an event already under way.
    impact = data.get("impact") or {}
    if impact.get("count"):
        where = ", ".join(f"{r['region']}={r['count']}" for r in (impact.get("topRegions") or []))
        suffix = f" — concentrated in {where}" if where else ""
        sections.append(
            f"REPORTED_IMPACT: {impact['count']} of {len(data.get('news') or [])} hazard "
            f"headlines report casualties, missing persons, displacement or active rescue{suffix}"
        )

    if data.get("news"):
        headlines = "\n".join(
            f"- [{n.get('region')}] {n.get('title')}" for n in data["news"][:8]
        )
        sections.append(f"HAZARD_HEADLINES:\n{headlines}")

    # A read should not lean on a layer that is down.
    down = [h["n"] for h in (data.get("health") or []) if h.get("err")]
    if down:
        sections.append(f"SOURCES_DOWN: {', '.join(down)}")

    if delta and delta.get("summary"):
        summary = delta["summary"]
        sections.append(
            f"\nDELTA_SINCE_LAST_SWEEP: direction={summary.get('direction')}, "
            f"changes={summary.get('totalChanges')}, critical={summary.get('criticalChanges')}"
        )
        signals = delta.get("signals") or {}
        if signals.get("escalated"):
            sections.append(
                "ESCALATED: "
                + ", ".join(
                    f"{s.get('label')}: {s.get('from')}→{s.get('to')} "
                    f"({'+' if (s.get('pctChange') or 0) > 0 else ''}{s.get('pctChange') or 0:.1f}%)"
                    for s in signals["escalated"]
                )
            )
        if signals.get("new"):
            sections.append(
                "NEW_SIGNALS: "
                + "; ".join(s.get("label") or (s.get("reason") or "")[:60] for s in signals["new"])
            )

    if previous:
        listed = "\n".join(f"- {i.get('title')} [{i.get('type')}]" for i in previous)
        sections.append(f"\nPREVIOUS_IDEAS (avoid repeating):\n{listed}")

    return "\n".join(sections)


_CODE_BLOCK = re.compile(r"```(?:json)?\s*\n?([\s\S]*?)\n?```")
_ARRAY = re.compile(r"(\[[\s\S]*\])")


def parse_ideas_response(text: str | None) -> list[dict[str, Any]] | None:
    """Recover the JSON array from a response that may be fenced or prefaced."""
    if not text:
        return None

    cleaned = text.strip()
    block = _CODE_BLOCK.search(cleaned)
    if block:
        cleaned = block.group(1).strip()

    array = _ARRAY.search(cleaned)
    if array:
        cleaned = array.group(1)

    try:
        parsed = jsonlib.loads(cleaned)
    except ValueError:
        return None
    if not isinstance(parsed, list):
        return None

    out = []
    for idea in parsed:
        if not isinstance(idea, dict):
            continue
        # A read with no title, type or confidence is not usable on the page,
        # and inventing the missing field would be inventing the read.
        if not (idea.get("title") and idea.get("type") and idea.get("confidence")):
            continue
        out.append(
            {
                "title": idea["title"],
                "type": idea["type"],
                "ticker": idea.get("ticker") or "",
                "confidence": idea["confidence"],
                "rationale": idea.get("rationale") or "",
                "risk": idea.get("risk") or "",
                "horizon": idea.get("horizon") or "",
                "signals": idea.get("signals") or [],
                "source": "llm",
            }
        )
    return out


async def generate_llm_ideas(
    provider: LLMProvider | None,
    sweep: dict[str, Any],
    delta: dict[str, Any] | None = None,
    previous: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]] | None:
    """None on any failure, so the caller falls back to the rule engine."""
    if not provider or not provider.is_configured:
        return None

    try:
        context = compact_sweep(sweep, delta, previous or [])
    except Exception as exc:  # noqa: BLE001
        log.warning("llm_ideas_compact_failed", error=str(exc))
        return None

    try:
        result = await provider.complete(
            SYSTEM_PROMPT, context, max_tokens=8192, timeout=90.0
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("llm_ideas_failed", error=str(exc))
        return None

    ideas = parse_ideas_response(result.text)
    if ideas:
        return ideas

    log.warning(
        "llm_ideas_unparseable",
        length=len(result.text or ""),
        head=(result.text or "")[:200],
    )
    return None
