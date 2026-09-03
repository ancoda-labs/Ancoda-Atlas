"""OWID CO₂ parse: latest-year selection, missing countries, stale cache.

Numbers in these fixtures are invented for the parser, not for the page. The
page never sees them — a failed fetch must not fall back to anything in here.
"""

import httpx
import pytest
import respx

from app.core import runs_store
from app.domains.climate import service
from app.domains.climate.content import match_statements, public_facts
from app.domains.climate.sources import owid_co2
from app.domains.climate.tasks import run_climate_refresh

HEADER = (
    "country,year,iso_code,co2,co2_per_capita,share_global_co2,"
    "share_global_cumulative_co2,cumulative_co2,consumption_co2"
)

# 1849 baselines — only World and the United States, so 1850 shares can be
# computed without inventing a Chinese or Nepali pre-1850 figure.
WORLD_1849 = "World,1849,OWID_WRL,2,0.1,100,100,50,"
US_1849 = "United States,1849,USA,1,0.2,50,4,2,"

NEPAL_2024 = "Nepal,2024,NPL,18.8,0.5,0.05,0.01,20,"
US_2024 = "United States,2024,USA,4800,14.3,12.7,24.0,480,"
EU_2024 = "European Union (27),2024,,2500,6.8,6.6,16.0,320,"
CHINA_2024 = "China,2024,CHN,12000,8.4,31.7,15.0,300,"
INDIA_2024 = "India,2024,IND,3100,2.1,8.2,3.6,70,"
WORLD_2024 = "World,2024,OWID_WRL,37800,4.7,100.0,100.0,2000,"
NEPAL_2023 = "Nepal,2023,NPL,17.1,0.48,0.04,0.01,18,40"
WORLD_2023 = "World,2023,OWID_WRL,37000,4.6,100.0,100.0,1900,37000"
US_2023 = "United States,2023,USA,4700,14.0,12.6,24.0,460,5000"
CHINA_2023 = "China,2023,CHN,11900,8.3,31.5,15.0,290,11000"
WORLD_2025 = "World,2025,OWID_WRL,38000,4.7,100.0,100.0,2010,"
SRI_2024 = "Sri Lanka,2024,LKA,21,0.9,0.05,0.03,12,"


def _csv(*rows: str) -> str:
    return "\n".join((HEADER, *rows)) + "\n"


FULL = _csv(
    WORLD_1849,
    US_1849,
    NEPAL_2023,
    WORLD_2023,
    US_2023,
    CHINA_2023,
    NEPAL_2024,
    US_2024,
    EU_2024,
    CHINA_2024,
    INDIA_2024,
    WORLD_2024,
    SRI_2024,
)

CAPTIONS = {
    "cumulative_1750": {
        "name_en": "Since 1750",
        "name_ne": "सन् १७५० यता",
        "caption_en": "Territorial fossil CO2 since 1750. Year {year}.",
        "caption_ne": "सन् १७५०. {year}.",
    },
    "cumulative_1850": {
        "name_en": "Since 1850",
        "name_ne": "सन् १८५० यता",
        "caption_en": "Since 1850, year {year}.",
        "caption_ne": "१८५०, {year}.",
    },
    "annual_latest": {
        "name_en": "{year}",
        "name_ne": "{year}",
        "caption_en": "Territorial in {year}.",
        "caption_ne": "{year} क्षेत्रीय.",
    },
    "per_capita": {
        "name_en": "Per person",
        "name_ne": "प्रतिव्यक्ति",
        "caption_en": "Per person in {year}.",
        "caption_ne": "प्रतिव्यक्ति {year}.",
    },
    "consumption": {
        "name_en": "Consumption",
        "name_ne": "उपभोग",
        "caption_en": "Consumption in {year}.",
        "caption_ne": "उपभोग {year}.",
    },
}


def _parse(text: str, peers: list[str] | None = None) -> dict:
    return owid_co2.parse_owid_csv(
        text,
        peers=peers or ["sriLanka"],
        captions=CAPTIONS,
        scale_caption_en="Axis rescaled.",
        scale_caption_ne="अक्ष.",
    )


def _ids(rows: list[dict]) -> list[str]:
    return [row["id"] for row in rows]


