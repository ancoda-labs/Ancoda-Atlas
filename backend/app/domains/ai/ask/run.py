"""One sandbox turn.

The order of the guards is the design. A refusal is decided before any data is
assembled and before a carry into another language — so "will the lake burst
again" is refused identically whether or not a model is configured, in credit,
or reachable.

Compose is deterministic: every intent answers from a desk template. The model
is only used to carry that prose into a picker language the templates do not
cover. That is why answers stay fast and why every figure stays checkable.
"""

from typing import Any

from app.core.config import settings
from app.core.logging import get_logger
from app.domains.ai.ask.compose import (
    citations_from_snap,
    refusal_answer,
    template_answer,
    view_for_intent,
)
from app.domains.ai.ask.guard import scrub_text
from app.domains.ai.ask.live import refresh_for_intent
from app.domains.ai.ask.policy import REFUSAL_INTENTS, classify_intent, is_refusal
from app.domains.ai.ask.rate_limit import can_spend, record_turn, remaining_for
from app.domains.ai.ask.tools import tools_for_intent
from app.domains.ai.ask.translate import translate_answer
from app.domains.ai.languages import find_language
from app.domains.ai.providers.openai_family import TarkaProvider

log = get_logger(__name__)

DEFAULT_MODEL = "himalaya-gemma-4-bf16"
MAX_HISTORY_TURNS = 6


def _tarka() -> TarkaProvider | None:
    """The sandbox runs on Tarka specifically, not the desk's configured provider.

    It is a self-hosted gateway, which is what makes an open text box on a
    public-safety site affordable to leave running. Used only to carry a
    composed answer into another language — never to invent figures.
    """
    if not settings.LLM_API_KEY:
        return None
    return TarkaProvider(
        api_key=settings.LLM_API_KEY,
        model=settings.LLM_MODEL or DEFAULT_MODEL,
        base_url=settings.LLM_BASE_URL or None,
        reasoning_effort=settings.LLM_REASONING_EFFORT or "low",
    )


def tarka_provider() -> TarkaProvider | None:
    """Public wrapper — the retranslate route needs the same gateway."""
    return _tarka()


def sandbox_status(client_key: str) -> dict[str, Any]:
    provider = _tarka()
    configured = bool(provider and provider.is_configured)
    left = remaining_for(client_key)
    return {
        "sandbox": True,
        "tarka": configured,
        "model": (settings.LLM_MODEL or DEFAULT_MODEL) if configured else None,
        "remaining": {"hour": left.hour, "globalHour": left.globalHour},
    }


def _recent_history(history: Any) -> list[dict[str, str]]:
    """The reader's own prior turns, scrubbed and capped.

    Tolerate garbage from the client: keep only well-shaped user/assistant
    rows with non-empty text, take the last six, and scrub each — this is
    untrusted text coming back from a browser that can send anything.
    """
    if not isinstance(history, list):
        return []
    cleaned: list[dict[str, str]] = []
    for item in history:
        if not isinstance(item, dict):
            continue
        role = item.get("role")
        text = item.get("text")
        if role not in ("user", "assistant") or not isinstance(text, str):
            continue
        trimmed = text.strip()
        if not trimmed:
            continue
        cleaned.append({"role": role, "text": scrub_text(trimmed, limit=400)})
    return cleaned[-MAX_HISTORY_TURNS:]


def _classify_with_context(question: str, history: list[dict[str, str]]) -> str:
    """Classify this question; only borrow prior user text for bare follow-ups.

    Do not ask a model to rewrite the follow-up — that would put a model
    upstream of the refusals. A refusal reached only by borrowing context is
    not this question being refused, so it falls back to `other`.

    Name lookups return immediately: after "how many rescued?" a follow-up
    "search for इन्द्रबहादुर थापा" must not inherit `rescued`.
    """
    intent = classify_intent(question)
    if intent == "rescue_person":
        return intent
    if intent != "other" or not history:
        return intent
    prior_user = next(
        (t["text"] for t in reversed(history) if t["role"] == "user"),
        None,
    )
    if not prior_user:
        return intent
    widened = classify_intent(f"{prior_user}\n{question}")
    if widened in REFUSAL_INTENTS:
        return "other"
    return widened


def _as_of_epoch(intent: str, snapshot: dict[str, Any]) -> float | None:
    """When the desk last collected the thing this intent answers from."""
    from datetime import datetime

    key = (
        "registerFetchedAt"
        if intent in ("rescued", "nationality")
        else "sitrepAsOf"
    )
    raw = snapshot.get(key)
    if not isinstance(raw, str) or not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).timestamp()
    except ValueError:
        # The sitrep carries a Bikram Sambat label in places, which is not a
        # timestamp. Unparseable reads as stale, and the cooldown stops that
        # from becoming a request per question.
        return None


