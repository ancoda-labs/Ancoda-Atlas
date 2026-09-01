"""safe_fetch must never raise, and must never invent a value."""

import httpx
import respx

from app.core.http import FetchError, RawText, ago, days_ago, is_error, now_iso, safe_fetch


@respx.mock
async def test_json_is_parsed():
    respx.get("https://example.test/j").mock(return_value=httpx.Response(200, json={"ok": 1}))
    assert await safe_fetch("https://example.test/j") == {"ok": 1}


@respx.mock
async def test_html_under_the_json_default_becomes_a_debuggable_stub():
    """An endpoint answering HTML is a real failure mode worth seeing."""
    respx.get("https://example.test/h").mock(
        return_value=httpx.Response(200, text="<html>gateway error</html>")
    )
    result = await safe_fetch("https://example.test/h")
    assert isinstance(result, RawText)
    assert "gateway error" in result.raw_text


@respx.mock
async def test_text_mode_returns_the_body_verbatim():
    """Scrapers need this; under the JSON default HTML never parses."""
    respx.get("https://example.test/t").mock(return_value=httpx.Response(200, text="<html>hi</html>"))
    assert await safe_fetch("https://example.test/t", as_="text") == "<html>hi</html>"


@respx.mock
async def test_a_500_resolves_to_an_error_rather_than_raising():
    respx.get("https://example.test/e").mock(return_value=httpx.Response(500, text="boom"))
    result = await safe_fetch("https://example.test/e", retries=0)
    assert is_error(result)
    assert isinstance(result, FetchError)
    assert "500" in result.error
    assert result.source == "https://example.test/e"


@respx.mock
async def test_a_transport_failure_resolves_to_an_error():
    respx.get("https://example.test/x").mock(side_effect=httpx.ConnectError("refused"))
    result = await safe_fetch("https://example.test/x", retries=0)
    assert is_error(result)


@respx.mock
async def test_it_retries_once_and_takes_the_second_answer(monkeypatch):
    """A government portal blinking should not empty a panel."""
    monkeypatch.setattr("app.core.http.asyncio.sleep", _no_sleep)
    route = respx.get("https://example.test/r")
    route.side_effect = [
        httpx.Response(503, text="try later"),
        httpx.Response(200, json={"recovered": True}),
    ]
    assert await safe_fetch("https://example.test/r", retries=1) == {"recovered": True}
    assert route.call_count == 2


@respx.mock
async def test_retries_are_bounded(monkeypatch):
    """These are public feeds during a disaster. Hammering them is the bug."""
    monkeypatch.setattr("app.core.http.asyncio.sleep", _no_sleep)
    route = respx.get("https://example.test/d").mock(return_value=httpx.Response(500))
    await safe_fetch("https://example.test/d", retries=1)
    assert route.call_count == 2


async def _no_sleep(_seconds):
    return None


class TestTimeHelpers:
    def test_now_iso_matches_the_javascript_shape(self):
        """The frontend compares these as strings, so the format must match."""
        import re

        assert re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z", now_iso())

    def test_ago_is_in_the_past(self):
        assert ago(1) < now_iso()

    def test_days_ago_is_a_plain_date(self):
        import re

        assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", days_ago(7))
