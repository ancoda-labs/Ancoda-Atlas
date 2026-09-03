"""The overlay rules. These decide what number a family reads."""

from app.domains.flood.merge import (
    buildings_close,
    merge_damage,
    merge_sitrep,
    should_overlay,
)
from app.domains.flood.sources.bulletin_damage import parse_damage_figure
from app.domains.flood.sources.bulletin_sitrep import parse_bulletin_figure, total_for


class TestParseBulletinFigure:
    def test_devanagari_numerals_are_parsed(self):
        assert parse_bulletin_figure("५७९") == {"value": 579}

    def test_a_plus_is_meaning_not_formatting(self):
        """"२००+" is the bulletin saying the real figure is higher."""
        assert parse_bulletin_figure("२००+") == {"value": 200, "suffix": "+"}

    def test_thousands_separators_are_stripped(self):
        assert parse_bulletin_figure("20,819") == {"value": 20819}

    def test_a_word_is_not_a_figure(self):
        """"अलग" (separate) is a note about the deployment, not a count of it."""
        assert parse_bulletin_figure("अलग") is None

    def test_a_dash_is_not_a_zero(self):
        assert parse_bulletin_figure("-") is None


class TestTotalFor:
    def test_an_svg_icon_does_not_hide_the_kpi_total(self):
        """The bulletin's KPI buttons now carry inline SVGs. Deaths sat 538
        characters past the id — past the old 400-character window — so the
        overlay never saw 1,204 and the desk kept printing 1,114."""
        pad = "M" * 500
        html = f"""
        <button type="button" class="kpi" id="kpi-dead">
          <span class="kpi-ico"><svg><path d="{pad}"/></svg></span>
          <span class="kpi-k">मृतक संख्या</span>
          <strong class="num">१,२०४</strong>
        </button>
        <button type="button" class="kpi" id="kpi-miss">
          <span class="kpi-ico"><svg><path d="{pad}"/></svg></span>
          <strong class="num">४,२१६</strong>
        </button>
        <button type="button" class="kpi" id="kpi-injured">
          <strong class="num">३०१</strong>
        </button>
        """
        assert total_for(html, "dead") == {"value": 1204}
        assert total_for(html, "miss") == {"value": 4216}
        assert total_for(html, "injured") == {"value": 301}

    def test_a_missing_kpi_button_is_not_a_zero(self):
        assert total_for("<div></div>", "dead") is None


class TestParseDamageFigure:
    def test_a_tilde_marks_approximate(self):
        assert parse_damage_figure("~450") == {"value": 450, "approximate": True}

    def test_a_slash_takes_the_first_number(self):
        """"5/5" is five destroyed of five in the AOI."""
        assert parse_damage_figure("5/5") == {"value": 5}

    def test_an_em_dash_is_a_missing_cell_not_a_zero(self):
        """"Not surveyed" and "none destroyed" are different facts."""
        assert parse_damage_figure("—") is None

    def test_a_trailing_unit_does_not_break_the_number(self):
        assert parse_damage_figure("450 हे")["value"] == 450


class TestShouldOverlay:
    def test_a_closing_panel_overlays(self):
        live = {"id": "injured", "total": 10, "items": [{"value": 6}, {"value": 4}]}
        assert should_overlay({"id": "injured", "total": 8}, live) is True

    def test_a_panel_that_does_not_close_is_refused(self):
        """Publishing a scrape that does not add up is worse than being stale."""
        live = {"id": "injured", "total": 267, "items": [{"value": 100}, {"value": 129}]}
        assert should_overlay({"id": "injured", "total": 200}, live) is False

    def test_the_death_toll_never_goes_down(self):
        """This disaster's toll is recovered bodies. A lagging compilation must
        not put an older 794 back over 903 on a page families are reading."""
        live = {"id": "deaths", "total": 794, "items": [{"value": 794}]}
        assert should_overlay({"id": "deaths", "total": 903}, live) is False

    def test_the_death_toll_rising_does_overlay(self):
        live = {"id": "deaths", "total": 903, "items": [{"value": 903}]}
        assert should_overlay({"id": "deaths", "total": 794}, live) is True

    def test_other_groups_may_fall(self):
        """Uncontacted drops as people are found. That is good news, not an error."""
        live = {"id": "uncontacted", "total": 100, "items": [{"value": 100}]}
        assert should_overlay({"id": "uncontacted", "total": 400}, live) is True


