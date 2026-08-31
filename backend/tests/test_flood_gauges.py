"""River gauges: the classification rules, and the readings that must not be shown."""

import httpx
import respx

from app.domains.flood.content import reconcile
from app.domains.flood.gauges import (
    CORRIDOR_STATIONS,
    STALE_AFTER_MINUTES,
    build_gauge,
    classify,
    fetch_corridor_gauges,
)


class TestClassify:
    def test_at_or_above_danger_is_danger(self):
        assert classify(5.0, 3.0, 5.0) == "danger"
        assert classify(5.1, 3.0, 5.0) == "danger"

    def test_between_warning_and_danger(self):
        assert classify(4.0, 3.0, 5.0) == "warning"

    def test_below_warning_is_normal(self):
        assert classify(1.0, 3.0, 5.0) == "normal"

    def test_no_reading_is_unknown(self):
        assert classify(None, 3.0, 5.0) == "unknown"

    def test_no_thresholds_is_unknown_not_normal(self):
        """Calling an unmeasurable station 'normal' is the one wrong answer.

        It reads as an all-clear for a gauge nobody can actually assess.
        """
        assert classify(2.0, None, None) == "unknown"


class TestBuildGauge:
    def _station(self, **over):
        from datetime import datetime, timezone

        base = {
            "id": 1,
            "title": "Trishuli at Betrawati",
            "waterLevel": 2.0,
            "warningLevel": 3.0,
            "dangerLevel": 4.0,
            "waterLevelOn": datetime.now(timezone.utc).isoformat(),
            "steady": "steady",
            "point": {"coordinates": [85.18, 27.96]},
        }
        base.update(over)
        return base

    def test_a_sensor_spike_is_discarded_rather_than_reported_as_a_flood(self):
        """One BIPAD station reports 100008 m. That is instrument error.

        Showing it would put a gauge into 'danger' and tell people a wall of
        water is coming.
        """
        g = build_gauge(CORRIDOR_STATIONS[4], self._station(waterLevel=100008))
        assert g["waterLevel"] is None
        assert g["level"] == "unknown"

    def test_a_stale_reading_is_never_classified(self):
        """Some gauges have been offline for years.

        Presenting a 2021 water level as 'now' is worse than showing none.
        """
        old = "2021-01-01T00:00:00+00:00"
        g = build_gauge(CORRIDOR_STATIONS[4], self._station(waterLevelOn=old))
        assert g["stale"] is True
        assert g["level"] == "unknown"
        assert g["ageMinutes"] > STALE_AFTER_MINUTES

    def test_a_fresh_reading_is_classified(self):
        g = build_gauge(CORRIDOR_STATIONS[4], self._station(waterLevel=3.5))
        assert g["stale"] is False
        assert g["level"] == "warning"

    def test_percent_of_danger_is_capped(self):
        g = build_gauge(CORRIDOR_STATIONS[4], self._station(waterLevel=7.9, dangerLevel=4.0))
        assert g["percentOfDanger"] == 140

    def test_the_district_comes_from_the_coordinate_not_the_label(self):
        """Five of fourteen hand-typed districts disagreed with BIPAD's own
        coordinates, and two were about 75 km out. One source for both now."""
        g = build_gauge(CORRIDOR_STATIONS[4], self._station())
        assert g["district"]  # resolved from the polygon or the fallback
        assert g["lat"] == 27.96
        assert g["lon"] == 85.18

    def test_no_photo_url_when_the_station_has_no_image(self):
        g = build_gauge(CORRIDOR_STATIONS[4], self._station())
        assert g["photo"] is None
        g = build_gauge(CORRIDOR_STATIONS[4], self._station(image="http://x/y.jpg"))
        assert g["photo"] == "/api/flood/station-photo?id=1"


@respx.mock
async def test_bipad_being_down_yields_an_honest_error_not_empty_gauges():
    """An outage and a calm river must never look the same."""
    respx.get(url__startswith="https://bipadportal.gov.np").mock(
        return_value=httpx.Response(503)
    )
    out = await fetch_corridor_gauges()
    assert out["gauges"] == []
    assert out["error"] is not None
    assert out["fetchedAt"]


@respx.mock
async def test_stations_bipad_does_not_return_are_skipped_not_faked():
    respx.get(url__startswith="https://bipadportal.gov.np").mock(
        return_value=httpx.Response(
            200,
            json={
                "results": [
                    {
                        "id": 9,
                        "title": "Narayani at Devghat",
                        "waterLevel": 1.0,
                        "warningLevel": 2.0,
                        "dangerLevel": 3.0,
                        "waterLevelOn": None,
                        "point": {"coordinates": [84.4, 27.7]},
                    }
                ]
            },
        )
    )
    out = await fetch_corridor_gauges()
    assert len(out["gauges"]) == 1
    assert out["gauges"][0]["label"] == "Narayani at Devghat"


class TestReconcile:
    def test_a_breakdown_that_closes_reports_nothing(self):
        assert reconcile([{"id": "deaths", "total": 5, "items": [{"value": 2}, {"value": 3}]}]) == []

    def test_a_breakdown_that_does_not_close_is_reported(self):
        """The parts and the stated total disagreeing means one is wrong."""
        out = reconcile([{"id": "deaths", "total": 9, "items": [{"value": 2}, {"value": 3}]}])
        assert out == [{"id": "deaths", "stated": 9, "summed": 5}]

    def test_overlapping_groups_opt_out(self):
        """Some groups overlap rather than partition; closing was never meant."""
        assert reconcile([{"id": "air", "total": 9, "items": [{"value": 5}], "no_total_check": True}]) == []


def test_the_shipped_sitrep_reconciles():
    """A real guard on real content: the published casualty figures must add up."""
    from app.domains.flood.content import load_flood_content

    sitrep = load_flood_content()["sitrep"]
    assert sitrep is not None
    assert sitrep["discrepancies"] == [], (
        f"reviewed sitrep no longer reconciles: {sitrep['discrepancies']}"
    )
