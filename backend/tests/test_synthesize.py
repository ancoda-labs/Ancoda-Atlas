"""The synthesizer, its keyword tables and the rule-based reads."""

from app.domains.hazards.keywords import GEO_KEYWORDS, HAZARD_TERMS, IMPACT_TERMS
from app.domains.hazards.news_rss import (
    geo_tag_text,
    is_hazard_text,
    parse_rss,
    sanitize_external_url,
)
from app.domains.hazards.synthesize import generate_ideas, summarize_reported_impact


class TestHazardFilter:
    """The RSS feeds are general dailies; only hazard coverage gets through."""

    def test_a_flood_headline_matches(self):
        assert is_hazard_text("Flooding closes the Araniko highway") is True

    def test_a_nepali_headline_matches(self):
        assert is_hazard_text("रसुवामा बाढी") is True

    def test_nepali_case_suffixes_still_match(self):
        """Nepali attaches suffixes to the noun, so बाढीले must hit बाढी.

        This is why Devanagari keeps substring matching while Latin does not.
        """
        assert is_hazard_text("बाढीले घर बगायो") is True

    def test_politics_does_not_match(self):
        assert is_hazard_text("Parliament passes the budget") is False

    def test_short_latin_terms_respect_word_boundaries(self):
        """Substring matching would turn 'rain' into a hit on 'training'."""
        assert is_hazard_text("Police training exercise in Kathmandu") is False
        assert is_hazard_text("Brainstorm session at the ministry") is False

    def test_the_real_word_still_matches(self):
        assert is_hazard_text("Heavy rain forecast") is True
        assert is_hazard_text("A storm is expected") is True


class TestGeoTagging:
    def test_a_district_is_tagged(self):
        assert geo_tag_text("Landslide in Rasuwa")[2] == "Rasuwa"

    def test_devanagari_resolves_to_the_latin_label(self):
        """Without this "रसुवा" and "Rasuwa" tally as two separate districts."""
        assert geo_tag_text("रसुवामा पहिरो")[2] == "Rasuwa"

    def test_a_district_beats_the_country_fallback(self):
        """Ordering is load-bearing: first match wins."""
        assert geo_tag_text("Nepal: flooding in Rasuwa district")[2] == "Rasuwa"

    def test_the_nepal_fallback_is_last_in_the_table(self):
        keys = list(GEO_KEYWORDS)
        assert keys[-1] == "नेपाल"
        assert "Nepal" in keys[-4:]

    def test_untagged_text_is_none(self):
        assert geo_tag_text("A general story about nothing") is None


class TestKeywordTables:
    """These were generated from the Node original; assert they arrived whole."""

    def test_table_sizes(self):
        assert len(GEO_KEYWORDS) == 202
        assert len(HAZARD_TERMS) == 84
        assert len(IMPACT_TERMS) == 29

    def test_devanagari_survived_the_generation(self):
        assert "काठमाडौं" in GEO_KEYWORDS
        assert "भोटेकोशी" in GEO_KEYWORDS
        assert "भूकम्प" in HAZARD_TERMS


class TestUrlSanitising:
    def test_http_and_https_pass(self):
        assert sanitize_external_url("https://example.com/x") == "https://example.com/x"

    def test_javascript_is_rejected(self):
        assert sanitize_external_url("javascript:alert(1)") is None

    def test_empty_is_none(self):
        assert sanitize_external_url("") is None
        assert sanitize_external_url(None) is None


def test_rss_parsing_reads_cdata_and_skips_the_channel_title():
    xml = """
    <rss><channel><title>Setopati</title>
      <item><title><![CDATA[रसुवामा बाढी]]></title>
        <link>https://setopati.com/a</link>
        <pubDate>Mon, 31 Aug 2026 06:00:00 +0000</pubDate></item>
      <item><title>Setopati</title><link>https://setopati.com/b</link></item>
    </channel></rss>
    """
    items = parse_rss(xml, "Setopati")
    assert len(items) == 1
    assert items[0]["title"] == "रसुवामा बाढी"


class TestReportedImpact:
    def test_it_counts_impact_headlines(self):
        news = [
            {"title": "3 dead in Rasuwa landslide", "region": "Rasuwa"},
            {"title": "Monsoon forecast issued", "region": "Rasuwa"},
        ]
        assert summarize_reported_impact(news)["count"] == 1

    def test_outlet_fallback_tags_are_excluded_from_the_ranking(self):
        """The fallback puts anything unplaceable in Kathmandu.

        Counting those would make the capital top the ranking during a flood in
        Rasuwa — the exact opposite of what the panel is for.
        """
        news = [
            {"title": "5 killed", "region": "Kathmandu"},
            {"title": "2 missing", "region": "Kathmandu"},
            {"title": "1 dead", "region": "Rasuwa"},
        ]
        out = summarize_reported_impact(news)
        assert out["count"] == 3
        assert out["topRegions"] == [{"region": "Rasuwa", "count": 1}]

    def test_nepali_impact_terms_count(self):
        news = [{"title": "रसुवामा ३ जनाको मृत्यु", "region": "Rasuwa"}]
        assert summarize_reported_impact(news)["count"] == 1

    def test_no_news_is_a_zero_not_a_crash(self):
        assert summarize_reported_impact([])["count"] == 0
        assert summarize_reported_impact(None)["headline"] is None


class TestGenerateIdeas:
    """Rule thresholds are Nepal-specific editorial judgements, not defaults."""

    def test_a_big_quake_produces_a_respond_read(self):
        ideas = generate_ideas({"seismic": {"maxMagnitude": 6.1}})
        assert ideas[0]["type"] == "respond"
        assert "M6.1" in ideas[0]["text"]

    def test_quiet_data_produces_nothing(self):
        """No signal must mean no read, never a filler one."""
        assert generate_ideas({"seismic": {"maxMagnitude": 2.0}}) == []

    def test_compound_hazard_fires_when_rain_meets_recent_shaking(self):
        ideas = generate_ideas(
            {
                "seismic": {"maxMagnitude": 4.6, "events24h": 3},
                "weather": {
                    "monsoonSeason": True,
                    "alerts": [
                        {"event": "Flood / Landslide Risk", "severity": "severe"},
                        {"event": "Flood / Landslide Risk", "severity": "severe"},
                    ],
                },
            }
        )
        titles = [i["title"] for i in ideas]
        assert "Compound Hazard — Saturated Slopes on Shaken Ground" in titles

    def test_reads_are_capped_at_eight(self):
        ideas = generate_ideas(
            {
                "seismic": {"maxMagnitude": 7.0, "events24h": 20},
                "weather": {
                    "monsoonSeason": True,
                    "alerts": [
                        {"event": "Flood / Landslide Risk", "severity": "extreme"},
                        {"event": "Flood / Landslide Risk", "severity": "extreme"},
                        {"event": "Extreme Heat", "severity": "severe"},
                    ],
                    "stations": [{"city": "Pokhara", "rain5dMm": 400}],
                },
                "fire": {"totalDetections": 3000, "nightDetections": 40},
                "airQuality": {"worst": {"aqi": 260}},
                "relief": {"disasters": [{"name": "Flood"}]},
                "impact": {"count": 20, "topRegions": [{"region": "Rasuwa", "count": 9}]},
                "news": list(range(60)),
            }
        )
        assert len(ideas) <= 8

    def test_thousands_separator_matches_the_javascript_output(self):
        ideas = generate_ideas({"fire": {"totalDetections": 1234}})
        assert "1,234 thermal detections" in ideas[0]["text"]