class TestParse:
    def test_selects_the_latest_year_nepal_and_world_share(self):
        out = _parse(FULL)
        assert out["error"] is None
        assert out["year"] == 2024
        assert out["defaultMetric"] == "cumulative_1750"
        metric = out["metrics"]["cumulative_1750"]
        nepal = next(row for row in metric["rows"] if row["id"] == "nepal")
        assert nepal["value"] == 0.01
        assert metric["year"] == 2024
        assert "2024" in (metric["captionEn"] or "")

    def test_ignores_a_newer_world_only_year(self):
        out = _parse(_csv(NEPAL_2024, US_2024, WORLD_2024, WORLD_2025))
        assert out["year"] == 2024
        assert any(row["id"] == "nepal" for row in out["metrics"]["cumulative_1750"]["rows"])

    def test_a_missing_country_is_omitted_not_invented(self):
        out = _parse(_csv(NEPAL_2024, WORLD_2024, CHINA_2024))
        ids = _ids(out["metrics"]["cumulative_1750"]["rows"])
        assert "nepal" in ids
        assert "china" in ids
        assert "unitedStates" not in ids
        assert "india" not in ids

    def test_matches_european_union_by_name_without_iso(self):
        out = _parse(_csv(NEPAL_2024, WORLD_2024, EU_2024))
        eu = next(
            row for row in out["metrics"]["annual_latest"]["rows"] if row["id"] == "europeanUnion"
        )
        assert eu["labelEn"] == "EU-27"

    def test_empty_csv_is_an_error_with_no_numbers(self):
        out = _parse("")
        assert out["error"]
        assert out["metrics"] == {}
        assert out["year"] is None

    def test_five_framings_are_keyed_and_captions_follow_the_year(self):
        out = _parse(FULL)
        assert set(out["metrics"]) == set(owid_co2.METRIC_IDS)
        annual = out["metrics"]["annual_latest"]
        assert annual["nameEn"] == "2024"
        assert annual["unit"] == "mt"
        nepal = next(row for row in annual["rows"] if row["id"] == "nepal")
        assert nepal["value"] == 18.8
        cons = out["metrics"]["consumption"]
        assert cons["year"] == 2023
        assert "2023" in (cons["captionEn"] or "")
        assert cons["year"] != annual["year"]

    def test_cumulative_since_1850_subtracts_the_pre_1850_baseline(self):
        out = _parse(FULL)
        metric = out["metrics"]["cumulative_1850"]
        # World 2000-50=1950. US 480-2=478 → 478/1950*100.
        us = next(row for row in metric["rows"] if row["id"] == "unitedStates")
        assert us["value"] == pytest.approx(478 / 1950 * 100)
        # Nepal has no pre-1850 row, so its cumulative is counted in full.
        nepal = next(row for row in metric["rows"] if row["id"] == "nepal")
        assert nepal["value"] == pytest.approx(20 / 1950 * 100)

    def test_nepal_scale_peers_come_from_the_reviewed_list(self):
        out = _parse(FULL, peers=["sriLanka", "kenya"])
        scale_ids = _ids(out["metrics"]["cumulative_1750"]["scaleRows"])
        assert "nepal" in scale_ids
        assert "sriLanka" in scale_ids
        assert "kenya" not in scale_ids  # missing from the CSV, not invented
        assert "unitedStates" not in scale_ids

    def test_keys_are_camel_case(self):
        out = _parse(FULL)
        nepal = next(
            row for row in out["metrics"]["cumulative_1750"]["rows"] if row["id"] == "nepal"
        )
        assert set(nepal) == {"id", "labelEn", "labelNe", "value"}


class TestStaleCache:
    @pytest.fixture(autouse=True)
    def isolated(self, tmp_path, monkeypatch):
        monkeypatch.setattr(type(runs_store.settings), "runs_dir", property(lambda self: tmp_path))
        return tmp_path

    @respx.mock
    async def test_a_failed_fetch_keeps_the_last_good_figures(self):
        good = _parse(FULL)
        service.persist_emissions(good)

        respx.get(owid_co2.CSV_URL).mock(return_value=httpx.Response(500))
        out = await run_climate_refresh()

        assert out["stale"] is True
        assert out["error"]
        assert out["year"] == 2024
        nepal = next(
            row for row in out["metrics"]["cumulative_1750"]["rows"] if row["id"] == "nepal"
        )
        assert nepal["value"] == 0.01
        assert out["fetchedAt"] == good["fetchedAt"]
        assert out["lastAttemptAt"] != good["fetchedAt"]

        stored = service.load_emissions()
        assert stored is not None
        assert stored["metrics"]["cumulative_1750"]["year"] == 2024

    @respx.mock
    async def test_a_failed_fetch_with_nothing_stored_does_not_invent_numbers(self):
        respx.get(owid_co2.CSV_URL).mock(return_value=httpx.Response(503))
        out = await run_climate_refresh()
        assert out["metrics"] == {}
        assert out["year"] is None
        assert out["error"]

        payload = service.payload()
        assert payload["emissions"]["metrics"] == {}
        assert payload["facts"], "reviewed facts must still reach the page"


