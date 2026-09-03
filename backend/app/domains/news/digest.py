"""Ten-minute news digests for the flood desk.

The wire is a raw list of headlines: useful to someone watching it all day,
near-useless to someone opening the page for the first time at hour nineteen.
This turns each ten-minute window of reporting into one short brief, so the
page can show how the event actually developed rather than a wall of
near-duplicate titles.

THE EDITORIAL DECISION THAT SHAPES THIS MODULE.

The desk stopped asking a model to *write* about a disaster. A summary that
reads well is indistinguishable from a summary that is right, and neither the
reader nor Atlas can tell them apart from the page. So the default draft is
extractive — it lists what the outlets filed — and a model is allowed only to
carry that draft across languages. Translation is a narrower job than writing
and it fails more visibly: a translation that drops or invents a bullet is
caught by counting them.

The LLM path is still here for the stored ten-minute digests, and it always
reports which of the two produced the text. A reader on a disaster page is
entitled to know whether a machine summarised the news or merely listed it.
"""

import json as jsonlib
import re
from datetime import datetime, timedelta, timezone
from typing import Any

from app.core.logging import get_logger
from app.domains.ai.providers.base import LLMProvider

log = get_logger(__name__)

# Digest windows are ten minutes wide and aligned to the clock.
BUCKET_MINUTES = 10

DEVANAGARI = re.compile(r"[ऀ-ॿ]")


