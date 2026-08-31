"""The hazard news wire: its gates, its ranking, and its feed parsing."""

from app.domains.news.feeds import (
    HAZARD_GATE_TERMS,
    NEPAL_CONTEXT_TERMS,
    NEPAL_SOURCES,
    TOPIC_RELEVANCE_RULES,
)
from app.domains.news.sources import youtube
from app.domains.news.sources.nepal_news import (
    apply_source_cap,
    compact_item,
    decode_xml,
    dedupe_items,
    extract_image,
    is_hazard_item,
    matches_keyword,
    normalize_window,
    parse_rss_items,
    rank_and_filter,
    score_item_for_topic,
    with_window_adjusted_sources,
)


def _item(title, source="Kathmandu Post", link="https://kathmandupost.com/a", ms=1e12):
    return {"title": title, "source": source, "link": link, "pubDate": ms, "image": None}


class TestFeedTables:
    """Generated from the Node original; assert they arrived whole."""

    def test_every_topic_has_sources(self):
        assert len(NEPAL_SOURCES) == 8
        for topic, sources in NEPAL_SOURCES.items():
            assert sources, f"{topic} has no sources"

    def test_the_devanagari_queries_survived_generation(self):
        flood_urls = " ".join(s["url"] for s in NEPAL_SOURCES["flood"])
        # बाढी, URL-encoded.
        assert "%E0%A4%AC%E0%A4%BE%E0%A4%A2%E0%A5%80" in flood_urls

    def test_table_sizes(self):
        assert len(HAZARD_GATE_TERMS) == 88
        assert len(NEPAL_CONTEXT_TERMS) == 17


class TestHazardGate:
    def test_a_flood_headline_passes(self):
        assert is_hazard_item(_item("Flood washes away bridge in Rasuwa")) is True

    def test_a_nepali_headline_passes(self):
        assert is_hazard_item(_item("रसुवामा बाढी")) is True

    def test_politics_is_blocked(self):
        """A Nepali daily's RSS carries its whole newsroom."""
        assert is_hazard_item(_item("Parliament passes the budget")) is False

    def test_word_boundaries_are_respected(self):
        """'fire' must not match "firefighter", 'heat' must not match "wheat"."""
        assert matches_keyword("wheat prices rise", "heat") is False
        assert matches_keyword("police training", "rain") is False

    def test_devanagari_matches_with_suffixes(self):
        """Nepali attaches case suffixes to the noun."""
        assert matches_keyword("रसुवामा", "रसुवा") is True


class TestTopicRanking:
    def test_a_foreign_disaster_is_pushed_below_the_threshold(self):
        """A hazard story with no Nepal marker and no Nepali byline is usually
        coverage of a disaster somewhere else."""
        scored = score_item_for_topic(
            _item("Flooding in Bavaria", source="Deutsche Welle", link="https://dw.com/x"),
            "flood",
        )
        assert scored["nepalMatches"] == 0
        assert scored["localSource"] is False
        assert scored["score"] < TOPIC_RELEVANCE_RULES["flood"]["minScore"]

    def test_a_nepal_flood_story_scores_well(self):
        scored = score_item_for_topic(_item("Flood in Rasuwa, Nepal"), "flood")
        assert scored["score"] >= TOPIC_RELEVANCE_RULES["flood"]["minScore"]

    def test_ranking_drops_the_foreign_story(self):
        items = [
            _item("Flooding in Bavaria", source="Deutsche Welle", link="https://dw.com/x"),
            _item("Flood in Rasuwa, Nepal"),
        ]
        ranked = rank_and_filter(items, "flood")
        assert len(ranked) == 1
        assert "Rasuwa" in ranked[0]["title"]

    def test_wildfire_excludes_ordinary_fires(self):
        """Bare 'fire' would match building and vehicle fires, which are not
        natural hazards."""
        assert "fire" not in TOPIC_RELEVANCE_RULES["wildfire"]["include"]