class TestReviewedFacts:
    def test_every_shipped_fact_has_a_source_url(self):
        facts = public_facts()
        assert len(facts) >= 4
        for fact in facts:
            assert fact["url"].startswith("http")
            assert fact["organisation"]
            assert fact["statementEn"]
            assert fact["published"]

    def test_a_fact_without_a_url_is_dropped(self):
        facts = public_facts(
            {
                "facts": [
                    {
                        "id": "bare",
                        "statement_en": "A claim with no source.",
                        "organisation": "Nobody",
                    }
                ]
            }
        )
        assert facts == []

    def test_ministry_posts_are_matched_on_their_own_words(self):
        posts = [
            {
                "id": "a",
                "title": "Raising climate justice and the Mountain Agenda",
                "titleNe": None,
                "bodyEn": None,
                "bodyNe": None,
                "ministry": "Ministry of Forests and Environment",
                "publishedAt": "2026-08-30T10:00:00.000Z",
                "link": "https://nepal.gov.np/updates/a",
            },
            {
                "id": "b",
                "titleNe": "हिमालयको तापक्रम वृद्धिबारे प्रधानमन्त्रीको वक्तव्य",
                "title": None,
                "bodyEn": None,
                "bodyNe": None,
                "ministry": "Office of the Prime Minister",
                "publishedAt": "2026-08-29T10:00:00.000Z",
                "link": "https://nepal.gov.np/updates/b",
            },
        ]
        needles = [
            {
                "id": "climate-justice-mountain-agenda",
                "needles": ["climate justice", "mountain agenda"],
            },
            {"id": "himalayan-warming", "needles": ["हिमालयको तापक्रम"]},
        ]
        matched = match_statements(posts, needles)
        assert [m["id"] for m in matched] == ["a", "b"]
        assert matched[0]["ministry"] == "Ministry of Forests and Environment"
        assert matched[0]["title"] == posts[0]["title"]

    def test_a_post_is_not_paraphrased_into_a_new_sentence(self):
        """The match returns the government's words, not a rewritten claim."""
        posts = [
            {
                "id": "c",
                "title": "Climate finance talks with the UK ambassador",
                "titleNe": None,
                "bodyEn": "The Minister for Law met the UK ambassador.",
                "bodyNe": None,
                "ministry": "Ministry of Law",
                "publishedAt": "2026-08-28T10:00:00.000Z",
                "link": "https://nepal.gov.np/updates/c",
            }
        ]
        matched = match_statements(
            posts, [{"id": "climate-finance", "needles": ["climate finance"]}]
        )
        assert matched[0]["bodyEn"] == "The Minister for Law met the UK ambassador."
        assert "because" not in (matched[0]["title"] or "").lower()

    def test_a_title_hit_beats_a_newer_body_only_mention(self):
        posts = [
            {
                "id": "newer-relief",
                "title": "Relief distribution continues",
                "titleNe": None,
                "bodyEn": "The Himalayan region faces climate risk as well as the flood.",
                "bodyNe": None,
                "ministry": "Office of the Prime Minister",
                "publishedAt": "2026-09-02T10:00:00.000Z",
                "link": "https://nepal.gov.np/updates/newer",
            },
            {
                "id": "warming",
                "titleNe": "हिमालय क्षेत्रमा जलवायु परिवर्तनसँगै जोखिम बढ्दै गएको छः प्रधानमन्त्री",
                "title": None,
                "bodyEn": None,
                "bodyNe": None,
                "ministry": "Office of the Prime Minister",
                "publishedAt": "2026-08-31T10:00:00.000Z",
                "link": "https://nepal.gov.np/updates/warming",
            },
        ]
        matched = match_statements(
            posts,
            [{"id": "himalayan-warming", "needles": ["himalayan region", "हिमालय क्षेत्रमा जलवायु"]}],
        )
        assert matched[0]["id"] == "warming"

    def test_a_reviewed_translation_fills_english_when_the_government_published_none(self):
        posts = [
            {
                "id": "warming",
                "title": None,
                "titleNe": "हिमालय क्षेत्रमा जलवायु परिवर्तनसँगै जोखिम बढ्दै गएको छः प्रधानमन्त्री",
                "bodyEn": None,
                "bodyNe": "प्रधानमन्त्रीले भन्नुभयो।",
                "ministry": "Office of the Prime Minister",
                "publishedAt": "2026-08-31T10:00:00.000Z",
                "link": "https://nepal.gov.np/updates/warming",
            }
        ]
        matched = match_statements(
            posts,
            [
                {
                    "id": "himalayan-warming",
                    "needles": ["हिमालय क्षेत्रमा जलवायु"],
                    "title_en": "The risks we must bear are growing: Prime Minister",
                    "body_en": "The Prime Minister said so.",
                }
            ],
        )
        assert matched[0]["title"] == "The risks we must bear are growing: Prime Minister"
        assert matched[0]["bodyEn"] == "The Prime Minister said so."
        assert matched[0]["titleNe"].startswith("हिमालय")
        assert matched[0]["translated"] is True

    def test_a_reviewed_translation_does_not_overwrite_government_english(self):
        posts = [
            {
                "id": "a",
                "title": "Raising climate justice",
                "titleNe": None,
                "bodyEn": "The minister spoke.",
                "bodyNe": None,
                "ministry": "Ministry of Forests and Environment",
                "publishedAt": "2026-08-30T10:00:00.000Z",
                "link": "https://nepal.gov.np/updates/a",
            }
        ]
        matched = match_statements(
            posts,
            [
                {
                    "id": "climate-justice-mountain-agenda",
                    "needles": ["climate justice"],
                    "title_en": "A rewritten headline",
                    "body_en": "A rewritten body.",
                }
            ],
        )
        assert matched[0]["title"] == "Raising climate justice"
        assert matched[0]["bodyEn"] == "The minister spoke."
        assert matched[0]["translated"] is False


