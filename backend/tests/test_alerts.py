"""Alerting. An alert nobody trusts is worse than no alert."""

import time

import pytest

from app.domains.alerts.base import TIERS, Alerter, parse_json
from app.domains.alerts.discord import DiscordAlerter, truncate
from app.domains.alerts.telegram import TelegramAlerter, escape_md


class FakeMemory:
    def __init__(self, suppressed=()):
        self.suppressed = set(suppressed)
        self.marked = []

    def is_signal_suppressed(self, key):
        return key in self.suppressed

    def mark_as_alerted(self, key, timestamp=None):
        self.marked.append(key)


class Recorder(Alerter):
    name = "recorder"

    def __init__(self):
        super().__init__()
        self.sent = []

    @property
    def is_configured(self):
        return True

    async def send_alert(self, evaluation, delta, tier):
        self.sent.append((tier, evaluation.get("headline")))
        return True


def _delta(**over):
    base = {
        "summary": {"totalChanges": 3, "criticalChanges": 1, "direction": "risk-off"},
        "signals": {"new": [], "escalated": []},
    }
    base.update(over)
    return base


class TestTiers:
    def test_the_three_tiers_have_cooldowns_and_hourly_caps(self):
        """Without these, a rolling monsoon alerts every fifteen minutes for a week."""
        assert set(TIERS) == {"FLASH", "PRIORITY", "ROUTINE"}
        for tier in TIERS.values():
            assert tier.cooldown_s > 0
            assert tier.max_per_hour > 0

    def test_flash_is_the_most_permissive_and_routine_the_least(self):
        assert TIERS["FLASH"].cooldown_s < TIERS["ROUTINE"].cooldown_s
        assert TIERS["FLASH"].max_per_hour > TIERS["ROUTINE"].max_per_hour


class TestRuleEvaluation:
    def test_a_damaging_earthquake_is_a_flash(self):
        """It outranks everything else in Nepal."""
        out = Recorder().rule_based_evaluation(
            [{"key": "seismic_event", "severity": "critical", "reason": "M5.8"}], _delta()
        )
        assert out["shouldAlert"] is True
        assert out["tier"] == "FLASH"

    def test_rain_onto_recently_shaken_ground_is_a_priority(self):
        """The combination that closed the Araniko highway in 2015."""
        out = Recorder().rule_based_evaluation(
            [
                {"key": "weather_alerts", "severity": "high", "direction": "up", "label": "Weather Alerts"},
                {"key": "quakes_24h", "severity": "high", "direction": "up", "label": "Earthquakes (24h)"},
            ],
            _delta(),
        )
        assert out["tier"] == "PRIORITY"
        assert "Compound Hazard" in out["headline"]

    def test_a_single_moderate_signal_does_not_alert(self):
        """One metric moving without a confirming signal is noise."""
        out = Recorder().rule_based_evaluation(
            [{"key": "quakes_7d", "severity": "moderate", "direction": "up"}], _delta()
        )
        assert out["shouldAlert"] is False

    def test_a_new_declared_disaster_alerts(self):
        out = Recorder().rule_based_evaluation(
            [{"key": "active_disasters", "severity": "high", "direction": "up", "from": 0, "to": 1}],
            _delta(),
        )
        assert out["shouldAlert"] is True
        assert "Declared Disaster" in out["headline"]


