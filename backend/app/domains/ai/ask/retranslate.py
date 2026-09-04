"""Retranslating a thread already on screen.

The ask turn translates once, for whatever language was selected when the
reader hit Send. Changing the picker afterwards would leave earlier turns in
the old language unless something carries them.

This endpoint cannot be used to get unguarded prose out of the model: every
string it returns is a translation of something it was given, and the digits
have to match (`numbers_survived`). Nothing is composed here.

Each text is translated with its own `translate_answer` call. Batching would
make one bad paragraph discard seven good translations with it, because the
numbers check fails whole responses.

`source_langs` declares the language each text was composed in — same contract
as `ComposedAnswer.lang`. No sniffing of Devanagari inside interpolated
headlines.
"""

from typing import Any

from app.domains.ai.ask.guard import scrub_text
from app.domains.ai.ask.rate_limit import record_turn
from app.domains.ai.ask.translate import translate_answer
from app.domains.ai.languages import find_language
from app.domains.ai.providers.base import LLMProvider

MAX_ITEMS = 24
MAX_CHARS = 1200


async def retranslate_thread(
    provider: LLMProvider | None,
    texts: list[str],
    lang_code: str,
    *,
    source_langs: list[str] | None = None,
    client_key: str | None = None,
) -> list[dict[str, Any]]:
    """One entry per input, in order. Never raises."""
    requested = find_language(lang_code)
    out: list[dict[str, Any]] = []
    langs = source_langs or []

    for i, raw in enumerate(texts):
        cleaned = scrub_text(raw if isinstance(raw, str) else "", limit=MAX_CHARS)
        source_lang = "en"
        if i < len(langs) and isinstance(langs[i], str) and langs[i]:
            source_lang = find_language(langs[i]).code
            if source_lang not in ("en", "ne"):
                source_lang = "en"

        if source_lang == requested.code:
            out.append(
                {
                    "text": cleaned,
                    "lang": requested.code,
                    "translated": False,
                    "fellBackFrom": None,
                }
            )
            continue
        try:
            result = await translate_answer(
                provider, cleaned, requested.code, requested.english
            )
            if client_key and provider and provider.is_configured:
                record_turn(client_key, 0)
            translated = bool(result.get("translated"))
            out.append(
                {
                    "text": result.get("answer") or cleaned,
                    "lang": result.get("lang") or (requested.code if translated else None),
                    "translated": translated,
                    "fellBackFrom": None if translated else requested.code,
                }
            )
        except Exception:  # noqa: BLE001
            out.append(
                {
                    "text": cleaned,
                    "lang": None,
                    "translated": False,
                    "fellBackFrom": requested.code,
                }
            )
    return out