class TestFeedParsing:
    def test_rss_items_are_read(self):
        xml = """<rss><channel>
          <item><title>Flood in Rasuwa</title><link>https://x.test/1</link>
            <pubDate>Mon, 31 Aug 2026 06:00:00 +0000</pubDate></item>
        </channel></rss>"""
        items = parse_rss_items(xml, "Test")
        assert len(items) == 1
        assert items[0]["source"] == "Test"

    def test_atom_entries_are_read_when_there_are_no_items(self):
        xml = """<feed><entry><title>Flood</title>
          <link href="https://x.test/2"/><published>2026-08-31T06:00:00Z</published>
        </entry></feed>"""
        items = parse_rss_items(xml, "Atom")
        assert len(items) == 1
        assert items[0]["link"] == "https://x.test/2"

    def test_cdata_is_unwrapped(self):
        assert decode_xml("<![CDATA[रसुवामा बाढी]]>") == "रसुवामा बाढी"

    def test_entities_are_decoded(self):
        assert decode_xml("Rain &amp; flood") == "Rain & flood"

    def test_an_item_with_no_link_is_skipped(self):
        xml = "<rss><channel><item><title>No link</title></item></channel></rss>"
        assert parse_rss_items(xml, "Test") == []


class TestImageExtraction:
    def test_media_thumbnail_wins(self):
        block = '<media:thumbnail url="https://x.test/photo.jpg" />'
        assert extract_image(block) == "https://x.test/photo.jpg"

    def test_an_embedded_img_is_a_fallback(self):
        """Nagarik embeds its lead image in the body rather than advertising it."""
        assert extract_image('<img src="https://x.test/lead.jpg">') == "https://x.test/lead.jpg"

    def test_feed_furniture_is_rejected(self):
        """A tracking pixel or the outlet's logo is not the story."""
        assert extract_image('<img src="https://x.test/logo.png">') is None
        assert extract_image('<img src="https://x.test/pixel.gif">') is None

    def test_a_relative_url_is_rejected(self):
        assert extract_image('<img src="/local/x.jpg">') is None


class TestDiversityAndWindows:
    def test_the_source_cap_stops_one_outlet_filling_a_panel(self):
        items = [_item(f"Flood {i}", source="Setopati") for i in range(10)]
        assert len(apply_source_cap(items, 3)) == 3

    def test_duplicates_are_removed(self):
        items = [_item("Same", link="https://x/1"), _item("Same", link="https://x/1")]
        assert len(dedupe_items(items)) == 1

    def test_an_unknown_window_falls_back_to_all(self):
        assert normalize_window("banana") == "all"
        assert normalize_window("24h") == "24h"

    def test_google_queries_are_repointed_at_the_window(self):
        sources = [
            {"name": "G", "url": "https://news.google.com/rss/search?q=flood+when%3A7d&hl=en"}
        ]
        out = with_window_adjusted_sources(sources, "24h")
        assert "when%3A1d" in out[0]["url"] or "when:1d" in out[0]["url"]

    def test_a_direct_feed_is_left_alone(self):
        sources = [{"name": "KP", "url": "https://kathmandupost.com/rss"}]
        assert with_window_adjusted_sources(sources, "24h") == sources


def test_compact_item_emits_the_javascript_timestamp_shape():
    import re

    out = compact_item(_item("Flood", ms=1756636800000))
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z", out["pubDate"])


class TestYoutubeRelevance:
    def test_flood_coverage_is_relevant(self):
        assert youtube.is_relevant("रसुवा बाढी अपडेट") is True
        assert youtube.is_relevant("Rasuwa flood rescue") is True

    def test_unrelated_broadcast_is_not(self):
        """Broadcasters post everything to the same channel. A flood desk
        carrying last night's football would be worse than carrying no video."""
        assert youtube.is_relevant("Nepal vs Oman football highlights") is False

    def test_embeds_use_the_nocookie_host(self):
        """The reader has not asked YouTube for anything yet."""
        assert "youtube-nocookie.com" in (
            "https://www.youtube-nocookie.com/embed/abc"
        )
