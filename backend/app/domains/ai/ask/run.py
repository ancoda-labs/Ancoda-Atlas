"""One sandbox turn.

The order of the guards is the design. A refusal is decided before a model is
consulted, before the budget is checked, and before any data is assembled — so
"will the lake burst again" is refused identically whether or not a model is
configured, in credit, or reachable.
"""

from typing import Any

from app.core.config import settings
from app.core.logging import get_logger
from app.domains.ai.ask.compose import (
    citations_from_snap,
    parse_model_json,
    refusal_answer,
    system_prompt,
    template_answer,
    validate_view,
    view_for_intent,
    wrap_tool_data,
)
from app.domains.ai.ask.live import refresh_for_intent
from app.domains.ai.ask.policy import classify_intent, is_refusal
from app.domains.ai.ask.rate_limit import (
    can_spend,
    max_output_tokens,
    record_turn,
    remaining_for,
)
from app.domains.ai.ask.tools import execute_tools, tools_for_intent
from app.domains.ai.ask.translate import translate_answer
from app.domains.ai.languages import find_language, is_wire_language
from app.domains.ai.providers.openai_family import TarkaProvider

log = get_logger(__name__)

DEFAULT_MODEL = "himalaya-gemma-4-bf16"


def _tarka() -> TarkaProvider | None:
    """The sandbox runs on Tarka specifically, not the desk's configured provider.

    It is a self-hosted gateway, which is what makes an open text box on a
    public-safety site affordable to leave running.
    """
    if not settings.LLM_API_KEY:
        return None
    return TarkaProvider(
        api_key=settings.LLM_API_KEY,
        model=settings.LLM_MODEL or DEFAULT_MODEL,
        base_url=settings.LLM_BASE_URL or None,
    )


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
    use_model: bool = True,
) -> dict[str, Any]:
    # The box composes in the two languages it has templates for, and carries
    # the finished sentence into any of the ~100 the picker offers. Composing
    # directly in a third would mean a model writing a disaster answer rather
    # than restating one, which is the line this desk does not cross.
    requested = find_language(lang)
    compose_lang = "ne" if requested.code == "ne" else "en"
    lang = compose_lang
    intent = classify_intent(question)

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
        "lang": lang,
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
    }

    # Refusals come first, and cost nothing.
    if is_refusal(intent):
        return {
            **base,
            # Was "ok", which made a refusal indistinguishable from an answer.
            # The contract has always declared "refused"; nothing ever sent it.
            "kind": "refused",
            "answer": refusal_answer(intent, lang, snapshot),
            "model": None,
            "usedModel": False,
        }

    tool_results = execute_tools(tools, snapshot)
    fallback = template_answer(intent, snapshot, lang, question)

    provider = _tarka() if use_model else None
    if not provider or not provider.is_configured:
        return {**base, "kind": "ok", "answer": fallback, "model": None, "usedModel": False}

    if not can_spend(client_key):
        note = (
            "(टोकन सीमा — मोडेल यो घण्टा सकियो। चिप र तथ्यांक अझै काम गर्छन्।)"
            if lang == "ne"
            else "(Token limit — the model is paused for this hour. Chips and desk "
            "figures still work.)"
        )
        return {
            **base,
            "kind": "quota",
            "answer": f"{fallback}\n\n{note}",
            "model": None,
            "usedModel": False,
        }

    try:
        user = "\n\n".join(
            [
                f"Question ({lang}): {question[:500]}",
                wrap_tool_data(tool_results),
                f"Suggested view (already validated): {view}",
            ]
        )
        result = await provider.complete(
            system_prompt(), user, max_tokens=max_output_tokens(), timeout=45.0, json=True
        )
        record_turn(client_key, result.usage.output_tokens)

        parsed = parse_model_json(result.text)
        # Re-validated after the model returns: a view it invented is dropped
        # rather than forwarded to the map.
        model_view = validate_view(parsed.get("view")) if parsed else None
        left = remaining_for(client_key)
        return {
            **base,
            "kind": "ok",
            "answer": (parsed or {}).get("answer") or fallback,
            "view": model_view or view,
            "model": result.model or settings.LLM_MODEL or "tarka",
            "usedModel": True,
            "usage": {
                "inputTokens": result.usage.input_tokens,
                "outputTokens": result.usage.output_tokens,
            },
            "remaining": {"hour": left.hour, "globalHour": left.globalHour},
        }
    except Exception as exc:  # noqa: BLE001
        log.warning("ask_sandbox_model_failed", error=str(exc))
        return {
            **base,
            "kind": "ok",
            "answer": f"{fallback}\n\n(Model unavailable — showing the desk figures directly.)",
            "model": None,
            "usedModel": False,
        }


async def run_ask_turn(
    question: str,
    lang: str,
    client_key: str,
    snapshot: dict[str, Any],
    use_model: bool = True,
) -> dict[str, Any]:
    """Compose the turn, then carry it into the reader's language.

    The translation wraps every branch rather than sitting inside them. There
    are five ways out of _compose_turn — refusal, no model, quota, model, model
    failure — and a refusal that stayed in English because someone added a
    sixth would be the worst of them to miss: a reader who cannot read the
    refusal is a reader who does not know they were refused.
    """
    turn = await _compose_turn(question, lang, client_key, snapshot, use_model)
    requested = find_language(lang)

    # Composed languages need no carrying, and the extractive answer is already
    # written in one of them.
    if is_wire_language(requested.code):
        return {**turn, "lang": requested.code, "fellBackFrom": None}

    provider = _tarka() if use_model else None
    result = await translate_answer(
        provider, turn.get("answer") or "", requested.code, requested.english
    )
    return {
        **turn,
        "answer": result["answer"],
        "lang": result["lang"] or turn.get("lang") or "en",
        "translated": result["translated"],
        # Named so the panel can say which language it could not write, rather
        # than labelling English as Amharic.
        "fellBackFrom": None if result["translated"] else requested.code,
    }
