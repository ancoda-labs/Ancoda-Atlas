"""The nepal.gov.np updates portal: what it publishes, and what Atlas keeps.

The portal is the whole government's noticeboard. These tests pin the three
things that make it safe to put on a hazard page — the gate that keeps
administrative circulars off it, the approval check, and the refusal to invent
a translation the government did not write.
"""

import httpx
import respx

from app.domains.news.sources import gov_updates as gu

FLOOD_POST = {
    "id": "a3f40c09",
    "title": "बाढीपछिको अवस्थाबारे जिल्ला प्रशासन कार्यालय, नुवाकोटको सूचना",
    "content": "रसुवा बाढीपछिको मानवीय क्षति, खोज तथा उद्धार, राहत वितरणबारे सूचना",
    "status": "APPROVED",
    "createdAt": "2026-09-01T10:32:30.033Z",
    "author": {"name": "Moti Khanal", "department": "Office of the Prime Minister"},
    "attachments": [],
}

CIRCULAR = {
    "id": "91058cc6",
    "title": "वृत्ति मार्गनिर्देशन सेवा सञ्चालन निर्देशिका, २०८३",
    "content": "वृत्ति मार्गनिर्देशन सेवा सञ्चालन निर्देशिका, २०८३",
    "status": "APPROVED",
    "createdAt": "2026-09-01T11:20:00.000Z",
    "author": {"name": "Binod", "department": "Ministry of Education and Sports"},
    "attachments": [],
}


def _page(items, cursor=None):
    return httpx.Response(200, json={"items": items, "nextCursor": cursor})


def _route():
    return respx.get(url__startswith=f"{gu.BASE}/api/updates")


class TestHazardGate:
    def test_a_flood_notice_passes(self):
        assert gu.is_hazard_post(FLOOD_POST["title"], FLOOD_POST["content"])

    def test_an_education_circular_does_not(self):
        """The feed is every ministry. A career directive is not a hazard."""
        assert not gu.is_hazard_post(CIRCULAR["title"], CIRCULAR["content"])

    @respx.mock
    async def test_the_circular_never_reaches_the_desk(self):
        _route().mock(return_value=_page([FLOOD_POST, CIRCULAR]))
        out = await gu.get_gov_updates()
        assert [i["id"] for i in out["items"]] == ["a3f40c09"]


class TestApproval:
    @respx.mock
    async def test_an_unapproved_post_is_dropped(self):
        """A draft inside a ministry is not a government statement yet."""
        draft = {**FLOOD_POST, "id": "draft", "status": "PENDING"}
        _route().mock(return_value=_page([draft, FLOOD_POST]))
        out = await gu.get_gov_updates()
        assert [i["id"] for i in out["items"]] == ["a3f40c09"]


class TestLanguage:
    def test_a_nepali_post_answers_none_for_english(self):
        """Not a copy of the Nepali. The government published no English."""
        out = gu.split_body("रसुवामा उद्धार जारी")
        assert out["ne"] == "रसुवामा उद्धार जारी"
        assert out["en"] is None

    def test_each_line_is_filed_under_its_own_script(self):
        out = gu.split_body(
            "रसुवा बाढी; खोज, उद्धार तथा राहत अपडेट\n"
            "Rasuwa Flood: Search, Rescue and Relief Update as of 1 September"
        )
        assert out["ne"] == "रसुवा बाढी; खोज, उद्धार तथा राहत अपडेट"
        assert out["en"].startswith("Rasuwa Flood: Search")

    def test_a_letterhead_is_not_an_english_version(self):
        """The page prefers English. A signature would replace the warning.

        This post tells people along the Bagmati to move. Filing its trailing
        office name as the English version would show an English reader the
        authority's name and none of the instruction.
        """
        out = gu.split_body(
            "बागमती नदीमा जल सतह बढ्यो, तटीय क्षेत्रका बासिन्दा सतर्क रहनुहोला। "
            "जोखिममा रहेका परिवारलाई सुरक्षित स्थानमा सार्न निर्देशन दिइएको छ।\n"
            "National Disaster Risk Reduction & Management Authority"
        )
        assert out["en"] is None
        assert "बागमती" in out["ne"]

    def test_a_line_the_government_wrote_is_never_dropped(self):
        """A letterhead stays in the post rather than vanishing with English."""
        out = gu.split_body(
            "मेलम्ची र ईन्द्रावतीका बासिन्दा बिहानसम्म सतर्क रहनुहोला। "
            "आवश्यक परे नजिकको सुरक्षित स्थानमा जानुहोस्।\nNDRRMA"
        )
        assert out["ne"].endswith("NDRRMA")

    def test_an_english_only_post_stays_english(self):
        out = gu.split_body("Disaster Health Help Coordination Portal is now open.")
        assert out["en"] == "Disaster Health Help Coordination Portal is now open."
        assert out["ne"] is None

    def test_a_list_keeps_its_line_breaks(self):
        """These posts are often lists of restored sites; the shape is content."""
        out = gu.split_body("कल्लेरी सुचारु\r\nभद्रटार सुचारु")
        assert out["ne"] == "कल्लेरी सुचारु\nभद्रटार सुचारु"

    def test_a_nepali_headline_does_not_become_an_english_one(self):
        out = gu.split_title("बाढी अपडेट")
        assert out["titleNe"] == "बाढी अपडेट"
        assert out["title"] is None


