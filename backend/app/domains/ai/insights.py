"""The flood desk's overview brief, in the reader's language.

The brief itself is extractive — it lists what the outlets filed and says so.
See domains/news/digest.py for why the desk stopped asking a model to write
about a disaster. A model's only job here is to carry that brief into a
language the wire does not arrive in.

Which means the honest answer depends on what is configured. With no model,
only Nepali and English are possible, and a request for anything else falls
back to Nepali and says which language it fell back from.
"""

import asyncio
import time
from typing import Any

from app.core.http import now_iso
from app.core.logging import get_logger
from app.domains.ai.languages import find_language, is_wire_language
from app.domains.ai.providers.factory import get_provider
from app.domains.news.digest import (
    detect_digest_language,
    extractive_digest,
    resolve_digest_language,
    translate_digest,
)

log = get_logger(__name__)

CACHE_TTL_S = 10 * 60
_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_locks: dict[str, asyncio.Lock] = {}


def needs_translation(draft: dict[str, Any], lang: str) -> bool:
    """Whether the brief still needs carrying into the reader's language.

    Decided on the TEXT, not the language code. The wire is mixed — most of
    these headlines are filed in Nepali, a few in English — and the extractive
    draft reproduces whatever it was handed, so an English reader can be shown
    a page of Devanagari under a label that says English. What the headlines
    are actually written in is the only thing that settles it.
    """
    return not is_wire_language(lang) or detect_digest_language(draft) != lang


async def build_insight(lang_code: str) -> dict[str, Any]:
    from app.domains.news.sources.nepal_news import fetch_topic_news

    requested = find_language(lang_code)

    data = await fetch_topic_news(topic="flood", window="24h", limit=18, source_cap=8)
    items = data.get("items") or []

    provider = get_provider()
    has_model = bool(provider and provider.is_configured)

    if not items:
        return {"insight": None, "hasModel": has_model, "reason": "no_reporting"}

    # Without a model, only the two wire languages are actually writable.
    writable = requested if (has_model or is_wire_language(requested.code)) else find_language("ne")
    fell_back_from = None if writable.code == requested.code else requested.code

    source_lang = writable.code if is_wire_language(writable.code) else "ne"
    drafted = extractive_digest(items, source_lang)

    if needs_translation(drafted, writable.code):
        result = await translate_digest(provider, drafted, writable.code, writable.english)
    else:
        result = {"draft": drafted, "model": None, "translated": False}

    lang = resolve_digest_language(drafted, writable.code, result["translated"])

    insight = {
        **result["draft"],
        "sources": [
            {"title": i["title"], "url": i["link"], "source": i["source"]} for i in items[:8]
        ],
        "itemCount": len(items),
        # Always extractive: a model translated it at most, it did not write it.
        "generator": "extractive",
        "model": result["model"],
        "translated": result["translated"],
        "lang": lang,
        "fellBackFrom": None if lang == requested.code else (fell_back_from or requested.code),
        "generatedAt": now_iso(),
    }
    return {"insight": insight, "hasModel": has_model}


async def get_insight(lang_code: str) -> dict[str, Any]:
    key = find_language(lang_code).code

    hit = _cache.get(key)
    if hit and (time.monotonic() - hit[0]) < CACHE_TTL_S:
        return hit[1]

    # One lock per language: a burst of readers on the same language pays for
    # one translation, not one each.
    lock = _locks.setdefault(key, asyncio.Lock())
    async with lock:
        hit = _cache.get(key)
        if hit and (time.monotonic() - hit[0]) < CACHE_TTL_S:
            return hit[1]

        try:
            data = await build_insight(key)
        except Exception as exc:  # noqa: BLE001
            log.warning("insight_build_failed", lang=key, error=str(exc))
            return {"insight": None, "hasModel": False, "reason": "unavailable"}

        # Only a real brief is cached. Caching "no reporting" would hold an
        # empty panel for ten minutes after the wire came back.
        if data.get("insight"):
            _cache[key] = (time.monotonic(), data)
        return data
