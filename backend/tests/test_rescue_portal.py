"""The OPMCM portal: its counters, its register, and what it must not publish."""

import httpx
import respx

from app.domains.flood.sources import rescue_portal as rp


def _ok(payload):
    return httpx.Response(200, json={"success": True, "data": payload})


class TestCount:
    def test_a_published_counter_survives(self):
        assert rp.count(289) == 289

    def test_an_absent_counter_is_none_not_zero(self):
        """"The portal did not say" and "the portal said none" differ.

        A zero here would be published as a fact nobody stated.
        """
        assert rp.count(None) is None
        assert rp.count("12") is None

    def test_a_negative_count_is_rejected(self):
        assert rp.count(-1) is None

    def test_a_boolean_is_not_a_count(self):
        assert rp.count(True) is None


class TestSplitBilingual:
    def test_it_splits_by_script(self):
        out = rp.split_bilingual("नेपाली अनुच्छेद\n\nEnglish paragraph")
        assert out["ne"] == "नेपाली अनुच्छेद"
        assert out["en"] == "English paragraph"

    def test_a_leading_flag_emoji_is_dropped(self):
        out = rp.split_bilingual("🇳🇵 नेपाली\n\n🇬🇧 English")
        assert out["ne"] == "नेपाली"
        assert out["en"] == "English"

    def test_leading_punctuation_is_kept(self):
        """Only whitespace and emoji are stripped. A quote is content."""
        out = rp.split_bilingual('"Quoted" English only')
        assert out["en"] == '"Quoted" English only'

    def test_one_language_stands_in_for_both(self):
        """A blank panel is worse than the same text twice."""
        out = rp.split_bilingual("Only English")
        assert out["en"] == out["ne"] == "Only English"

    def test_the_live_updates_boilerplate_is_dropped(self):
        out = rp.split_bilingual("Real content\n\nOfficial live updates")
        assert "Official live updates" not in (out["en"] or "")


class TestSplitTitle:
    def test_a_nepali_dash_english_title_splits(self):
        assert rp.split_title("रसुवा अपडेट — Rasuwa update") == {
            "title": "Rasuwa update",
            "titleNe": "रसुवा अपडेट",
        }

    def test_a_single_language_title_is_used_for_both(self):
        assert rp.split_title("Rasuwa update") == {
            "title": "Rasuwa update",
            "titleNe": "Rasuwa update",
        }


class TestAbsolute:
    def test_a_relative_path_gains_the_portal_host(self):
        assert rp.absolute("/api/img/1") == f"{rp.BASE}/api/img/1"

    def test_an_absolute_url_is_untouched(self):
        assert rp.absolute("https://x.test/a.jpg") == "https://x.test/a.jpg"

    def test_nothing_is_none(self):
        assert rp.absolute("") is None


@respx.mock
async def test_stats_report_an_outage_with_null_counters_not_zeros():
    """Zeros would read as "nobody is asking for help"."""
    respx.get(url__startswith=f"{rp.BASE}/api/stats").mock(return_value=httpx.Response(503))
    out = await rp.get_rescue_portal_stats()
    assert out["error"] is not None
    assert out["persons"]["total"] is None
    assert out["requests"]["open"] is None


@respx.mock
async def test_the_register_reports_what_it_read_against_what_was_stated():
    """A partial sweep must be visible, not silently presented as the whole list."""
    rp._cache.clear()
    respx.get(url__startswith=f"{rp.BASE}/api/person-reports").mock(
        return_value=_ok(
            {
                "items": [
                    {"_id": "1", "type": "lost", "fullName": "Ram"},
                    {"_id": "2", "type": "found", "fullName": "Sita"},
                    {"_id": "3", "type": "unusual", "fullName": "Hari"},
                ],
                "total": 3,
            }
        )
    )
    out = await rp.get_person_register()
    assert out["total"] == 3
    assert out["fetched"] == 3
    assert len(out["lost"]) == 1
    assert len(out["found"]) == 1
    # An unusual type is still somebody's relative.
    assert len(out["other"]) == 1