class TestSemanticDeduplication:
    def test_the_same_condition_with_a_different_decimal_is_one_signal(self):
        """"rainfall up 12.3%" and "up 12.7%" an hour apart are not two events."""
        alerter = Recorder()
        first = {"text": "Rainfall up 12.3% at Pokhara"}
        second = {"text": "Rainfall up 12.7% at Pokhara"}
        assert alerter.content_hash(first) == alerter.content_hash(second)

    def test_a_time_in_the_text_is_normalised_out(self):
        alerter = Recorder()
        assert alerter.content_hash({"text": "Alert at 14:30"}) == alerter.content_hash(
            {"text": "Alert at 09:15"}
        )

    def test_genuinely_different_signals_hash_differently(self):
        alerter = Recorder()
        assert alerter.content_hash({"text": "Rainfall rising"}) != alerter.content_hash(
            {"text": "Fire detections rising"}
        )

    def test_a_metric_signal_keys_on_label_and_direction(self):
        alerter = Recorder()
        up = {"label": "Peak AQI", "direction": "up", "to": 210}
        same = {"label": "Peak AQI", "direction": "up", "to": 240}
        down = {"label": "Peak AQI", "direction": "down"}
        assert alerter.content_hash(up) == alerter.content_hash(same)
        assert alerter.content_hash(up) != alerter.content_hash(down)

    def test_a_recorded_hash_is_a_duplicate_afterwards(self):
        alerter = Recorder()
        signal = {"text": "Rainfall rising"}
        assert alerter.is_semantic_duplicate(signal) is False
        alerter.record_content_hash(signal)
        assert alerter.is_semantic_duplicate(signal) is True


class TestRateLimiting:
    def test_a_second_alert_inside_the_cooldown_is_refused(self):
        alerter = Recorder()
        assert alerter.check_rate_limit("FLASH") is True
        alerter.record_alert("FLASH")
        assert alerter.check_rate_limit("FLASH") is False

    def test_the_hourly_cap_is_enforced(self, monkeypatch):
        alerter = Recorder()
        # Past the cooldown, but at the cap.
        for _ in range(TIERS["ROUTINE"].max_per_hour):
            alerter._alert_history.append(
                {"tier": "ROUTINE", "at": time.monotonic() - 3000}
            )
        assert alerter.check_rate_limit("ROUTINE") is False

    def test_history_does_not_grow_without_bound(self):
        alerter = Recorder()
        for _ in range(120):
            alerter.record_alert("ROUTINE")
        assert len(alerter._alert_history) <= 50


class TestMuting:
    def test_muting_suppresses_alerts(self):
        alerter = Recorder()
        alerter.mute_for(1)
        assert alerter.is_muted() is True

    def test_an_expired_mute_clears_itself(self):
        alerter = Recorder()
        alerter._mute_until = time.monotonic() - 1
        assert alerter.is_muted() is False
        assert alerter._mute_until is None


class TestEvaluateAndAlert:
    async def test_no_changes_means_no_alert(self):
        alerter = Recorder()
        sent = await alerter.evaluate_and_alert(None, {"summary": {"totalChanges": 0}}, FakeMemory())
        assert sent is False

    async def test_a_muted_alerter_stays_quiet(self):
        alerter = Recorder()
        alerter.mute_for(1)
        delta = _delta(signals={"new": [{"key": "seismic_event", "severity": "critical"}], "escalated": []})
        assert await alerter.evaluate_and_alert(None, delta, FakeMemory()) is False

    async def test_a_suppressed_signal_is_not_re_alerted(self):
        """The decay cooldown in memory is what stops an aftershock sequence
        re-alerting on every sweep."""
        alerter = Recorder()
        delta = _delta(signals={"new": [{"key": "seismic_event", "severity": "critical"}], "escalated": []})
        memory = FakeMemory(suppressed={"seismic_event"})
        assert await alerter.evaluate_and_alert(None, delta, memory) is False

    async def test_a_qualifying_signal_alerts_and_is_marked(self):
        alerter = Recorder()
        delta = _delta(signals={"new": [{"key": "seismic_event", "severity": "critical"}], "escalated": []})
        memory = FakeMemory()
        assert await alerter.evaluate_and_alert(None, delta, memory) is True
        assert alerter.sent[0][0] == "FLASH"
        assert "seismic_event" in memory.marked

    async def test_an_unknown_tier_from_a_model_degrades_to_routine(self):
        """The tier decides the cooldown and the cap, so it is not trusted raw."""

        class Model:
            is_configured = True

            async def complete(self, *a, **k):
                from app.domains.ai.providers.base import Completion

                return Completion(
                    text='{"shouldAlert": true, "tier": "CATASTROPHIC", "headline": "H", "reason": "R"}',
                    model="m",
                )

        alerter = Recorder()
        delta = _delta(signals={"new": [{"key": "quakes_24h", "severity": "high"}], "escalated": []})
        await alerter.evaluate_and_alert(Model(), delta, FakeMemory())
        assert alerter.sent[0][0] == "ROUTINE"

    async def test_a_send_failure_does_not_raise_into_the_sweep(self):
        class Broken(Recorder):
            async def send_alert(self, evaluation, delta, tier):
                raise RuntimeError("webhook down")

        delta = _delta(signals={"new": [{"key": "seismic_event", "severity": "critical"}], "escalated": []})
        assert await Broken().evaluate_and_alert(None, delta, FakeMemory()) is False


