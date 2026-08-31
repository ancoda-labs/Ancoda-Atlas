"""The ten-minute digests, and the editorial rule behind them."""

from datetime import datetime, timezone

import pytest

from app.domains.ai.providers.base import Completion, LLMProvider
from app.domains.news.digest import (
    bucket_end_for,
    bucket_start_for,
    clean,
    detect_digest_language,
    draft_digest,
    extract_json,
    extractive_digest,
    resolve_digest_language,
    translate_digest,
)


class FakeProvider(LLMProvider):
    name = "fake"

    def __init__(self, text: str = "", fail: bool = False):
        super().__init__()
        self._text = text
        self._fail = fail

    @property
    def is_configured(self) -> bool:
        return True

    async def complete(self, system_prompt, user_message, **kwargs):
        if self._fail:
            raise RuntimeError("model exploded")
        return Completion(text=self._text, model="fake-1")


def _items(n=3):
    return [
        {"title": f"Flood story {i}", "source": f"Outlet {i}", "link": f"https://x/{i}"}
        for i in range(n)
    ]


class TestBuckets:
    def test_a_moment_falls_into_its_ten_minute_window(self):
        moment = datetime(2026, 8, 31, 12, 37, 42, tzinfo=timezone.utc)
        assert bucket_start_for(moment) == datetime(2026, 8, 31, 12, 30, tzinfo=timezone.utc)

    def test_the_window_is_ten_minutes_wide(self):
        start = datetime(2026, 8, 31, 12, 30, tzinfo=timezone.utc)
        assert (bucket_end_for(start) - start).total_seconds() == 600

    def test_a_naive_datetime_reads_as_utc(self):
        assert bucket_start_for(datetime(2026, 8, 31, 12, 37)).tzinfo is timezone.utc


class TestExtractiveDigest:
    def test_an_empty_window_says_so(self):
        out = extractive_digest([], "en")
        assert out["headline"] == "No new reporting"
        assert out["bullets"] == []

    def test_nepali_boilerplate(self):
        assert extractive_digest([], "ne")["headline"] == "नयाँ समाचार छैन"

    def test_it_says_no_model_wrote_it(self):
        """The reader is entitled to know a machine only listed the news."""
        assert "No model wrote this brief" in extractive_digest(_items(), "en")["summary"]

    def test_syndicated_near_duplicates_do_not_fill_the_brief(self):
        """The same story from six outlets is the norm on a wire."""
        items = [
            {"title": "Flood washes away Rasuwa bridge today", "source": f"O{i}", "link": f"https://x/{i}"}
            for i in range(6)
        ]
        assert len(extractive_digest(items, "en")["bullets"]) == 1

    def test_at_most_four_bullets(self):
        assert len(extractive_digest(_items(10), "en")["bullets"]) == 4


class TestLanguageHonesty:
    def test_devanagari_text_is_detected_as_nepali(self):
        """The label only chooses boilerplate; the script is the honest answer."""
        draft = {"headline": "रसुवामा बाढी", "bullets": []}
        assert detect_digest_language(draft) == "ne"

    def test_latin_text_is_detected_as_english(self):
        assert detect_digest_language({"headline": "Flood in Rasuwa", "bullets": []}) == "en"

    def test_an_untranslated_draft_is_labelled_by_its_actual_script(self):
        draft = {"headline": "रसुवामा बाढी", "bullets": []}
        assert resolve_digest_language(draft, "en", translated=False) == "ne"

    def test_a_translated_draft_is_labelled_with_the_requested_language(self):
        draft = {"headline": "Flood in Rasuwa", "bullets": []}
        assert resolve_digest_language(draft, "fr", translated=True) == "fr"


class TestExtractJson:
    def test_a_fenced_object_is_recovered(self):
        assert extract_json('```json\n{"a": 1}\n```') == {"a": 1}

    def test_a_prefaced_object_is_recovered(self):
        assert extract_json('Sure! {"a": 1}') == {"a": 1}

    def test_nonsense_is_none(self):
        assert extract_json("no json here") is None
        assert extract_json("") is None


def test_clean_truncates_with_an_ellipsis():
    assert clean("x" * 100, 10).endswith("…")
    assert len(clean("x" * 100, 10)) == 10


class TestDraftDigest:
    async def test_no_provider_falls_back_to_extractive(self):
        out = await draft_digest(None, _items(), "en")
        assert out["generator"] == "extractive"
        assert out["model"] is None

    async def test_a_good_model_response_is_used(self):
        provider = FakeProvider('{"headline": "H", "summary": "S", "bullets": ["b1"]}')
        out = await draft_digest(provider, _items(), "en")
        assert out["generator"] == "llm"
        assert out["draft"]["headline"] == "H"

    async def test_a_model_failure_falls_back_rather_than_erroring(self):
        """A disaster page must not go blank because a model timed out."""
        out = await draft_digest(FakeProvider(fail=True), _items(), "en")
        assert out["generator"] == "extractive"

    async def test_unusable_json_falls_back(self):
        out = await draft_digest(FakeProvider("I cannot do that"), _items(), "en")
        assert out["generator"] == "extractive"

    async def test_bullets_are_capped_at_four(self):
        provider = FakeProvider(
            '{"headline": "H", "summary": "S", "bullets": ["1","2","3","4","5","6"]}'
        )
        out = await draft_digest(provider, _items(), "en")
        assert len(out["draft"]["bullets"]) == 4


class TestTranslateDigest:
    _draft = {"headline": "Flood", "summary": "A summary.", "bullets": ["one", "two"]}

    async def test_no_provider_leaves_the_draft_alone(self):
        out = await translate_digest(None, self._draft, "ne")
        assert out["translated"] is False
        assert out["draft"] is self._draft

    async def test_a_good_translation_is_taken_and_labelled(self):
        provider = FakeProvider(
            '{"headline": "बाढी", "summary": "सारांश।", "bullets": ["एक", "दुई"]}'
        )
        out = await translate_digest(provider, self._draft, "ne")
        assert out["translated"] is True
        assert out["draft"]["headline"] == "बाढी"

    async def test_a_translation_that_drops_a_bullet_is_refused(self):
        """A translation that lost or gained a point is not a translation."""
        provider = FakeProvider('{"headline": "बाढी", "summary": "सारांश।", "bullets": ["एक"]}')
        out = await translate_digest(provider, self._draft, "ne")
        assert out["translated"] is False
        assert out["draft"] == self._draft

    async def test_a_translation_that_invents_a_bullet_is_refused(self):
        provider = FakeProvider(
            '{"headline": "बाढी", "summary": "सारांश।", "bullets": ["एक","दुई","तीन"]}'
        )
        assert (await translate_digest(provider, self._draft, "ne"))["translated"] is False

    async def test_a_failed_call_leaves_the_original_standing(self):
        out = await translate_digest(FakeProvider(fail=True), self._draft, "ne")
        assert out["translated"] is False
        assert out["draft"] == self._draft


@pytest.mark.parametrize("lang", ["en", "ne"])
async def test_an_empty_window_never_calls_the_model(lang):
    """Windows with no reporting are not worth a model call or a stored row."""
    out = await draft_digest(FakeProvider(fail=True), [], lang)
    assert out["generator"] == "extractive"
