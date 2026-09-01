"""Deciding whether a change is worth waking somebody up for.

Everything that is not "how do I format a message for this service" lives here:
the tiers, the rule-based evaluation, semantic deduplication, rate limiting and
muting. The Node build duplicated all of it across telegram.mjs and discord.mjs
— roughly seven hundred identical lines — and the two had already begun to
drift. One copy means a threshold change cannot apply to one channel and not
the other.

The rules exist because an alert nobody trusts is worse than no alert. Three
things guard against that:

  Tiers with cooldowns and hourly caps, so a rolling monsoon cannot produce an
  alert every fifteen minutes for a week.

  Semantic deduplication on content rather than exact text, so "rainfall up
  12.3%" and "rainfall up 12.7%" an hour apart are one signal, not two.

  A mute, because sometimes the person on the other end already knows.
"""

import hashlib
import json
import re
import time
from typing import Any, NamedTuple

from app.core.logging import get_logger

log = get_logger(__name__)


class Tier(NamedTuple):
    emoji: str
    label: str
    cooldown_s: float
    max_per_hour: int


# FLASH:    life-safety, time-critical — a damaging earthquake
# PRIORITY: an important hazard cluster — act within hours
# ROUTINE:  a noteworthy change — no urgency
TIERS = {
    "FLASH": Tier("🔴", "FLASH", 5 * 60, 6),
    "PRIORITY": Tier("🟡", "PRIORITY", 30 * 60, 4),
    "ROUTINE": Tier("🔵", "ROUTINE", 60 * 60, 2),
}

DEDUPE_WINDOW_S = 4 * 60 * 60
HASH_RETENTION_S = 24 * 60 * 60

EVALUATION_PROMPT = """You are Atlas, an emergency alert evaluator for a Nepal natural-disaster monitoring system. You analyze signal deltas from a 5-source hazard sweep (USGS seismic, Open-Meteo weather, NASA FIRMS fire, Open-Meteo air quality, ReliefWeb) and decide whether the user needs an alert.

Scope: natural hazards in Nepal only — earthquakes, floods, landslides, wildfire, hazardous air, extreme heat and cold, avalanches, and glacial lake outburst floods. Politics, markets and conflict are out of scope; never raise them.

DO NOT ALERT ON:
- Routine seasonal variation (fire detections in April, rainfall in July)
- A single metric moving without a second confirming signal
- Anything already alerted recently

Tiers:
- FLASH: life-safety and time-critical. A damaging earthquake outranks everything else in Nepal.
- PRIORITY: an important hazard cluster needing action within hours.
- ROUTINE: a noteworthy change, no urgency.

Reply STRICT JSON only:
{"shouldAlert": true|false, "tier": "FLASH|PRIORITY|ROUTINE", "confidence": "HIGH|MEDIUM|LOW", "headline": "...", "reason": "...", "actionable": "...", "signals": ["..."], "crossCorrelation": "..."}"""

_TIME = re.compile(r"\d{1,2}:\d{2}")
_NUMBER = re.compile(r"\d+\.\d+%?")
_WS = re.compile(r"\s+")


def parse_json(text: str | None) -> dict[str, Any] | None:
    if not text:
        return None
    match = re.search(r"\{[\s\S]*\}", text)
    try:
        parsed = json.loads(match.group(0) if match else text)
    except ValueError:
        return None
    return parsed if isinstance(parsed, dict) else None