class TestFormatting:
    def test_telegram_escapes_markdown_that_would_break_a_send(self):
        """An unmatched underscore silently fails the whole message."""
        assert escape_md("Nawalparasi_East") == "Nawalparasi\\_East"

    def test_telegram_chunks_long_messages_on_line_boundaries(self):
        alerter = TelegramAlerter(bot_token="t", chat_id="c")
        text = "\n".join(f"line {i}" for i in range(2000))
        chunks = alerter.chunk_text(text)
        assert len(chunks) > 1
        assert all(len(c) <= 4096 for c in chunks)

    def test_a_short_message_is_one_chunk(self):
        alerter = TelegramAlerter(bot_token="t", chat_id="c")
        assert alerter.chunk_text("short") == ["short"]

    def test_the_telegram_alert_carries_the_monitoring_caveat(self):
        alerter = TelegramAlerter(bot_token="t", chat_id="c")
        text = alerter.format_alert(
            {"headline": "H", "reason": "R", "confidence": "HIGH"}, _delta(), "FLASH"
        )
        assert "not a warning system" in text

    def test_discord_truncates_to_the_embed_limits(self):
        """Exceeding one limit rejects the whole message."""
        assert len(truncate("x" * 500, 256)) == 256
        assert truncate("", 256) == "—"

    def test_the_discord_embed_carries_the_caveat(self):
        embed = DiscordAlerter(webhook_url="https://x").build_embed(
            {"headline": "H", "reason": "R", "confidence": "HIGH"}, _delta(), "FLASH"
        )
        assert "not a warning system" in embed["footer"]["text"]

    async def test_discord_sends_at_most_ten_embeds(self, monkeypatch):
        """The API rejects a message carrying more than ten."""
        captured = {}

        async def capture(payload):
            captured["payload"] = payload
            return True

        alerter = DiscordAlerter(webhook_url="https://x")
        monkeypatch.setattr(alerter, "_post", capture)
        await alerter.send_actionable_ideas(
            [{"title": f"T{i}", "rationale": "R"} for i in range(20)]
        )
        assert len(captured["payload"]["embeds"]) == 10

    async def test_discord_sends_nothing_when_there_are_no_reads(self):
        assert await DiscordAlerter(webhook_url="https://x").send_actionable_ideas([]) is False


class TestConfiguration:
    def test_telegram_needs_both_a_token_and_a_chat(self):
        assert TelegramAlerter(bot_token="t", chat_id=None).is_configured is False
        assert TelegramAlerter(bot_token="t", chat_id="c").is_configured is True

    def test_discord_needs_only_a_webhook(self):
        assert DiscordAlerter(webhook_url=None).is_configured is False
        assert DiscordAlerter(webhook_url="https://discord.test/x").is_configured is True


@pytest.mark.parametrize(
    "text,expected",
    [
        ('{"shouldAlert": true}', {"shouldAlert": True}),
        ('Sure! {"shouldAlert": false}', {"shouldAlert": False}),
        ("no json", None),
        ("", None),
    ],
)
def test_parse_json_recovers_an_object_or_gives_up(text, expected):
    assert parse_json(text) == expected
