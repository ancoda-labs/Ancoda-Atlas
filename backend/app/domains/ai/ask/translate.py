"""Carrying one composed answer into the reader's language.

The news brief translates headlines it did not write. This translates a
sentence the desk composed, which is a different risk: the brief's guard is
that a lost or invented bullet can be counted, and there are no bullets here.

So the guard is the numbers. Every run of digits in the English answer must
survive into the translation, unchanged. A death toll that arrives as 1,114 or
11114 or vanishes is not a translation of "1114 deaths", and on this desk that
is the one error worth failing the whole attempt over — a reader cannot check
it, and a wrong figure in their own language reads exactly as true as a right
one.

When anything fails the answer is served in the language it was composed in,
with `fellBackFrom` naming what was asked for. Same contract as the brief: a
language the model cannot write degrades visibly rather than silently.
"""

import json as jsonlib
import re
from typing import Any

from app.core.logging import get_logger
from app.domains.ai.providers.base import LLMProvider

log = get_logger(__name__)

# Runs of Western digits. The composed answers are built from the desk's own
# figures, which are always written this way.
DIGITS = re.compile(r"\d+")

TRANSLATE_PROMPT = """You translate one short public-safety notice for Ancoda Atlas, a Nepal natural-hazard monitoring desk.

You translate. You do not answer, expand, summarise, soften or comment.

Absolute rules:
- Translate the whole text into the target language and nothing else.
- Every number, date and place name stays EXACTLY as written. Do not convert numerals to another script, do not add thousands separators, do not round.
- Keep source and organisation names as given: NDRRMA, MoHA, USGS, Open-Meteo, NASA FIRMS, DHM, Nepal Police.
- Keep any refusal a refusal. If the text declines to answer something, the translation declines just as plainly.
- Keep URLs and paths unchanged.

Return STRICT JSON and nothing else: {"text": "..."}"""


def numbers_survived(source: str, candidate: str) -> bool:
    """Whether every figure in the source is still present, unchanged.

    Order is not checked — languages move clauses around — but every distinct
    run of digits has to appear, and appear at least as often as it did.
    """
    for token in set(DIGITS.findall(source)):
        if candidate.count(token) < source.count(token):
            return False
    return True


def _extract(text: str | None) -> str:
    if not text:
        return ""
    stripped = re.sub(r"^```(?:json)?\s*", "", text.strip())
    stripped = re.sub(r"```\s*$", "", stripped)
    start, end = stripped.find("{"), stripped.rfind("}")
    if start == -1 or end <= start:
        return ""
    try:
        parsed = jsonlib.loads(stripped[start : end + 1])
    except ValueError:
        return ""
    value = parsed.get("text") if isinstance(parsed, dict) else None
    return value.strip() if isinstance(value, str) else ""


async def translate_answer(
    provider: LLMProvider | None,
    answer: str,
    lang_code: str,
    language_name: str,
    *,
    attempts: int = 2,
) -> dict[str, Any]:
    """Answer in `lang_code`, or the original and the reason it stayed.

    Never raises. Two attempts, because these models fail by returning
    something unusable rather than by erroring.
    """
    if not answer.strip():
        return {"answer": answer, "lang": lang_code, "translated": False}
    if not provider or not provider.is_configured:
        return {"answer": answer, "lang": None, "translated": False}

    user = (
        f"Target language: {language_name}\n\n"
        f"Translate this notice into {language_name}. Return only the JSON object.\n\n"
        f"{answer}"
    )

    for attempt in range(1, attempts + 1):
        try:
            result = await provider.complete(
                TRANSLATE_PROMPT, user, max_tokens=900, timeout=30.0, json=True
            )
        except Exception as exc:  # noqa: BLE001
            log.warning("ask_translate_failed", error=str(exc), attempt=attempt)
            continue

        candidate = _extract(result.text)
        if not candidate:
            log.warning("ask_translate_unusable", lang=lang_code, attempt=attempt)
            continue
        if candidate == answer.strip():
            log.warning("ask_translate_echoed", lang=lang_code, model=provider.model)
            continue
        if not numbers_survived(answer, candidate):
            # The whole reason this check exists. Serving the English figure is
            # worse reading and a truer statement.
            log.warning(
                "ask_translate_lost_a_number",
                lang=lang_code,
                model=provider.model,
                detail="keeping the original rather than shipping a changed figure",
            )
            continue
        return {"answer": candidate, "lang": lang_code, "translated": True}

    return {"answer": answer, "lang": None, "translated": False}
