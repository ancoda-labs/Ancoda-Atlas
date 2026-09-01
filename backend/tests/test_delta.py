"""The delta engine and its memory."""

from datetime import datetime, timedelta, timezone

import pytest

from app.core import runs_store
from app.domains.hazards.delta.engine import compute_delta
from app.domains.hazards.delta.memory import ALERT_DECAY_TIERS, MAX_HOT_RUNS, MemoryManager


def sweep(**over):
    base = {
        "meta": {"timestamp": "2026-08-31T12:00:00.000Z", "sourcesOk": 5},
        "seismic": {"events24h": 0, "events7d": 0, "maxMagnitude": 3.0},
        "weather": {"totalAlerts": 0, "alerts": [], "stations": []},
        "fire": {"totalDetections": 0, "nightDetections": 0, "regions": []},
        "airQuality": {"worst": {"location": "Kathmandu", "aqi": 100}},
        "relief": {"disasters": []},
        "health": [],
        "news": [],
        "impact": {"count": 0},
    }
    for k, v in over.items():
        if isinstance(v, dict) and isinstance(base.get(k), dict):
            base[k] = {**base[k], **v}
        else:
            base[k] = v
    return base


class TestComputeDelta:
    def test_the_first_run_has_no_delta(self):
        """There is nothing to compare against, and inventing one would be a lie."""
        assert compute_delta(sweep(), None) is None

    def test_a_new_earthquake_is_never_below_threshold(self):
        """quakes_24h has a threshold of 1: any new quake in Nepal matters."""
        d = compute_delta(sweep(seismic={"events24h": 1}), sweep())
        keys = [s["key"] for s in d["signals"]["escalated"]]
        assert "quakes_24h" in keys

    def test_the_m55_tripwire_fires_once_on_crossing(self):
        d = compute_delta(sweep(seismic={"maxMagnitude": 5.8}), sweep(seismic={"maxMagnitude": 3.0}))
        new_keys = [s["key"] for s in d["signals"]["new"]]
        assert "seismic_event" in new_keys
        assert d["summary"]["criticalChanges"] >= 5

    def test_the_tripwire_does_not_refire_while_it_stays_high(self):
        """Otherwise every sweep during an aftershock sequence re-alerts."""
        d = compute_delta(
            sweep(seismic={"maxMagnitude": 5.9}), sweep(seismic={"maxMagnitude": 5.8})
        )
        assert [s["key"] for s in d["signals"]["new"]] == []

    def test_it_resolves_when_the_magnitude_drops_back(self):
        d = compute_delta(
            sweep(seismic={"maxMagnitude": 3.0}), sweep(seismic={"maxMagnitude": 5.8})
        )
        resolved = [s for s in d["signals"]["deescalated"] if s["key"] == "seismic_event"]
        assert resolved and resolved[0]["direction"] == "resolved"

    def test_rising_hazard_reads_as_risk_off(self):
        current = sweep(
            seismic={"events24h": 6},
            weather={"totalAlerts": 4, "alerts": [{"severity": "extreme"}]},
            impact={"count": 9},
        )
        d = compute_delta(current, sweep())
        assert d["summary"]["direction"] == "risk-off"

    def test_source_degradation_is_flagged(self):
        current = sweep(health=[{"n": "A", "err": True}, {"n": "B", "err": True}, {"n": "C", "err": True}])
        d = compute_delta(current, sweep(health=[{"n": "A", "err": False}]))
        assert any(s["key"] == "source_degradation" for s in d["signals"]["new"])

    def test_a_compacted_previous_run_still_compares(self):
        """Stored runs keep news as {count}, not a list. The metric must read both."""
        previous = sweep(news={"count": 10})
        current = sweep(news=list(range(30)))
        d = compute_delta(current, previous)
        entry = next(s for s in d["signals"]["escalated"] if s["key"] == "hazard_news")
        assert entry["from"] == 10
        assert entry["to"] == 30

    def test_a_missing_numeric_metric_is_skipped_not_zeroed(self):
        """Treating an absent AQI as 0 would report a 100% improvement."""
        current = sweep(airQuality={"worst": None})
        d = compute_delta(current, sweep())
        assert not any(
            s["key"] == "worst_aqi"
            for s in d["signals"]["escalated"] + d["signals"]["deescalated"]
        )


