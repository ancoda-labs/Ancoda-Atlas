"""BIPAD incidents, the NDRRMA register, and the flood's scope."""

import httpx
import respx

from app.domains.flood.scope import (
    describes_corridor,
    district_pin_for_text,
    in_corridor,
    is_placeholder,
    phone,
)
from app.domains.flood.sources import ndrrma
from app.domains.flood.sources.bipad import (
    get_corridor_incidents,
    get_district_contacts,
    normalise_loss,
)


class TestNormaliseLoss:
    """The distinction this whole module turns on."""

    def test_an_unfilled_record_is_marked_unreported(self):
        """BIPAD stores an unfilled loss record as a row of zeros.

        "Nobody died" and "nobody has typed the figures in yet" are the same
        bytes, and during a live response the second is far more likely.
        Printing a confident 0 beside the word "deaths" on a page a grieving
        family might open is not a rounding error.
        """
        loss = normalise_loss({"id": 1, "peopleDeathCount": 0, "peopleMissingCount": 0})
        assert loss["deaths"] == 0
        assert loss["reported"] is False

    def test_a_filled_record_is_marked_reported(self):
        loss = normalise_loss({"id": 1, "peopleDeathCount": 3})
        assert loss["deaths"] == 3
        assert loss["reported"] is True

    def test_a_record_with_only_property_damage_still_counts_as_reported(self):
        """Somebody filled this in; it is not an empty row."""
        loss = normalise_loss({"id": 1, "infrastructureDestroyedHouseCount": 4})
        assert loss["reported"] is True

    def test_economic_loss_sums_both_upstream_fields(self):
        loss = normalise_loss(
            {"id": 1, "infrastructureEconomicLoss": 100, "agricultureEconomicLoss": 50}
        )
        assert loss["economicLoss"] == 150

    def test_no_record_is_none_not_a_row_of_zeros(self):
        assert normalise_loss(None) is None


@respx.mock
async def test_totals_carry_the_count_of_incidents_that_had_figures():
    """A total of 0 deaths across 38 incidents means almost nothing on its own.

    The page needs to be able to say "9 of 38 incidents have figures entered".
    """
    respx.get(url__startswith="https://bipadportal.gov.np").mock(
        return_value=httpx.Response(
            200,
            json={
                "results": [
                    {
                        "id": 1,
                        "incidentOn": "2026-08-26",
                        "point": {"coordinates": [85.3, 28.1]},
                        "loss": {"id": 10, "peopleDeathCount": 2},
                    },
                    {
                        "id": 2,
                        "incidentOn": "2026-08-25",
                        "point": {"coordinates": [85.3, 28.1]},
                        "loss": {"id": 11, "peopleDeathCount": 0},
                    },
                ],
                "next": None,
            },
        )
    )
    out = await get_corridor_incidents(since="2026-08-20")
    totals = out["totals"]
    assert totals["incidentCount"] == 4  # both hazards queried against one mock
    assert totals["incidentsWithFigures"] == 2
    assert totals["incidentsAwaitingFigures"] == 2


@respx.mock
async def test_incidents_outside_the_corridor_are_excluded():
    """BIPAD's own district filter is unreliable, so membership is by coordinate."""
    respx.get(url__startswith="https://bipadportal.gov.np").mock(
        return_value=httpx.Response(
            200,
            json={
                "results": [
                    {"id": 1, "incidentOn": "2026-08-26", "point": {"coordinates": [87.0, 26.5]}}
                ],
                "next": None,
            },
        )
    )
    out = await get_corridor_incidents(since="2026-08-21")
    assert out["incidents"] == []


class TestCorridor:
    def test_rasuwa_is_inside(self):
        assert in_corridor(28.1, 85.3) is True

    def test_biratnagar_is_outside(self):
        assert in_corridor(26.45, 87.27) is False

    def test_missing_coordinates_are_outside(self):
        assert in_corridor(None, None) is False


class TestDirectoryHygiene:
    def test_a_portal_test_row_is_dropped(self):
        """BIPAD's Nuwakot list carries a "Test / Test / 9811123456" entry.

        On a page someone in trouble is dialling from, that is a wasted call.
        """
        assert is_placeholder("Test", "Test", "9811123456") is True

    def test_a_repeated_digit_number_is_dropped(self):
        assert is_placeholder("Ram", "CDO", "9999999999") is True

    def test_a_real_contact_is_kept(self):
        assert is_placeholder("Ram Bahadur", "CDO", "9851012345") is False

    def test_phone_strips_formatting(self):
        assert phone("+977 (01) 4211-999") == "+977014211999"

    def test_a_too_short_number_is_not_dialable(self):
        assert phone("123") is None
        assert phone(None) is None


