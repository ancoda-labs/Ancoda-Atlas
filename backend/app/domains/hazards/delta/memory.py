"""Hot/cold storage for sweep history and alert cooldowns.

Ported from src/lib/delta/memory.mjs. Two jobs:

  History. The last few sweeps, compacted to exactly the fields the delta
  engine reads, so a stored prior run still compares cleanly against the next
  full sweep.

  Alert suppression. A signal that keeps firing gets progressively longer
  cooldowns, so a week-long monsoon does not send the same alert every fifteen
  minutes for seven days.
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core import runs_store
from app.core.http import now_iso
from app.core.logging import get_logger
from app.domains.hazards.delta.engine import compute_delta

log = get_logger(__name__)

MAX_HOT_RUNS = 3

# Repeated signals get progressively longer suppression. First alert waits 0h;
# a second occurrence 6h; third 12h; fourth and beyond 24h.
ALERT_DECAY_TIERS = [0, 6, 12, 24]

PRUNE_AGE_SINGLE_H = 24
PRUNE_AGE_REPEAT_H = 48


def _epoch_ms(value: Any) -> float:
    if not value:
        return 0.0
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return 0.0
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.timestamp() * 1000


def _now_ms() -> float:
    return datetime.now(timezone.utc).timestamp() * 1000


class MemoryManager:
    def __init__(self) -> None:
        runs_store.ensure_dirs()
        self.hot: dict[str, Any] = self._load_hot()

    # ─── Paths ───────────────────────────────────────────────────────────

    @property
    def _hot_name(self) -> str:
        return f"{runs_store.MEMORY_DIR}/{runs_store.MEMORY_HOT}"

    @property
    def _cold_dir(self) -> Path:
        return runs_store.runs_dir() / runs_store.MEMORY_DIR / runs_store.MEMORY_COLD_DIR

    # ─── Load / save ─────────────────────────────────────────────────────

    def _load_hot(self) -> dict[str, Any]:
        data = runs_store.read_json(self._hot_name)
        # Validate the shape rather than trusting it: a truncated file that
        # still parses would otherwise crash on the first attribute access.
        if (
            isinstance(data, dict)
            and isinstance(data.get("runs"), list)
            and isinstance(data.get("alertedSignals"), dict)
        ):
            return data
        return {"runs": [], "alertedSignals": {}}

    def _save_hot(self) -> None:
        runs_store.write_json(self._hot_name, self.hot)

    # ─── History ─────────────────────────────────────────────────────────

    def add_run(self, synthesized: dict[str, Any]) -> dict[str, Any] | None:
        previous = self.get_last_run()
        delta = compute_delta(synthesized, previous)

        self.hot["runs"].insert(
            0,
            {
                "timestamp": (synthesized.get("meta") or {}).get("timestamp") or now_iso(),
                "data": self._compact_for_storage(synthesized),
                "delta": delta,
            },
        )

        if len(self.hot["runs"]) > MAX_HOT_RUNS:
            archived = self.hot["runs"][MAX_HOT_RUNS:]
            self.hot["runs"] = self.hot["runs"][:MAX_HOT_RUNS]
            self._archive_to_cold(archived)

        self._save_hot()
        return delta

    def get_last_run(self) -> dict[str, Any] | None:
        runs = self.hot.get("runs") or []
        return runs[0]["data"] if runs else None

    def get_run_history(self, n: int = 3) -> list[dict[str, Any]]:
        return (self.hot.get("runs") or [])[:n]

    def get_last_delta(self) -> dict[str, Any] | None:
        runs = self.hot.get("runs") or []
        return runs[0]["delta"] if runs else None

    # ─── Alert suppression ───────────────────────────────────────────────

    def get_alerted_signals(self) -> dict[str, Any]:
        return self.hot.get("alertedSignals") or {}

    def is_signal_suppressed(self, signal_key: str) -> bool:
        entry = self.get_alerted_signals().get(signal_key)
        if not entry:
            return False

        if isinstance(entry, dict):
            occurrences = entry.get("count") or 1
            last_alerted = _epoch_ms(entry.get("lastAlerted"))
        else:
            # Legacy format: a bare ISO string.
            occurrences = 1
            last_alerted = _epoch_ms(entry)

        tier = min(occurrences, len(ALERT_DECAY_TIERS) - 1)
        cooldown_ms = ALERT_DECAY_TIERS[tier] * 60 * 60 * 1000
        return (_now_ms() - last_alerted) < cooldown_ms

    def mark_as_alerted(self, signal_key: str, timestamp: str | None = None) -> None:
        now = timestamp or now_iso()
        signals = self.hot.setdefault("alertedSignals", {})
        existing = signals.get(signal_key)

        if isinstance(existing, dict):
            existing["count"] = (existing.get("count") or 1) + 1
            existing["lastAlerted"] = now
            existing.setdefault("firstSeen", now)
        else:
            # New, or migrating from the legacy string format.
            signals[signal_key] = {
                "firstSeen": existing if isinstance(existing, str) else now,
                "lastAlerted": now,
                "count": 2 if isinstance(existing, str) else 1,
            }
        self._save_hot()

    def prune_alerted_signals(self) -> None:
        """Stop the signal table growing without bound.

        A signal seen once is dropped after 24h; one seen repeatedly is kept
        for 48h from its last alert, so recurring-signal awareness survives a
        quiet night.
        """
        now = _now_ms()
        signals = self.hot.get("alertedSignals") or {}
        for key in list(signals):
            entry = signals[key]
            if isinstance(entry, dict):
                last_time = _epoch_ms(entry.get("lastAlerted"))
                count = entry.get("count") or 1
            else:
                last_time = _epoch_ms(entry)
                count = 1

            max_age_ms = (
                PRUNE_AGE_REPEAT_H if count >= 2 else PRUNE_AGE_SINGLE_H
            ) * 60 * 60 * 1000
            if (now - last_time) > max_age_ms:
                del signals[key]
        self._save_hot()

    # ─── Compaction ──────────────────────────────────────────────────────

    def _compact_for_storage(self, data: dict[str, Any]) -> dict[str, Any]:
        """Strip the heavy arrays, keep exactly what the delta engine reads.

        A full sweep is megabytes; three of them in one file would make every
        write a stall. The fields kept here are precisely the ones the metric
        extractors touch — drop one and that metric silently stops comparing.
        """
        seismic = data.get("seismic") or {}
        weather = data.get("weather") or {}
        fire = data.get("fire") or {}
        air = data.get("airQuality") or {}
        worst = air.get("worst")

        return {
            "meta": data.get("meta"),
            "seismic": {
                "events24h": seismic.get("events24h") or 0,
                "events7d": seismic.get("events7d") or 0,
                "maxMagnitude": seismic.get("maxMagnitude"),
            },
            "weather": {
                "monsoonSeason": weather.get("monsoonSeason") or False,
                "totalAlerts": weather.get("totalAlerts") or 0,
                "alerts": [
                    {"event": a.get("event"), "severity": a.get("severity")}
                    for a in (weather.get("alerts") or [])
                ],
                "stations": [
                    {"city": st.get("city"), "rain5dMm": st.get("rain5dMm")}
                    for st in (weather.get("stations") or [])
                ],
            },
            "fire": {
                "totalDetections": fire.get("totalDetections") or 0,
                "nightDetections": fire.get("nightDetections") or 0,
                "regions": [
                    {
                        "region": r.get("region"),
                        "det": r.get("det"),
                        "night": r.get("night"),
                        "hc": r.get("hc"),
                    }
                    for r in (fire.get("regions") or [])
                ],
            },
            "airQuality": {
                "worst": (
                    {"location": worst.get("location"), "aqi": worst.get("aqi")}
                    if worst
                    else None
                )
            },
            "relief": {
                "disasters": [
                    {"name": d.get("name"), "type": d.get("type")}
                    for d in ((data.get("relief") or {}).get("disasters") or [])
                ]
            },
            "health": [
                {"n": h.get("n"), "err": h.get("err")} for h in (data.get("health") or [])
            ],
            "news": {"count": len(data.get("news") or [])},
            "impact": {"count": (data.get("impact") or {}).get("count") or 0},
            "ideas": [
                {
                    "title": i.get("title"),
                    "type": i.get("type"),
                    "confidence": i.get("confidence"),
                }
                for i in (data.get("ideas") or [])
            ],
        }

    # ─── Cold archive ────────────────────────────────────────────────────

    def _archive_to_cold(self, runs: list[dict[str, Any]]) -> None:
        if not runs:
            return
        runs_store.ensure_dirs()
        date_key = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        cold_path = self._cold_dir / f"{date_key}.json"

        existing: list[Any] = []
        try:
            with cold_path.open("r", encoding="utf-8") as handle:
                loaded = json.load(handle)
                if isinstance(loaded, list):
                    existing = loaded
        except (FileNotFoundError, json.JSONDecodeError, OSError):
            existing = []

        existing.extend(runs)
        try:
            tmp = cold_path.with_suffix(".json.tmp")
            tmp.write_text(
                json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            tmp.replace(cold_path)
        except OSError as exc:
            log.warning("cold_archive_failed", path=str(cold_path), error=str(exc))
