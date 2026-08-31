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
from app.domains.ai.ask.policy import classify_intent, is_refusal
from app.domains.ai.ask.rate_limit import (
    can_spend,
    max_output_tokens,
    record_turn,
    remaining_for,
)
from app.domains.ai.ask.tools import execute_tools, tools_for_intent
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


async def run_ask_turn(
    question: str,
    lang: str,
    client_key: str,
    snapshot: dict[str, Any],
    use_model: bool = True,
) -> dict[str, Any]:
    lang = "ne" if lang == "ne" else "en"
    intent = classify_intent(question)
    tools = tools_for_intent(intent, question)
    view = view_for_intent(intent, snapshot, question)
    left = remaining_for(client_key)

    base = {
        "lang": lang,
        "view": view,
        "tools": tools,
        "citations": citations_from_snap(snapshot),
        "remaining": {"hour": left.hour, "globalHour": left.globalHour},
        "usage": {"inputTokens": 0, "outputTokens": 0},
    }

    # Refusals come first, and cost nothing.
    if is_refusal(intent):
        return {
            **base,
            "kind": "ok",
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