@respx.mock
async def test_a_map_point_outside_nepal_is_dropped():
    """Sample rows on this portal geolocate to other countries."""
    rp._cache.clear()
    respx.get(url__startswith=f"{rp.BASE}/api/map").mock(
        return_value=_ok(
            {
                "requests": [
                    {"_id": "1", "location": {"coordinates": [85.3, 28.1]}},
                    {"_id": "2", "location": {"coordinates": [-74.0, 40.7]}},
                ]
            }
        )
    )
    out = await rp.get_help_requests_map()
    assert len(out["requests"]) == 1
    assert out["requests"][0]["id"] == "1"


@respx.mock
async def test_an_individual_volunteers_name_is_not_published():
    """Atlas cannot take a filing off the internet on request, so it does not
    republish a private person's name from one."""
    rp._cache.clear()
    respx.get(url__startswith=f"{rp.BASE}/api/latest").mock(
        return_value=_ok(
            {
                "requests": [],
                "offers": [
                    {"_id": "1", "providerType": "INDIVIDUAL", "providerName": "Sita Sharma"},
                    {"_id": "2", "providerType": "ORGANISATION", "providerName": "Red Cross"},
                ],
            }
        )
    )
    out = await rp.get_latest_activity()
    assert out["offers"][0]["providerName"] is None
    assert out["offers"][1]["providerName"] == "Red Cross"


@respx.mock
async def test_no_filer_contact_details_reach_the_payload():
    """The portal carries them; Atlas must not."""
    rp._cache.clear()
    respx.get(url__startswith=f"{rp.BASE}/api/latest").mock(
        return_value=_ok(
            {
                "requests": [
                    {
                        "_id": "1",
                        "title": "Need shelter",
                        "contactName": "Ram Bahadur",
                        "contactPhone": "9851000000",
                        "reporterName": "Ram Bahadur",
                    }
                ],
                "offers": [],
            }
        )
    )
    out = await rp.get_latest_activity()
    serialized = str(out)
    assert "9851000000" not in serialized
    assert "Ram Bahadur" not in serialized


@respx.mock
async def test_a_donation_channel_with_nothing_to_pay_into_is_dropped():
    rp._cache.clear()
    respx.get(url__startswith=f"{rp.BASE}/api/donations").mock(
        return_value=_ok(
            {
                "items": [
                    {"_id": "1", "title": "Empty"},
                    {"_id": "2", "title": "Real", "accountNumber": "123456"},
                ]
            }
        )
    )
    out = await rp.get_donation_channels()
    assert len(out["items"]) == 1
    assert out["items"][0]["accountNumber"] == "123456"


@respx.mock
async def test_donation_channels_are_ordered_by_the_portals_priority():
    rp._cache.clear()
    respx.get(url__startswith=f"{rp.BASE}/api/donations").mock(
        return_value=_ok(
            {
                "items": [
                    {"_id": "1", "accountNumber": "1", "priority": 5},
                    {"_id": "2", "accountNumber": "2", "priority": 1},
                ]
            }
        )
    )
    out = await rp.get_donation_channels()
    assert [i["id"] for i in out["items"]] == ["2", "1"]


def test_the_person_row_drops_the_inline_base64_thumbnail():
    """At sixteen thousand rows those data URIs are tens of megabytes.

    The same photograph is available as a URL the media proxy streams on demand.
    """
    row = rp.person_row(
        {
            "_id": "1",
            "fullName": "Ram",
            "imageUrl": "/api/img/1",
            "thumbnail": "data:image/png;base64,AAAA",
        },
        None,
    )
    assert row["image"] == f"{rp.BASE}/api/img/1"
    assert "data:image" not in str(row)


def test_the_sweep_budget_is_shorter_than_the_refresh_interval():
    """A sweep that outlives its own cycle stalls the desk's timestamp.

    Every page can spend 20s on a timeout and retry once, so without a budget
    the worst case runs longer than the interval and the schedule skips tick
    after tick while the page reports increasingly overdue figures.
    """
    assert rp.PERSON_SWEEP_BUDGET_S < 2 * 60