class TestClimateApi:
    @pytest.fixture(autouse=True)
    def isolated(self, tmp_path, monkeypatch):
        monkeypatch.setattr(type(runs_store.settings), "runs_dir", property(lambda self: tmp_path))
        return tmp_path

    def test_a_cold_route_still_serves_reviewed_facts_and_no_invented_emissions(self):
        from fastapi.testclient import TestClient

        from app.main import app

        body = TestClient(app).get("/api/v1/climate").json()
        assert body["facts"], "reviewed facts vanished on a cold climate route"
        assert body["emissions"]["metrics"] == {}
        assert body["emissions"]["year"] is None
        assert "_" not in "".join(body.keys())
        assert body["arrived"]["hazards"] == []
        assert body["arrived"]["source"]["url"]
        assert body["panels"]["heat"]["enabled"] is False
        assert body["panels"]["water"]["enabled"] is False
        assert body["panels"]["air"]["enabled"] is False
        assert body["panels"]["fire"]["enabled"] is False


class TestBipadArrived:
    def test_unfilled_loss_zeros_are_not_deaths(self):
        from app.domains.climate.sources.bipad_arrived import aggregate

        hazards = aggregate(
            [
                {
                    "incidentOn": "2024-06-01T00:00:00+05:45",
                    "hazard": {"id": 11, "title": "Flood", "titleNe": "बाढी"},
                    "loss": {"id": 1, "peopleDeathCount": 0, "peopleAffectedCount": 0},
                },
                {
                    "incidentOn": "2024-06-02T00:00:00+05:45",
                    "hazard": {"id": 11, "title": "Flood", "titleNe": "बाढी"},
                    "loss": {"id": 2, "peopleDeathCount": 3, "peopleAffectedCount": 12},
                },
            ],
            [2024],
        )
        assert len(hazards) == 1
        flood = hazards[0]
        assert flood["incidents"] == [2]
        assert flood["deaths"] == [3]
        assert flood["deathsRecords"] == [1]
        assert flood["affected"] == [12]
        assert flood["affectedRecords"] == [1]

    def test_a_year_with_no_reported_loss_is_none_not_zero(self):
        from app.domains.climate.sources.bipad_arrived import aggregate

        hazards = aggregate(
            [
                {
                    "incidentOn": "2023-01-01T00:00:00+05:45",
                    "hazard": 11,
                    "loss": {"id": 1, "peopleDeathCount": 0},
                }
            ],
            [2023, 2024],
        )
        assert hazards[0]["deaths"] == [None, None]
        assert hazards[0]["incidents"] == [1, 0]

    def test_window_is_eight_calendar_years(self):
        from datetime import datetime, timezone

        from app.domains.climate.sources.bipad_arrived import window_years

        years = window_years(datetime(2026, 9, 3, tzinfo=timezone.utc))
        assert years[0] == 2019
        assert years[-1] == 2026
        assert len(years) == 8