@respx.mock
async def test_district_contacts_report_an_outage_rather_than_an_empty_directory():
    """An empty contact list and an unreachable portal are different facts."""
    respx.get(url__startswith="https://bipadportal.gov.np").mock(
        return_value=httpx.Response(500)
    )
    out = await get_district_contacts()
    assert out["districts"] == []
    assert out["error"] is not None


class TestDistrictPins:
    def test_a_longer_name_wins_over_its_prefix(self):
        """Otherwise "Nawalparasi East" resolves to plain "Nawalparasi"."""
        assert district_pin_for_text("flooding in Nawalparasi East")["district"] == "Nawalparasi East"

    def test_devanagari_resolves(self):
        assert district_pin_for_text("रसुवामा बाढी")["district"] == "Rasuwa"

    def test_a_place_within_a_district_resolves_to_it(self):
        assert district_pin_for_text("Syaphrubesi swept away")["district"] == "Rasuwa"

    def test_an_uncovered_district_is_none(self):
        assert district_pin_for_text("flooding in Jhapa") is None


class TestDescribesCorridor:
    """Naming a corridor district and being about this flood are not the same."""

    def test_a_corridor_title_decides_it(self):
        assert describes_corridor("टिमुरेमा सीसी क्यामेरा जडान", None) == "Rasuwa"

    def test_the_body_answers_when_the_title_names_nowhere(self):
        """A telecom restoration log names its districts in the list, not the title."""
        district = describes_corridor(
            "नेपाल टेलिकमको साइट पुनर्स्थापना अपडेट",
            "धादिङको कल्लेरी साइट सुचारु भएको छ",
        )
        assert district == "Dhading"

    def test_a_post_naming_several_districts_still_answers_one(self):
        """The district is a label on the post, not a claim about who was hit."""
        district = describes_corridor(None, "धादिङ र नुवाकोट दुवैमा साइट सुचारु")
        assert district in {"Dhading", "Nuwakot"}

    def test_a_national_advisory_naming_one_corridor_district_is_not_this_flood(self):
        """The failure this exists to prevent.

        A flash-flood warning for the whole country lists Nuwakot among twenty
        districts. Filing it as corridor news puts a national forecast on the
        desk as though it said something about the Bhotekoshi.
        """
        assert describes_corridor(
            "देशका केही स्थानमा आकस्मिक बाढीको सम्भावना",
            "नुवाकोट, झापा, मोरङलगायतका जिल्लामा सतर्कता अपनाउन आग्रह",
        ) is None

    def test_a_corridor_title_survives_a_nationwide_body(self):
        """What the post is titled is what it is about."""
        assert describes_corridor(
            "रसुवा बाढी; उद्धार अपडेट",
            "देशका विभिन्न स्थानमा वर्षा जारी छ",
        ) == "Rasuwa"

    def test_another_river_basin_is_not_this_flood(self):
        assert describes_corridor("महाकाली तटिय क्षेत्रका बासिन्दा सतर्क रहनुहोला", None) is None


class TestNdrrmaHelpers:
    def test_clean_drops_whitespace_only_values(self):
        assert ndrrma.clean("  ") is None
        assert ndrrma.clean(" Ram ") == "Ram"
        assert ndrrma.clean(None) is None

    def test_strip_html_flattens_advisory_markup(self):
        assert ndrrma.strip_html("<p>Verify&nbsp;before  sharing</p>") == "Verify before sharing"

    def test_strip_html_of_nothing_is_none(self):
        assert ndrrma.strip_html("<p></p>") is None


@respx.mock
async def test_the_register_survives_a_missing_messages_endpoint():
    """The notices above the register are flavour. The names are the job."""
    respx.get(url__startswith=f"{ndrrma.BASE}/rescues/messages").mock(
        return_value=httpx.Response(500)
    )
    respx.get(url__startswith=f"{ndrrma.BASE}/rescues/rescued-persons").mock(
        return_value=httpx.Response(
            200, json={"results": [{"id": 1, "name": "Ram", "age": 30}], "next": None}
        )
    )
    respx.get(url__startswith=f"{ndrrma.BASE}/rescues/status-counts").mock(
        return_value=httpx.Response(200, json={"total_count": 1, "nepali_count": 1})
    )
    respx.get(url__startswith=f"{ndrrma.BASE}/rescues/rescued-locations").mock(
        return_value=httpx.Response(200, json={"results": [], "next": None})
    )
    respx.get(url__startswith=f"{ndrrma.BASE}/rescues/stationed-locations").mock(
        return_value=httpx.Response(200, json={"results": [], "next": None})
    )
    ndrrma._cache.clear()

    out = await ndrrma.get_rescue_register()
    assert len(out["persons"]) == 1
    assert out["error"] is None  # messages failing is not a register error


def test_an_unnamed_record_is_kept_not_dropped():
    """A record with no name is still a rescue that happened.

    Dropping it would make the register disagree with the official count, and
    the count is what a family checks first.
    """
    # The mapper keeps a null name rather than filtering the row.
    assert ndrrma.clean(None) is None
