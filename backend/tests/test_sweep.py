"""The sweep orchestrator's failure isolation."""

import asyncio

from app.domains.hazards import sweep


async def test_one_failing_source_does_not_take_down_the_sweep(monkeypatch):
    """The whole point of the fan-out: a portal being down degrades its panel."""

    async def ok():
        return {"source": "fine", "signals": []}

    async def boom():
        raise RuntimeError("upstream exploded")

    monkeypatch.setattr(sweep, "SOURCES", [("Good", ok), ("Bad", boom)])
    out = await sweep.full_briefing()

    assert out["atlas"]["sourcesOk"] == 1
    assert out["atlas"]["sourcesFailed"] == 1
    assert "Good" in out["sources"]
    assert "Bad" not in out["sources"]
    assert out["errors"][0]["name"] == "Bad"


async def test_a_hanging_source_is_cut_off_by_its_own_timeout(monkeypatch):
    """Per-source, not per-sweep: one hang must not hold up four good answers."""

    async def hangs():
        await asyncio.sleep(60)
        return {}

    monkeypatch.setattr(sweep, "SOURCE_TIMEOUT_S", 0.05)
    result = await sweep.run_source("Slow", hangs)

    assert result["status"] == "error"
    assert "timed out" in result["error"]


async def test_timing_is_reported_for_failed_sources_too(monkeypatch):
    """An operator needs to see that a source was tried, not just that it is absent."""

    async def boom():
        raise RuntimeError("nope")

    monkeypatch.setattr(sweep, "SOURCES", [("Bad", boom)])
    out = await sweep.full_briefing()
    assert out["timing"]["Bad"]["status"] == "error"


class TestIdeasFallback:
    """A model failure must not empty the reads panel."""

    def test_the_rule_engine_produces_reads_the_llm_path_would_have_lost(self):
        """The case seen live: a configured Groq key that answers 413.

        The Node build set an empty list here. No component renders anything
        for `llm-failed`, so that was a silently blank panel during exactly the
        event it exists for.
        """
        from app.domains.hazards.synthesize import generate_ideas

        sweep = {
            "seismic": {"maxMagnitude": 6.1},
            "impact": {"count": 20, "topRegions": [{"region": "Rasuwa", "count": 9}]},
            "news": list(range(50)),
        }
        assert generate_ideas(sweep), "the rule engine had reads to give"