class Alerter:
    """The shared alerting behaviour. Subclasses only send."""

    name = "alerter"

    def __init__(self) -> None:
        self._alert_history: list[dict[str, Any]] = []
        self._content_hashes: dict[str, float] = {}
        self._mute_until: float | None = None

    @property
    def is_configured(self) -> bool:
        return False

    async def send_alert(self, evaluation: dict[str, Any], delta: dict[str, Any], tier: str) -> bool:
        raise NotImplementedError

    # ─── Deduplication ───────────────────────────────────────────────────

    def content_hash(self, signal: dict[str, Any]) -> str:
        """Hash meaning rather than text.

        Times and exact decimals are normalised out, so the same condition
        reported an hour apart with a slightly different number is recognised
        as the same signal rather than alerted twice.
        """
        if signal.get("text"):
            content = signal["text"].lower()
            content = _TIME.sub("", content)
            content = _NUMBER.sub("NUM", content)
            content = _WS.sub(" ", content).strip()[:120]
        elif signal.get("label"):
            # For metric signals the label and direction are the identity; the
            # exact value is not.
            content = f"{signal['label']}:{signal.get('direction') or 'none'}"
        else:
            content = signal.get("key") or json.dumps(signal, sort_keys=True)[:80]
        return hashlib.sha256(content.encode()).hexdigest()[:16]

    def is_semantic_duplicate(self, signal: dict[str, Any]) -> bool:
        seen = self._content_hashes.get(self.content_hash(signal))
        return seen is not None and (time.monotonic() - seen) < DEDUPE_WINDOW_S

    def record_content_hash(self, signal: dict[str, Any]) -> None:
        now = time.monotonic()
        self._content_hashes[self.content_hash(signal)] = now
        cutoff = now - HASH_RETENTION_S
        for key in [k for k, ts in self._content_hashes.items() if ts < cutoff]:
            del self._content_hashes[key]

    def signal_key(self, signal: dict[str, Any]) -> str:
        if signal.get("text"):
            return f"{self.name}:{self.content_hash(signal)}"
        return signal.get("key") or signal.get("label") or json.dumps(signal, sort_keys=True)[:60]

    # ─── Rate limiting and muting ────────────────────────────────────────

    def check_rate_limit(self, tier: str) -> bool:
        config = TIERS.get(tier)
        if not config:
            return True
        now = time.monotonic()

        last = next(
            (a for a in reversed(self._alert_history) if a["tier"] == tier), None
        )
        if last and (now - last["at"]) < config.cooldown_s:
            return False

        recent = [
            a for a in self._alert_history if a["tier"] == tier and a["at"] > now - 3600
        ]
        return len(recent) < config.max_per_hour

    def record_alert(self, tier: str) -> None:
        self._alert_history.append({"tier": tier, "at": time.monotonic()})
        self._alert_history = self._alert_history[-50:]

    def mute_for(self, hours: float) -> None:
        self._mute_until = time.monotonic() + hours * 3600

    def unmute(self) -> None:
        self._mute_until = None

    def is_muted(self) -> bool:
        if self._mute_until is None:
            return False
        if time.monotonic() > self._mute_until:
            self._mute_until = None
            return False
        return True

    # ─── Evaluation ──────────────────────────────────────────────────────

    def rule_based_evaluation(
        self, signals: list[dict[str, Any]], delta: dict[str, Any]
    ) -> dict[str, Any]:
        """The fallback, and the default when no model is configured.

        The ordering is a judgement about Nepal: a damaging earthquake outranks
        everything else, and rain landing on ground that has just been shaken
        outranks either signal alone.
        """
        criticals = [s for s in signals if s.get("severity") == "critical"]
        highs = [s for s in signals if s.get("severity") == "high"]
        seismic = next((s for s in signals if s.get("key") == "seismic_event"), None)
        water = [
            s
            for s in signals
            if s.get("key") in ("weather_alerts", "extreme_alerts", "max_rain_5d")
        ]
        quakes = [
            s
            for s in signals
            if s.get("key") in ("quakes_24h", "quakes_7d", "max_magnitude")
        ]
        fire = [
            s for s in signals if s.get("key") in ("thermal_total", "night_fires", "worst_aqi")
        ]
        relief = [
            s for s in signals if s.get("key") in ("active_disasters", "impact_reports")
        ]

        def labels(items: list[dict[str, Any]], n: int = 5) -> list[str]:
            return [s.get("label") or s.get("key") or "" for s in items][:n]

        if seismic:
            return {
                "shouldAlert": True,
                "tier": "FLASH",
                "confidence": "HIGH",
                "headline": "Significant Earthquake Detected",
                "reason": seismic.get("reason")
                or "A significant earthquake has been detected in the Nepal region.",
                "actionable": (
                    "Expect aftershocks. Check highway integrity on the Prithvi and "
                    "Araniko corridors, district hospital capacity, and school building stock."
                ),
                "signals": labels([seismic]),
                "crossCorrelation": "USGS seismic",
                "_source": "rules",
            }

        # Rain onto ground that has just been shaken. This is the combination
        # that closed the Araniko highway in 2015.
        if water and quakes:
            return {
                "shouldAlert": True,
                "tier": "PRIORITY",
                "confidence": "HIGH",
                "headline": "Compound Hazard — Rain on Recently Shaken Ground",
                "reason": (
                    "Water and seismic signals are escalating together: "
                    f"{', '.join(labels(water, 3))} alongside {', '.join(labels(quakes, 3))}."
                ),
                "actionable": "Treat hill-district road access as unreliable.",
                "signals": labels(water + quakes),
                "crossCorrelation": "weather + seismic",
                "_source": "rules",
            }

        escalated_highs = [s for s in highs if s.get("direction") == "up"]
        if len(escalated_highs) >= 2:
            return {
                "shouldAlert": True,
                "tier": "PRIORITY",
                "confidence": "MEDIUM",
                "headline": f"{len(escalated_highs)} Escalating Hazard Signals",
                "reason": (
                    "Multiple hazard indicators escalating simultaneously: "
                    f"{', '.join(labels(escalated_highs, 3))}."
                ),
                "actionable": "Monitor for continuation in the next sweep.",
                "signals": labels(escalated_highs),
                "crossCorrelation": "multi-hazard",
                "_source": "rules",
            }

        new_disaster = next((s for s in relief if s.get("direction") == "up"), None)
        if new_disaster:
            return {
                "shouldAlert": True,
                "tier": "PRIORITY",
                "confidence": "MEDIUM",
                "headline": "New Declared Disaster for Nepal",
                "reason": (
                    f"ReliefWeb active disasters moved {new_disaster.get('from')} → "
                    f"{new_disaster.get('to')}. A formal response operation has been opened."
                ),
                "actionable": (
                    "Route district requests through the existing cluster coordination "
                    "rather than opening a parallel operation."
                ),
                "signals": labels([new_disaster]),
                "crossCorrelation": "UN OCHA ReliefWeb",
                "_source": "rules",
            }

        escalating_fire = [s for s in fire if s.get("direction") == "up"]
        if len(escalating_fire) >= 2:
            return {
                "shouldAlert": True,
                "tier": "PRIORITY",
                "confidence": "MEDIUM",
                "headline": "Fire Activity and Smoke Rising Together",
                "reason": (
                    f"{', '.join(labels(escalating_fire, 4))} all escalating. Detections "
                    "plus degrading air quality means smoke, not just burn scars."
                ),
                "actionable": (
                    "Expect valley AQI to worsen and hill-airstrip visibility to drop."
                ),
                "signals": labels(escalating_fire, 4),
                "crossCorrelation": "FIRMS + air quality",
                "_source": "rules",
            }

        if criticals or len(highs) >= 3:
            top = (criticals or highs)[0]
            summary = delta.get("summary") or {}
            return {
                "shouldAlert": True,
                "tier": "ROUTINE",
                "confidence": "LOW",
                "headline": top.get("label") or top.get("reason") or "Hazard Change Detected",
                "reason": (
                    f"{len(criticals)} critical, {len(highs)} high-severity signals. "
                    f"{summary.get('direction')} bias."
                ),
                "actionable": "Monitor",
                "signals": labels(criticals + highs, 4),
                "crossCorrelation": "single-hazard",
                "_source": "rules",
            }

        return {
            "shouldAlert": False,
            "reason": (
                f"{len(signals)} signals, but none meet alert threshold "
                f"({len(criticals)} critical, {len(highs)} high)."
            ),
            "_source": "rules",
        }

    def build_signal_context(
        self, signals: list[dict[str, Any]], delta: dict[str, Any]
    ) -> str:
        summary = delta.get("summary") or {}
        lines = [
            f"DIRECTION: {summary.get('direction')}",
            f"TOTAL CHANGES: {summary.get('totalChanges')}, "
            f"CRITICAL: {summary.get('criticalChanges')}",
            "",
            "NEW AND ESCALATED SIGNALS:",
        ]
        for s in signals:
            label = s.get("label") or s.get("key")
            if s.get("from") is not None:
                lines.append(
                    f"- {label}: {s.get('from')} → {s.get('to')} "
                    f"[{s.get('severity')}, {s.get('direction')}]"
                )
            else:
                lines.append(f"- {label}: {s.get('reason') or ''} [{s.get('severity')}]")
        return "\n".join(lines)

    async def evaluate_and_alert(
        self, llm: Any, delta: dict[str, Any] | None, memory: Any
    ) -> bool:
        """The sweep's entry point. Never raises — an alerting failure must not
        fail a sweep that produced good data."""
        if not self.is_configured:
            return False
        if not delta or not (delta.get("summary") or {}).get("totalChanges"):
            return False
        if self.is_muted():
            log.info("alerts_muted", channel=self.name)
            return False

        signals = [
            *(delta.get("signals") or {}).get("new", []),
            *(delta.get("signals") or {}).get("escalated", []),
        ]
        fresh = [
            s
            for s in signals
            if not memory.is_signal_suppressed(self.signal_key(s))
            and not self.is_semantic_duplicate(s)
        ]
        if not fresh:
            return False

        evaluation = None
        if llm and getattr(llm, "is_configured", False):
            try:
                result = await llm.complete(
                    EVALUATION_PROMPT,
                    self.build_signal_context(fresh, delta),
                    max_tokens=800,
                    timeout=30.0,
                )
                evaluation = parse_json(result.text)
            except Exception as exc:  # noqa: BLE001
                log.warning("alert_llm_evaluation_failed", error=str(exc))

        if not evaluation or not isinstance(evaluation.get("shouldAlert"), bool):
            evaluation = self.rule_based_evaluation(fresh, delta)

        if not evaluation.get("shouldAlert"):
            log.info("no_alert", channel=self.name, reason=evaluation.get("reason"))
            return False

        # An unknown tier from a model degrades to ROUTINE rather than being
        # trusted — the tier decides the cooldown and the hourly cap.
        raw_tier = evaluation.get("tier")
        tier: str = raw_tier if isinstance(raw_tier, str) and raw_tier in TIERS else "ROUTINE"
        if not self.check_rate_limit(tier):
            log.info("alert_rate_limited", channel=self.name, tier=tier)
            return False

        try:
            sent = await self.send_alert(evaluation, delta, tier)
        except Exception as exc:  # noqa: BLE001
            log.warning("alert_send_failed", channel=self.name, error=str(exc))
            return False

        if sent:
            for s in fresh:
                memory.mark_as_alerted(self.signal_key(s))
                self.record_content_hash(s)
            self.record_alert(tier)
            log.info(
                "alert_sent",
                channel=self.name,
                tier=tier,
                source=evaluation.get("_source", "llm"),
                headline=evaluation.get("headline"),
            )
        return sent
