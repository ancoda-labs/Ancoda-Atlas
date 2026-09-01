"""The five national hazard sources.

These assert the shapes the dashboard reads and the degraded states it relies
on. Live upstreams are mocked: a suite that needs USGS to be up is a suite that
fails for reasons that have nothing to do with the code.
"""

import httpx
import respx

from app.domains.hazards.sources import airquality, firms, reliefweb, seismic, weather

# ─── Seismic ─────────────────────────────────────────────────────────────────

USGS = "https://earthquake.usgs.gov/fdsnws/event/1/query"


def _quake(mag, lat, lon, depth, ms, place="somewhere"):
    return {
        "id": f"q{mag}",
        "geometry": {"coordinates": [lon, lat, depth]},
        "properties": {"mag": mag, "place": place, "time": ms, "felt": 0, "tsunami": 0},
    }


@respx.mock
async def test_seismic_buckets_by_province_and_finds_the_nearest_city():
    import time

    now_ms = int(time.time() * 1000)
    respx.get(url__startswith=USGS).mock(
        return_value=httpx.Response(
            200, json={"features": [_quake(5.2, 27.7172, 85.3240, 10, now_ms)]}
        )
    )
    out = await seismic.briefing()
    assert out["totalEvents"] == 1
    assert out["byProvince"] == {"Bagmati": 1}
    assert out["strongest"]["nearest"]["label"] == "Kathmandu"
    assert out["strongest"]["nearest"]["km"] == 0


@respx.mock
async def test_seismic_drops_events_with_no_magnitude():
    """A null-magnitude row would sort to the front and break `strongest`."""
    respx.get(url__startswith=USGS).mock(
        return_value=httpx.Response(
            200,
            json={
                "features": [
                    _quake(None, 27.7, 85.3, 10, 1_700_000_000_000),
                    _quake(4.0, 27.7, 85.3, 10, 1_700_000_000_000),
                ]
            },
        )
    )
    out = await seismic.briefing()
    assert out["totalEvents"] == 1
    assert out["maxMagnitude"] == 4.0


@respx.mock
async def test_seismic_reports_an_upstream_failure_rather_than_zero_events():
    """Zero earthquakes and "USGS is down" must never look the same."""
    respx.get(url__startswith=USGS).mock(return_value=httpx.Response(500))
    out = await seismic.briefing()
    assert "error" in out
    assert "totalEvents" not in out


# ─── Weather ─────────────────────────────────────────────────────────────────

OPEN_METEO = "https://api.open-meteo.com/v1/forecast"


def _forecast(precip_mm, temp=20, code=1):
    return {
        "current": {
            "temperature_2m": temp,
            "relative_humidity_2m": 70,
            "precipitation": 0,
            "weather_code": code,
            "wind_speed_10m": 5,
        },
        "daily": {
            "time": ["2026-08-31"],
            "weather_code": [code],
            "temperature_2m_max": [temp],
            "temperature_2m_min": [temp - 8],
            "precipitation_sum": [precip_mm],
            "precipitation_probability_max": [80],
        },
    }


@respx.mock
async def test_weather_raises_a_flood_alert_above_the_seasonal_threshold(monkeypatch):
    """100mm/day is what Nepal's DHM broadly treats as heavy rainfall."""
    monkeypatch.setattr(weather, "is_monsoon_season", lambda *a: True)
    respx.get(url__startswith=OPEN_METEO).mock(
        return_value=httpx.Response(200, json=_forecast(120))
    )
    out = await weather.briefing()
    assert any(a["event"] == "Flood / Landslide Risk" for a in out["topAlerts"])


@respx.mock
async def test_the_rain_threshold_is_seasonal(monkeypatch):
    """60mm is unremarkable in July and notable in December."""
    respx.get(url__startswith=OPEN_METEO).mock(
        return_value=httpx.Response(200, json=_forecast(60))
    )
    monkeypatch.setattr(weather, "is_monsoon_season", lambda *a: True)
    monsoon = await weather.briefing()
    monkeypatch.setattr(weather, "is_monsoon_season", lambda *a: False)
    dry = await weather.briefing()

    assert monsoon["totalSevereAlerts"] == 0
    assert dry["totalSevereAlerts"] > 0


@respx.mock
async def test_weather_errors_only_when_every_station_fails():
    respx.get(url__startswith=OPEN_METEO).mock(return_value=httpx.Response(500))
    out = await weather.briefing()
    assert "error" in out


