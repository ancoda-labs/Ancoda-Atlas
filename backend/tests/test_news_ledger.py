"""The collected-news ledger (issue #37): what gets written down, and once.

The value of this file is entirely in it being a faithful record. A duplicated
row inflates whatever is scored against it, and a lost row is a headline that
was on the page with nothing to say so.
"""

import csv
import io

import pytest

from app.domains.news import ledger


@pytest.fixture(autouse=True)
def ledger_in_tmp(tmp_path, monkeypatch):
    """A fresh ledger per test, and never the developer's real runs/ directory."""
    monkeypatch.setattr("app.core.runs_store.settings.ATLAS_RUNS_DIR", str(tmp_path))
    monkeypatch.setattr(
        type(ledger.runs_store.settings), "runs_dir", property(lambda self: tmp_path)
    )
    monkeypatch.setattr(ledger, "_seen", None)
    return tmp_path


def _bundle(*items, topic="flood"):
    return {"topics": {topic: {"items": list(items)}}}


def _wire(title, link, source="Kathmandu Post", pub="2026-09-01T10:00:00.000Z"):
    return {"title": title, "link": link, "source": source, "pubDate": pub}


def _rows():
    return list(csv.DictReader(io.StringIO(ledger.read_csv())))


class TestRecording:
    def test_a_headline_is_written_with_what_the_wire_published(self):
        ledger.record_wire_bundle(_bundle(_wire("Bhotekoshi bursts its banks", "https://kp/1")))
        row = _rows()[0]

        assert row["title"] == "Bhotekoshi bursts its banks"
        assert row["source"] == "Kathmandu Post"
        assert row["link"] == "https://kp/1"
        assert row["topic"] == "flood"
        assert row["feed"] == "wire"
        assert row["publishedAt"] == "2026-09-01T10:00:00.000Z"
        assert row["firstSeenAt"]

    def test_a_ministry_post_is_marked_as_the_government_speaking(self):
        """A ministry's own words and an outlet's report are different claims."""
        ledger.record_gov_updates(
            [
                {
                    "titleNe": "रसुवा बाढी अपडेट",
                    "link": "https://nepal.gov.np/updates/1",
                    "ministry": "Ministry of Home Affairs",
                    "topic": "flood",
                    "district": "Rasuwa",
                    "publishedAt": "2026-09-01T09:50:00.000Z",
                }
            ]
        )
        row = _rows()[0]

        assert row["feed"] == "government"
        assert row["source"] == "Ministry of Home Affairs"
        assert row["district"] == "Rasuwa"
        assert row["language"] == "ne"

    def test_devanagari_survives_the_round_trip(self):
        ledger.record_wire_bundle(_bundle(_wire("रसुवामा बाढी", "https://sp/1")))
        assert _rows()[0]["title"] == "रसुवामा बाढी"

    def test_a_map_headline_that_uses_url_instead_of_link_is_still_written(self):
        """The sweep's RSS set names the original `url`/`date`, not `link`/`pubDate`."""
        ledger.record_wire_items(
            [{"title": "Landslide in Rasuwa", "url": "https://rn/1", "source": "Rising Nepal", "date": "2026-09-01"}],
            topic="all",
        )
        row = _rows()[0]
        assert row["title"] == "Landslide in Rasuwa"
        assert row["link"] == "https://rn/1"
        assert row["topic"] == "all"

    def test_an_item_with_no_link_is_not_written(self):
        """The link is the identity. A row without one cannot be deduplicated."""
        ledger.record_wire_bundle(_bundle(_wire("No link", "")))
        assert _rows() == []


class TestWrittenOnce:
    def test_the_same_headline_is_not_written_twice(self):
        """The cycle runs every ten minutes over a window measured in days."""
        item = _wire("Landslide blocks the Pasang Lhamu", "https://kp/2")
        assert ledger.record_wire_bundle(_bundle(item)) == 1
        assert ledger.record_wire_bundle(_bundle(item)) == 0
        assert len(_rows()) == 1

    def test_a_story_on_two_panels_is_written_once(self):
        """A landslide report reaches both the flood and the disaster panel."""
        item = _wire("Landslide kills four", "https://kp/3")
        bundle = {
            "topics": {"flood": {"items": [item]}, "disaster": {"items": [item]}}
        }
        assert ledger.record_wire_bundle(bundle) == 1

    def test_it_survives_a_restart(self):
        """The seen-set is memory; the file is the record."""
        item = _wire("Bridge washed away", "https://kp/4")
        ledger.record_wire_bundle(_bundle(item))

        ledger._seen = None  # a fresh worker process
        assert ledger.record_wire_bundle(_bundle(item)) == 0
        assert len(_rows()) == 1

    def test_a_new_headline_is_appended_beside_the_old_ones(self):
        ledger.record_wire_bundle(_bundle(_wire("First", "https://kp/5")))
        ledger.record_wire_bundle(_bundle(_wire("Second", "https://kp/6")))

        rows = _rows()
        assert [r["title"] for r in rows] == ["First", "Second"]

    def test_the_header_is_written_once(self):
        ledger.record_wire_bundle(_bundle(_wire("First", "https://kp/7")))
        ledger.record_wire_bundle(_bundle(_wire("Second", "https://kp/8")))
        assert ledger.read_csv().count("firstSeenAt") == 1


class TestExport:
    def test_an_empty_ledger_answers_column_names(self):
        """A sheet pulling this before the first cycle gets a table, not an error."""
        header = ledger.read_csv().strip().split(",")
        assert header[0] == "id"
        assert header[1] == "title"
        assert _rows() == []

    def test_there_is_no_sentiment_column(self):
        """The score belongs in a sheet the worker cannot overwrite."""
        assert "sentiment" not in ledger.COLUMNS

    def test_the_id_is_stable_across_runs(self):
        """A label looked up by id has to survive the row moving."""
        assert ledger.row_id("https://kp/9") == ledger.row_id("https://kp/9")
        assert ledger.row_id("https://kp/9") != ledger.row_id("https://kp/10")


class TestFailure:
    def test_an_unwritable_runs_directory_does_not_break_the_cycle(self, monkeypatch):
        """A bookkeeping file must never cost a sweep."""
        monkeypatch.setattr(ledger.runs_store, "ensure_dirs", lambda: False)
        assert ledger.record_wire_bundle(_bundle(_wire("Flood", "https://kp/11"))) == 0

    def test_a_bundle_with_no_topics_is_not_an_error(self):
        assert ledger.record_wire_bundle({}) == 0

    def test_no_government_posts_is_not_an_error(self):
        assert ledger.record_gov_updates([]) == 0
