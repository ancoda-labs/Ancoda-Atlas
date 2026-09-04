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

Indic-script models often rewrite 1259 as ১২৫৯ or १२५९. That is the same
figure in another glyph set, not a changed claim — so both sides are folded to
Western digits before the check, and the served text keeps the desk's own
numerals. Python's ``\\d`` matches Unicode decimals, so comparing raw runs
without that fold would treat source and candidate as unlike.

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

# ASCII digits only — after normalisation, Unicode numeral scripts are gone.
# Do not use ``\\d`` here: it matches Devanagari/Bengali/Arabic-Indic digits
# and would make the source and candidate scans incomparable.
DIGITS = re.compile(r"[0-9]+")

# Common numeral scripts a translator may emit instead of 0-9. Folded back so
# the page shows the same glyphs the desk composed.
_NATIVE_DIGITS = str.maketrans(
    "০১২৩৪৫৬৭৮৯"  # Bengali
    "०१२३४५६७८९"  # Devanagari
    "٠١٢٣٤٥٦٧٨٩"  # Arabic-Indic
    "۰۱۲۳۴۵۶۷۸۹"  # Extended Arabic-Indic (Persian/Urdu)
    "๐๑๒๓๔๕๖๗๘๙",  # Thai
    "0123456789" * 5,
)

TRANSLATE_PROMPT = """You translate one short public-safety notice for Ancoda Atlas, a Nepal natural-hazard monitoring desk.

You translate. You do not answer, expand, summarise, soften or comment.

Absolute rules:
- Translate the whole text into the target language and nothing else.
- Every number, date and place name stays EXACTLY as written in Western digits (0-9). Do not convert numerals to another script (no ১২৩, १२३, ١٢٣), do not add thousands separators, do not round.
- Keep source and organisation names as given: NDRRMA, MoHA, USGS, Open-Meteo, NASA FIRMS, DHM, Nepal Police.
- Keep any refusal a refusal. If the text declines to answer something, the translation declines just as plainly.
- Keep URLs and paths unchanged.

Return STRICT JSON and nothing else: {"text": "..."}"""


def _western_digits(text: str) -> str:
    """Fold native-script numerals back to 0-9; leave everything else alone."""
    return (text or "").translate(_NATIVE_DIGITS)


def _strip_grouping(text: str) -> str:
    """Drop thousands separators inside digit runs (1,259 → 1259)."""
    return re.sub(r"(?<=[0-9]),(?=[0-9]{3}(?:[^0-9]|$))", "", text or "")


def normalize_figures(text: str) -> str:
    """Western digits, no thousands separators — comparable figure runs."""
    return _strip_grouping(_western_digits(text))


def numbers_survived(source: str, candidate: str) -> bool:
    """Whether every figure in the source is still present, unchanged.

    Both sides are normalised first so ১২৫৯ / ١٢٥٩ / ১২৫৯ count as 1259.
    Order is not checked — languages move clauses around — but every distinct
    run of digits has to appear as its own run (so 11114 does not satisfy
    1114), and at least as often as it did in the source.
    """
    from collections import Counter

    src = normalize_figures(source)
    cand = normalize_figures(candidate)
    src_counts = Counter(DIGITS.findall(src))
    cand_counts = Counter(DIGITS.findall(cand))
    for token, n in src_counts.items():
        if cand_counts.get(token, 0) < n:
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
    attempts: int = 3,
) -> dict[str, Any]:
    """Answer in `lang_code`, or the original and the reason it stayed.

    Never raises. Several attempts, because these models fail by returning
    something unusable rather than by erroring — especially by rewriting
    figures into another digit script.
    """
    if not answer.strip():
        return {"answer": answer, "lang": lang_code, "translated": False}
    if not provider or not provider.is_configured:
        return {"answer": answer, "lang": None, "translated": False}

    sample = ", ".join(DIGITS.findall(normalize_figures(answer))[:6]) or "the numbers"
    user = (
        f"Target language: {language_name}\n\n"
        f"Translate this notice into {language_name}. Return only the JSON object.\n\n"
        f"{answer}"
    )
    reinforce = (
        f"\n\nCRITICAL: keep every Western digit exactly as in the source "
        f"(for example {sample}). "
        "Do not use Bengali, Devanagari or Arabic-Indic numerals."
    )

    for attempt in range(1, attempts + 1):
        prompt_user = user if attempt == 1 else user + reinforce
        try:
            result = await provider.complete(
                TRANSLATE_PROMPT,
                prompt_user,
                max_tokens=1800,
                timeout=60.0,
                json=True,
            )
        except Exception as exc:  # noqa: BLE001
            log.warning(
                "ask_translate_failed",
                error=str(exc) or type(exc).__name__,
                attempt=attempt,
            )
            continue

        candidate = _extract(result.text)
        if not candidate:
            log.warning("ask_translate_unusable", lang=lang_code, attempt=attempt)
            continue
        if candidate == answer.strip():
            log.warning("ask_translate_echoed", lang=lang_code, model=provider.model)
            continue

        # Same figure in another digit script or with grouping → Western digits
        # the desk composed, then re-check. A changed or missing figure fails.
        normalised = normalize_figures(candidate)
        if numbers_survived(answer, normalised):
            return {"answer": normalised, "lang": lang_code, "translated": True}

        log.warning(
            "ask_translate_lost_a_number",
            lang=lang_code,
            model=provider.model,
            attempt=attempt,
            detail="keeping the original rather than shipping a changed figure",
        )

    return {"answer": answer, "lang": None, "translated": False}