class TestMergeSitrep:
    def _reviewed(self):
        return {
            "as_of": "2026-08-28T00:00:00.000Z",
            "as_of_label_en": "12 Bhadra",
            "headline": [{"id": "deaths", "value": 794}, {"id": "injured", "value": 200}],
            "breakdowns": [
                {"id": "deaths", "total": 794, "items": [{"value": 794}]},
                {"id": "injured", "total": 200, "items": [{"value": 200}]},
            ],
            "sources": [{"url": "https://police.example"}],
        }

    def test_a_failed_scrape_leaves_the_reviewed_figures_standing(self):
        out = merge_sitrep(self._reviewed(), {"error": "boom", "breakdowns": []})
        assert out["breakdowns"][0]["total"] == 794

    def test_no_live_data_leaves_the_reviewed_figures_standing(self):
        assert merge_sitrep(self._reviewed(), None)["breakdowns"][0]["total"] == 794

    def test_a_rising_toll_overlays_and_updates_the_headline(self):
        live = {
            "breakdowns": [{"id": "deaths", "total": 903, "items": [{"value": 903}]}],
            "source": {"label": "Bulletin", "url": "https://bulletin.example"},
            "fetchedAt": "2026-08-31T00:00:00.000Z",
            "asOfLabelEn": "15 Bhadra",
        }
        out = merge_sitrep(self._reviewed(), live)
        deaths = next(b for b in out["breakdowns"] if b["id"] == "deaths")
        assert deaths["total"] == 903
        assert deaths["live"] is True
        assert next(h for h in out["headline"] if h["id"] == "deaths")["value"] == 903

    def test_the_live_source_is_credited(self):
        live = {
            "breakdowns": [{"id": "deaths", "total": 903, "items": [{"value": 903}]}],
            "source": {"label": "Bulletin", "url": "https://bulletin.example"},
        }
        out = merge_sitrep(self._reviewed(), live)
        assert any(s["url"] == "https://bulletin.example" for s in out["sources"])

    def test_only_a_death_overlay_moves_the_dateline(self):
        """Stamping the page with a fresh time because a deployment count moved
        would overstate how current the toll is."""
        live = {
            "breakdowns": [{"id": "injured", "total": 267, "items": [{"value": 267}]}],
            "source": {"label": "Bulletin", "url": "https://bulletin.example"},
            "fetchedAt": "2026-08-31T00:00:00.000Z",
            "asOfLabelEn": "15 Bhadra",
        }
        out = merge_sitrep(self._reviewed(), live)
        assert out["as_of"] == "2026-08-28T00:00:00.000Z"
        assert out["as_of_label_en"] == "12 Bhadra"


class TestBuildingsClose:
    def _rows(self, **over):
        rows = [
            {"id": "all-buildings", "destroyed": 323, "damaged": 32, "possible": 78, "affected": 433},
            {"id": "residential", "destroyed": 283, "damaged": 31, "possible": 78, "affected": 392},
            {"id": "institutional", "affected": 1},
            {"id": "school", "affected": 1},
            {"id": "other-nonres", "affected": 37},
            {"id": "religious", "affected": 2},
        ]
        for row in rows:
            if row["id"] in over:
                row.update(over[row["id"]])
        return rows

    def test_the_real_published_table_closes(self):
        """323+32+78 = 433, 283+31+78 = 392, and 392+1+1+37+2 = 433."""
        assert buildings_close(self._rows()) is True

    def test_a_broken_class_sum_is_refused(self):
        """392 is inside 433. A scrape that lets a reader add them is refused."""
        assert buildings_close(self._rows(**{"religious": {"affected": 99}})) is False

    def test_a_broken_parts_sum_is_refused(self):
        assert buildings_close(self._rows(**{"all-buildings": {"destroyed": 1}})) is False

    def test_an_empty_scrape_does_not_close(self):
        assert buildings_close([]) is False
        assert buildings_close(None) is False


class TestMergeDamage:
    def test_a_scrape_that_does_not_close_leaves_the_table_alone(self):
        reviewed = {"copernicus": {"rows": [{"id": "residential", "affected": 392}]}}
        live = {"rows": [{"id": "residential", "affected": 999}], "source": {}}
        out = merge_damage(reviewed, live)
        assert out["copernicus"]["rows"][0]["affected"] == 392

    def test_maps_overlay_without_needing_a_closed_table(self):
        """Images are not arithmetic."""
        reviewed = {"copernicus": {"rows": [], "maps": []}}
        live = {"rows": [], "maps": [{"id": "m1"}], "photos": [], "source": {}}
        assert merge_damage(reviewed, live)["copernicus"]["maps"] == [{"id": "m1"}]

    def test_an_empty_scrape_leaves_reviewed_images_in_place(self):
        reviewed = {"copernicus": {"rows": [], "maps": [{"id": "old"}]}}
        live = {"rows": [], "maps": [], "photos": [], "source": {}}
        assert merge_damage(reviewed, live)["copernicus"]["maps"] == [{"id": "old"}]

    def test_a_failed_read_returns_the_reviewed_content_untouched(self):
        reviewed = {"copernicus": {"rows": [{"id": "residential", "affected": 392}]}}
        assert merge_damage(reviewed, {"error": "boom"}) is reviewed