class TestTopic:
    """Hazard or not is too coarse for a page about one hazard."""

    def test_a_flood_sitrep_is_filed_under_flood(self):
        assert gu.classify_topic("रसुवा बाढी अपडेट", "बाढीबाट क्षति") == "flood"

    def test_a_fire_advisory_is_not_filed_under_flood(self):
        assert gu.classify_topic("डढेलो नियन्त्रण", "वन आगलागी बढ्दै") == "wildfire"

    def test_relief_is_the_answer_only_when_nothing_specific_fits(self):
        """Nearly every hazard post mentions rescue, so it must not win ties."""
        assert gu.classify_topic("राहत वितरण", "विस्थापित परिवारलाई राहत") == "relief"
        assert gu.classify_topic("बाढी राहत वितरण", "बाढी प्रभावितलाई राहत") == "flood"

    def test_a_post_naming_no_hazard_has_no_topic(self):
        assert gu.classify_topic("सूचना", "कार्यालय समय परिवर्तन") is None


class TestAttribution:
    @respx.mock
    async def test_the_ministry_travels_and_the_official_does_not(self):
        """The department makes it official. The named typist is not needed."""
        _route().mock(return_value=_page([FLOOD_POST]))
        item = (await gu.get_gov_updates())["items"][0]
        assert item["ministry"] == "Office of the Prime Minister"
        assert "Moti Khanal" not in str(item)


class TestAttachments:
    @respx.mock
    async def test_a_notice_photograph_and_a_pdf_are_told_apart(self):
        post = {
            **FLOOD_POST,
            "attachments": [
                {"id": "img1", "filename": "notice.jpg", "mimeType": "image/jpeg"},
                {"id": "doc1", "filename": "directive.pdf", "mimeType": "application/pdf"},
            ],
        }
        _route().mock(return_value=_page([post]))
        item = (await gu.get_gov_updates())["items"][0]

        assert item["images"] == [
            {
                "filename": "notice.jpg",
                "mimeType": "image/jpeg",
                "image": f"{gu.BASE}/api/updates/a3f40c09/attachments/img1",
            }
        ]
        assert item["documents"][0]["url"].endswith("/a3f40c09/attachments/doc1")

    def test_an_attachment_url_is_scoped_to_its_post(self):
        """The file id alone does not address the file."""
        images, _ = gu.split_attachments(
            "post9", [{"id": "f1", "filename": "a.jpg", "mimeType": "image/png"}]
        )
        assert images[0]["image"] == f"{gu.BASE}/api/updates/post9/attachments/f1"


class TestPaging:
    @respx.mock
    async def test_it_follows_the_cursor(self):
        second = {**FLOOD_POST, "id": "page2", "createdAt": "2026-09-01T09:00:00.000Z"}
        _route().mock(
            side_effect=[_page([FLOOD_POST], cursor="c1"), _page([second])]
        )
        out = await gu.get_gov_updates(limit=50)
        assert [i["id"] for i in out["items"]] == ["a3f40c09", "page2"]

    @respx.mock
    async def test_a_post_repeated_across_the_boundary_is_shown_once(self):
        """Something published mid-read shifts the page and duplicates a row."""
        _route().mock(
            side_effect=[_page([FLOOD_POST], cursor="c1"), _page([FLOOD_POST])]
        )
        out = await gu.get_gov_updates(limit=50)
        assert len(out["items"]) == 1

    @respx.mock
    async def test_paging_stops_rather_than_walking_the_year(self):
        _route().mock(return_value=_page([FLOOD_POST], cursor="endless"))
        await gu.get_gov_updates(limit=50)
        assert respx.calls.call_count == gu.MAX_PAGES


class TestFailure:
    @respx.mock
    async def test_a_dead_portal_answers_an_error_not_an_exception(self):
        _route().mock(return_value=httpx.Response(503))
        out = await gu.get_gov_updates()
        assert out["items"] == []
        assert out["error"]
        assert out["source"] == gu.SOURCE

    @respx.mock
    async def test_an_html_error_page_is_not_read_as_a_feed(self):
        _route().mock(return_value=httpx.Response(200, text="<html>maintenance</html>"))
        out = await gu.get_gov_updates()
        assert out["items"] == []
        assert out["error"]

    @respx.mock
    async def test_a_quiet_week_is_an_answer_not_a_failure(self):
        """No hazard post is a real state during a calm week."""
        _route().mock(return_value=_page([CIRCULAR]))
        out = await gu.get_gov_updates()
        assert out["items"] == []
        assert out["error"] is None