def _merge_live(snapshot: dict[str, Any], live: dict[str, Any]) -> dict[str, Any]:
    """Fold a fresh collector result into the snapshot for this turn only.

    Nothing is written back to runs/. The worker owns that file, and an API
    process writing it is the one thing the split exists to prevent.
    """
    if live.get("topic") != "register":
        return snapshot
    count = (live.get("data") or {}).get("count")
    if not isinstance(count, int):
        return snapshot
    from datetime import datetime, timezone

    stamped = datetime.fromtimestamp(live["fetchedAt"], timezone.utc).isoformat()
    return {**snapshot, "registerTotal": count, "registerFetchedAt": stamped}


async def _compose_turn(
    question: str,
    lang: str,
    client_key: str,
    snapshot: dict[str, Any],
    history: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    # The box composes in the two languages it has templates for, and carries
    # the finished sentence into any of the ~100 the picker offers. Composing
    # directly in a third would mean a model writing a disaster answer rather
    # than restating one, which is the line this desk does not cross.
    requested = find_language(lang)
    compose_lang = "ne" if requested.code == "ne" else "en"
    prior = history or []
    intent = _classify_with_context(question, prior)

    # If the desk's copy is stale, refresh the one collector this intent needs
    # before answering. Bounded and allowlisted — see live.py for why this is
    # the single place the API is allowed to reach a portal on a request.
    live = None
    if not is_refusal(intent):
        live = await refresh_for_intent(intent, _as_of_epoch(intent, snapshot))
        if live:
            snapshot = _merge_live(snapshot, live)

    tools = tools_for_intent(intent, question)
    view = view_for_intent(intent, snapshot, question)
    left = remaining_for(client_key)

    base = {
        "lang": compose_lang,
        # The classifier's verdict, so a caller can tell a refusal from an
        # answer without string-matching the prose.
        "intent": intent,
        "view": view,
        "tools": tools,
        "citations": citations_from_snap(snapshot),
        # True when this turn refreshed a source rather than reading the sweep.
        "liveRefresh": bool(live),
        "requestedLang": requested.code,
        "remaining": {"hour": left.hour, "globalHour": left.globalHour},
        "usage": {"inputTokens": 0, "outputTokens": 0},
        "model": None,
        "usedModel": False,
    }

    if is_refusal(intent):
        composed = refusal_answer(intent, compose_lang, snapshot)
    else:
        composed = template_answer(intent, snapshot, compose_lang, question)

    return {
        **base,
        "kind": "refused" if is_refusal(intent) else "ok",
        "answer": composed.text,
        "sourceLang": composed.lang,
        "lang": composed.lang,
    }


async def run_ask_turn(
    question: str,
    lang: str,
    client_key: str,
    snapshot: dict[str, Any],
    use_model: bool = True,
    history: Any = None,
) -> dict[str, Any]:
    """Compose the turn, then carry it into the reader's language.

    The translation wraps every branch rather than sitting inside them. A
    refusal that stayed in English because someone skipped the carry would be
    the worst miss: a reader who cannot read the refusal does not know they
    were refused.
    """
    recent = _recent_history(history)
    turn = await _compose_turn(
        question, lang, client_key, snapshot, history=recent
    )
    requested = find_language(lang)
    composed = turn.get("answer") or ""
    source_lang = turn.get("sourceLang") or turn.get("lang") or "en"

    # Declared frame language — never sniffed from interpolated headlines.
    if source_lang == requested.code:
        return {
            **turn,
            "lang": requested.code,
            "source": composed,
            "sourceLang": source_lang,
            "fellBackFrom": None,
            "translated": False,
        }

    provider = _tarka() if use_model else None
    if not provider or not provider.is_configured:
        return {
            **turn,
            "answer": composed,
            "source": composed,
            "sourceLang": source_lang,
            "lang": source_lang,
            "translated": False,
            "fellBackFrom": requested.code,
        }

    if not can_spend(client_key):
        left = remaining_for(client_key)
        return {
            **turn,
            "kind": "quota",
            "answer": composed,
            "source": composed,
            "sourceLang": source_lang,
            "lang": source_lang,
            "translated": False,
            "fellBackFrom": requested.code,
            "remaining": {"hour": left.hour, "globalHour": left.globalHour},
        }

    result = await translate_answer(
        provider, composed, requested.code, requested.english
    )
    # Translation is the only model spend per ask — count it whether or not
    # the carry succeeded, because the tokens were used either way.
    record_turn(client_key, 0)
    left = remaining_for(client_key)
    translated = bool(result["translated"])
    return {
        **turn,
        "kind": turn.get("kind") or "ok",
        "answer": result["answer"],
        "source": composed,
        "sourceLang": source_lang,
        "lang": result["lang"] or source_lang,
        "translated": translated,
        "usedModel": translated,
        "model": (settings.LLM_MODEL or DEFAULT_MODEL) if translated else None,
        "fellBackFrom": None if translated else requested.code,
        "remaining": {"hour": left.hour, "globalHour": left.globalHour},
    }