def test_monsoon_season_covers_june_to_september():
    from datetime import datetime, timezone

    def at(month):
        return datetime(2026, month, 15, tzinfo=timezone.utc)

    assert weather.is_monsoon_season(at(7)) is True
    assert weather.is_monsoon_season(at(6)) is True
    assert weather.is_monsoon_season(at(9)) is True
    assert weather.is_monsoon_season(at(5)) is False
    assert weather.is_monsoon_season(at(12)) is False


# ─── Air quality ─────────────────────────────────────────────────────────────

AQ = "https://air-quality-api.open-meteo.com/v1/air-quality"


class TestAqiBands:
    """US EPA breakpoints — the scale Nepali outlets and embassies quote."""

    def test_band_boundaries(self):
        assert airquality.aqi_band(50).label == "Good"
        assert airquality.aqi_band(51).label == "Moderate"
        assert airquality.aqi_band(151).label == "Unhealthy"
        assert airquality.aqi_band(301).label == "Hazardous"

    def test_a_missing_reading_is_unknown_not_good(self):
        """Defaulting an absent AQI to 'Good' would be a fabricated all-clear."""
        assert airquality.aqi_band(None).label == "Unknown"


@respx.mock
async def test_air_quality_flags_a_regional_episode():
    respx.get(url__startswith=AQ).mock(
        return_value=httpx.Response(200, json={"current": {"us_aqi": 210, "pm2_5": 90}})
    )
    out = await airquality.briefing()
    assert out["worst"]["aqi"] == 210
    assert any("regional pollution episode" in s for s in out["signals"])


# ─── FIRMS ───────────────────────────────────────────────────────────────────


async def test_firms_without_a_key_reports_no_key_rather_than_zero_fires(monkeypatch):
    """An empty wildfire panel and "no satellite key" are different facts."""
    monkeypatch.setattr(firms.settings, "FIRMS_MAP_KEY", "")
    out = await firms.briefing()
    assert out["status"] == "no_key"
    assert "totalDetections" not in out


def test_firms_csv_parsing():
    rows = firms.parse_csv(
        "latitude,longitude,frp,confidence,daynight\n27.7,85.3,42.5,h,N\n28.1,84.0,3.1,n,D"
    )
    assert len(rows) == 2
    assert rows[0]["confidence"] == "h"


def test_firms_high_intensity_uses_the_frp_threshold():
    """FRP > 10 MW separates forest fires from agricultural burns."""
    fires = [
        {"latitude": "27.7", "longitude": "85.3", "frp": "42.5", "confidence": "h", "daynight": "N"},
        {"latitude": "28.1", "longitude": "84.0", "frp": "3.1", "confidence": "n", "daynight": "D"},
    ]
    out = firms.analyze_fires(fires, "Bagmati")
    assert out["totalDetections"] == 2
    assert len(out["highIntensity"]) == 1
    assert out["nightDetections"] == 1


def test_firms_handles_no_detections():
    out = firms.analyze_fires([], "Karnali")
    assert out["totalDetections"] == 0
    assert out["highIntensity"] == []


# ─── ReliefWeb ───────────────────────────────────────────────────────────────


@respx.mock
async def test_reliefweb_falls_back_to_hdx_on_403_and_says_it_is_stale():
    """The fallback must be labelled, not presented as equivalent."""
    respx.post(url__startswith="https://api.reliefweb.int/v2").mock(
        return_value=httpx.Response(403, json={"error": {"message": "unapproved appname"}})
    )
    respx.get(url__startswith="https://data.humdata.org").mock(
        return_value=httpx.Response(
            200,
            json={
                "result": {
                    "results": [
                        {
                            "title": "Nepal monsoon flood damage assessment",
                            "name": "npl-flood",
                            "groups": [{"name": "npl", "display_name": "Nepal"}],
                            "metadata_modified": "2026-08-01T00:00:00",
                            "tags": [],
                        }
                    ]
                }
            },
        )
    )
    out = await reliefweb.briefing()
    assert out["stale"] is True
    assert "403" in out["rwError"]
    assert len(out["latestReports"]) == 1


def test_hdx_filter_rejects_non_hazard_nepal_datasets():
    """HDX's Nepal group carries trade statistics and refugee surveys too."""
    flood = {"title": "Nepal flood damage", "notes": "", "tags": []}
    trade = {"title": "Nepal trade statistics 2026", "notes": "", "tags": []}
    assert reliefweb._is_hazard_dataset(flood) is True
    assert reliefweb._is_hazard_dataset(trade) is False