class TestMemoryManager:
    @pytest.fixture(autouse=True)
    def isolated(self, tmp_path, monkeypatch):
        monkeypatch.setattr(
            type(runs_store.settings), "runs_dir", property(lambda self: tmp_path)
        )
        return tmp_path

    def test_it_keeps_only_the_hot_window(self):
        m = MemoryManager()
        for i in range(MAX_HOT_RUNS + 2):
            m.add_run(sweep(meta={"timestamp": f"2026-08-31T1{i}:00:00.000Z"}))
        assert len(m.hot["runs"]) == MAX_HOT_RUNS

    def test_overflow_is_archived_to_cold_rather_than_dropped(self, isolated):
        m = MemoryManager()
        for i in range(MAX_HOT_RUNS + 2):
            m.add_run(sweep(meta={"timestamp": f"2026-08-31T1{i}:00:00.000Z"}))
        cold = list((isolated / "memory" / "cold").glob("*.json"))
        assert cold, "overflow runs were lost instead of archived"

    def test_stored_runs_are_compacted(self):
        """Three full sweeps in one file would stall every write."""
        m = MemoryManager()
        m.add_run(sweep(news=[{"title": "x"} for _ in range(50)]))
        stored = m.get_last_run()
        assert stored["news"] == {"count": 50}
        assert "recent" not in stored["seismic"]

    def test_the_second_run_produces_a_delta(self):
        m = MemoryManager()
        assert m.add_run(sweep()) is None
        assert m.add_run(sweep(seismic={"events24h": 4})) is not None

    def test_a_signal_is_not_suppressed_the_first_time(self):
        """Tier zero is a zero-hour cooldown: the first alert always goes out."""
        m = MemoryManager()
        assert m.is_signal_suppressed("flood") is False
        m.mark_as_alerted("flood")
        assert ALERT_DECAY_TIERS[0] == 0

    def test_repeats_are_suppressed_for_longer_each_time(self):
        """A week-long monsoon must not alert every fifteen minutes."""
        m = MemoryManager()
        m.mark_as_alerted("flood")
        m.mark_as_alerted("flood")
        assert m.is_signal_suppressed("flood") is True
        assert m.get_alerted_signals()["flood"]["count"] == 2

    def test_a_legacy_string_entry_migrates_rather_than_crashing(self):
        """Older builds stored a bare ISO string here."""
        m = MemoryManager()
        m.hot["alertedSignals"]["old"] = "2026-08-01T00:00:00.000Z"
        m.mark_as_alerted("old")
        entry = m.get_alerted_signals()["old"]
        assert entry["count"] == 2
        assert entry["firstSeen"] == "2026-08-01T00:00:00.000Z"

    def test_pruning_drops_stale_signals(self):
        m = MemoryManager()
        old = (datetime.now(timezone.utc) - timedelta(hours=30)).isoformat()
        m.hot["alertedSignals"]["stale"] = {"lastAlerted": old, "count": 1}
        m.hot["alertedSignals"]["fresh"] = {"lastAlerted": datetime.now(timezone.utc).isoformat(), "count": 1}
        m.prune_alerted_signals()
        assert "stale" not in m.get_alerted_signals()
        assert "fresh" in m.get_alerted_signals()

    def test_a_repeating_signal_is_kept_longer_than_a_one_off(self):
        m = MemoryManager()
        age = (datetime.now(timezone.utc) - timedelta(hours=30)).isoformat()
        m.hot["alertedSignals"]["once"] = {"lastAlerted": age, "count": 1}
        m.hot["alertedSignals"]["repeat"] = {"lastAlerted": age, "count": 3}
        m.prune_alerted_signals()
        assert "once" not in m.get_alerted_signals()
        assert "repeat" in m.get_alerted_signals()

    def test_memory_survives_a_restart(self):
        MemoryManager().add_run(sweep(seismic={"events24h": 7}))
        assert MemoryManager().get_last_run()["seismic"]["events24h"] == 7

    def test_a_corrupt_hot_file_starts_fresh_rather_than_crashing(self, isolated):
        (isolated / "memory").mkdir(parents=True, exist_ok=True)
        (isolated / "memory" / "hot.json").write_text("{ truncated")
        m = MemoryManager()
        assert m.hot == {"runs": [], "alertedSignals": {}}
