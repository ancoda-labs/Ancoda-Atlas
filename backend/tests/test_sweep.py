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