def bucket_start_for(moment: datetime) -> datetime:
    """The start of the ten-minute window a moment falls in."""
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    moment = moment.astimezone(timezone.utc)
    return moment.replace(
        minute=(moment.minute // BUCKET_MINUTES) * BUCKET_MINUTES, second=0, microsecond=0
    )


def bucket_end_for(start: datetime) -> datetime:
    return start + timedelta(minutes=BUCKET_MINUTES)


# How each language is named to the model. Only the codes with a script worth
# naming are listed; callers that know the language pass its name directly,
# which is the path every other language takes — insights hands over the
# registry's English name.
#
# This was ten entries, one per Nepali language, spelling out "Devanagari
# script" so a model would not answer a Maithili request in Latin. Nine of
# those languages are no longer offered, so their entries named a code nothing
# can request.
LANGUAGE_NAME = {
    "en": "English",
    "ne": "Nepali (Devanagari script)",
}

SYSTEM_PROMPT = """You are the wire editor for Ancoda Atlas, a Nepal natural-hazard monitoring desk, writing a short brief on the Rasuwa-Bhotekoshi flood.

Your readers are affected families, volunteers and responders. Write plainly.

Absolute rules:
- Use ONLY the headlines given to you. Never add a fact, number, place or name that is not in them.
- Never invent or estimate casualty, damage or displacement figures. If the headlines disagree on a number, say that they disagree.
- Attribute anything contested to the outlet that reported it.
- No speculation about what will happen next, and no advice beyond what the headlines state.
- If the headlines are thin or repetitive, write a short brief saying so. Do not pad.

Return STRICT JSON and nothing else, in this shape:
{"headline": "under 80 characters", "summary": "two or three sentences", "bullets": ["short point", "short point"]}
Use at most 4 bullets. Each bullet is one clause, under 120 characters."""

TRANSLATE_PROMPT = """You are a translator for Ancoda Atlas, a Nepal natural-hazard monitoring desk.

You translate. You do not write, summarise, shorten, expand or comment.

Absolute rules:
- Translate every field into the target language and nothing else.
- Keep every number, date, place name and outlet name exactly as given. Do not convert units or numerals.
- Keep the same number of bullets, in the same order. Never merge, drop or add one.
- If a phrase has no natural equivalent, transliterate it rather than replacing it with something else.

Return STRICT JSON and nothing else, in the shape you were given:
{"headline": "...", "summary": "...", "bullets": ["...", "..."]}"""


def _build_user_prompt(
    items: list[dict[str, Any]], lang: str, window_label: str, language_name: str | None
) -> str:
    lines = "\n".join(
        f"{i + 1}. [{item['source']}] {item['title']}" for i, item in enumerate(items)
    )
    target = LANGUAGE_NAME.get(lang) or language_name or "English"
    return (
        f"Window: {window_label}\n"
        f"Headlines that arrived in this window ({len(items)}):\n\n"
        f"{lines}\n\n"
        f"Write the brief in {target}. Every field of the JSON must be in that "
        "language. Return only the JSON object."
    )


def extract_json(text: str | None) -> dict[str, Any] | None:
    """Pull the first JSON object out of a response that may be fenced."""
    if not text:
        return None
    unfenced = re.sub(r"^```(?:json)?\s*", "", text)
    unfenced = re.sub(r"```\s*$", "", unfenced)
    start = unfenced.find("{")
    end = unfenced.rfind("}")
    if start == -1 or end <= start:
        return None
    try:
        parsed = jsonlib.loads(unfenced[start : end + 1])
    except ValueError:
        return None
    return parsed if isinstance(parsed, dict) else None


def clean(value: Any, max_len: int) -> str:
    if not isinstance(value, str):
        return ""
    trimmed = re.sub(r"\s+", " ", value.strip())
    return f"{trimmed[: max_len - 1]}…" if len(trimmed) > max_len else trimmed


_DEDUPE_STRIP = re.compile(r"[^a-z0-9ऀ-ॿ ]")


def _extractive_draft(items: list[dict[str, Any]], lang: str) -> dict[str, Any]:
    """The strongest headline, plus the distinct ones under it.

    No claim is made that Atlas did not receive verbatim.
    """
    ne = lang == "ne"
    sources = list(dict.fromkeys(i["source"] for i in items))

    seen: set[str] = set()
    bullets: list[str] = []
    for item in items:
        # Near-duplicate syndicated copy is the norm on a wire; key on the
        # opening words so the same story from six outlets does not fill it.
        key = " ".join(_DEDUPE_STRIP.sub("", item["title"].lower()).split(" ")[:6])
        if key in seen:
            continue
        seen.add(key)
        bullets.append(clean(f"{item['title']} — {item['source']}", 120))
        if len(bullets) == 4:
            break

    headline = clean(
        items[0]["title"] if items else ("नयाँ समाचार" if ne else "New reporting"), 80
    )
    # Two claims are withheld on purpose. Nothing about the window's length —
    # the stored digests really are ten minutes wide while the overview brief
    # covers a whole day, and one wording cannot be true of both. And nothing
    # about the headlines being verbatim, because this draft may be translated
    # downstream; what stays true either way is that no model wrote it.
    summary = (
        f"{len(sources)} स्रोतबाट {len(items)} समाचार, तल सूचीबद्ध। "
        "यो संक्षेप कुनै मोडेलले लेखेको होइन।"
        if ne
        else f"{len(items)} reports from {len(sources)} outlets, listed below. "
        "No model wrote this brief."
    )
    return {"headline": headline, "summary": summary, "bullets": bullets}


def extractive_digest(items: list[dict[str, Any]], lang: str) -> dict[str, Any]:
    """A digest with no model in it. This is the whole brief for the overview."""
    if not items:
        return {
            "headline": "नयाँ समाचार छैन" if lang == "ne" else "No new reporting",
            "summary": (
                "यस अवधिमा कुनै नयाँ समाचार आएन।"
                if lang == "ne"
                else "No new reporting arrived in this window."
            ),
            "bullets": [],
        }
    return _extractive_draft(items, lang)


def detect_digest_language(draft: dict[str, Any]) -> str:
    """Which of the two wire languages an extractive draft is actually in.

    Headlines arrive in Nepali and English regardless of the label passed to
    extractive_digest — that label only chooses its boilerplate. The script in
    the actual text is the honest fallback when translation fails.
    """
    body = " ".join([draft.get("headline") or "", *(draft.get("bullets") or [])])
    return "ne" if DEVANAGARI.search(body) else "en"


def resolve_digest_language(
    draft: dict[str, Any], requested_lang: str, translated: bool
) -> str:
    """The language the caller may truthfully put on the returned draft."""
    return requested_lang if translated else detect_digest_language(draft)


def _cleaned_fields(draft: dict[str, Any]) -> list[str]:
    """The brief as the list of strings a translation has to change."""
    return [
        clean(draft.get("headline"), 80),
        clean(draft.get("summary"), 600),
        *[b for b in (clean(x, 160) for x in (draft.get("bullets") or [])) if b],
    ]


# A real translation of a Nepali brief into French changes every line. A model
# that echoes changes none. Between them sit the answers that actually caused
# trouble: himalaya-gemma-4-q8 rewording one field and handing back the other
# five in Nepali, which byte-equality on the whole brief does not catch.
ECHO_RATIO = 0.5


def is_echo(candidate: dict[str, Any], draft: dict[str, Any]) -> bool:
    """Whether the model mostly handed the brief back instead of translating it.

    Some hosts answer a translation prompt with the input verbatim. The shape
    is perfect, so the bullet-count check passes and the brief ships labelled
    as the reader's language while still being in Nepali — a French reader is
    told they are reading French and shown Devanagari. That is exactly what
    `needs_translation` guards on the way in, and nothing guarded on the way
    out.

    Not hypothetical, and not always total: Tarka's `himalaya-q8` and
    `himalaya-bf16` echo byte for byte, while `himalaya-gemma-4-q8` sometimes
    returns four of five lines unchanged. So this counts unchanged lines rather
    than comparing the brief as a whole — more than half untouched is not a
    translation.

    What it cannot catch is a model that paraphrases into the *wrong* language:
    a "Maithili" brief that is really reworded Nepali reads as fully changed.
    Between two Devanagari languages that close, no cheap check settles it, and
    the honest answer is that the label is only as good as the model.
    """
    source = _cleaned_fields(draft)
    target = [candidate["headline"], candidate["summary"], *candidate["bullets"]]
    if not source:
        return False
    unchanged = sum(1 for a, b in zip(target, source) if a == b)
    return unchanged / len(source) > ECHO_RATIO


# Small hosted models drop a bullet or hand the brief back unchanged often
# enough that one attempt is not a fair test of whether they can translate at
# all. Measured against Tarka's himalaya-gemma-4-q8 on a live 18-item flood
# brief, six attempts per language came back:
#
#   Japanese  5 good, 1 malformed        French    3 good, 3 malformed
#   Maithili  2 good, 4 malformed        English   1 good, 5 echoed
#
# so a single try discards a usable translation about half the time. Two
# bounded attempts, behind the caller's ten-minute cache and its per-language
# lock, cost one extra call per language per cycle at worst.
TRANSLATE_ATTEMPTS = 2


async def _translate_once(
    provider: LLMProvider, draft: dict[str, Any], target: str
) -> dict[str, Any] | None:
    """One attempt. None means it did not produce a usable translation."""
    user = (
        f"Target language: {target}\n\n"
        f"Translate this brief into {target}. Return only the JSON object.\n\n"
        f"{jsonlib.dumps(draft, ensure_ascii=False)}"
    )

    result = await provider.complete(
        TRANSLATE_PROMPT, user, max_tokens=900, timeout=45.0, json=True
    )
    parsed = extract_json(result.text) or {}
    headline = clean(parsed.get("headline"), 80)
    summary = clean(parsed.get("summary"), 600)
    raw_bullets = parsed.get("bullets")
    bullets = (
        [b for b in (clean(x, 160) for x in raw_bullets) if b]
        if isinstance(raw_bullets, list)
        else []
    )

    # A translation that lost or gained a point is not a translation.
    if not (headline and summary and len(bullets) == len(draft.get("bullets") or [])):
        log.warning("digest_translation_incomplete", model=provider.model)
        return None

    candidate = {"headline": headline, "summary": summary, "bullets": bullets}
    if is_echo(candidate, draft):
        log.warning("digest_translation_echoed", model=provider.model)
        return None
    return candidate


async def translate_digest(
    provider: LLMProvider | None,
    draft: dict[str, Any],
    lang: str,
    language_name: str | None = None,
) -> dict[str, Any]:
    """Translate a finished draft, leaving what it says alone.

    A failed call leaves the original standing rather than producing nothing,
    and the caller is told which happened — a headline is no longer verbatim
    once it has been through a model, and the reader is entitled to know that.

    Retried up to TRANSLATE_ATTEMPTS times, because these models fail by
    returning something unusable rather than by erroring. What is never
    retried is the honesty: when every attempt fails the original stands,
    labelled as the language it is actually written in.
    """
    if not provider or not provider.is_configured:
        return {"draft": draft, "model": None, "translated": False}

    target = LANGUAGE_NAME.get(lang) or language_name or "English"

    for attempt in range(1, TRANSLATE_ATTEMPTS + 1):
        try:
            candidate = await _translate_once(provider, draft, target)
        except Exception as exc:  # noqa: BLE001
            log.warning("digest_translation_failed", error=str(exc), attempt=attempt)
            continue
        if candidate:
            return {"draft": candidate, "model": provider.name, "translated": True}

    log.warning(
        "digest_translation_gave_up",
        lang=lang,
        attempts=TRANSLATE_ATTEMPTS,
        detail="keeping the original, labelled as the language it is in",
    )
    return {"draft": draft, "model": None, "translated": False}


async def draft_digest(
    provider: LLMProvider | None,
    items: list[dict[str, Any]],
    lang: str,
    window_label: str = "",
    language_name: str | None = None,
) -> dict[str, Any]:
    """Write one digest for one window in one language.

    Falls back to the extractive draft whenever no LLM is configured or the
    model fails, and always reports which of the two produced the text.
    """
    if not items:
        return {
            "draft": {
                "headline": "नयाँ समाचार छैन" if lang == "ne" else "No new reporting",
                "summary": (
                    "यस दस-मिनेटे अवधिमा कुनै नयाँ समाचार आएन।"
                    if lang == "ne"
                    else "No new reporting arrived in this ten-minute window."
                ),
                "bullets": [],
            },
            "generator": "extractive",
            "model": None,
        }

    if provider and provider.is_configured:
        try:
            result = await provider.complete(
                SYSTEM_PROMPT,
                _build_user_prompt(items, lang, window_label, language_name),
                max_tokens=700,
                timeout=45.0,
                json=True,
            )
            parsed = extract_json(result.text) or {}
            headline = clean(parsed.get("headline"), 80)
            summary = clean(parsed.get("summary"), 600)
            if headline and summary:
                raw = parsed.get("bullets")
                bullets = (
                    [b for b in (clean(x, 120) for x in raw) if b][:4]
                    if isinstance(raw, list)
                    else []
                )
                return {
                    "draft": {"headline": headline, "summary": summary, "bullets": bullets},
                    "generator": "llm",
                    "model": provider.name,
                }
            log.warning("digest_response_unusable", detail="falling back to extractive")
        except Exception as exc:  # noqa: BLE001
            log.warning("digest_model_failed", error=str(exc), detail="falling back to extractive")

    return {"draft": _extractive_draft(items, lang), "generator": "extractive", "model": None}
