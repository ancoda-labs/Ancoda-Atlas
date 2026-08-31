"""The AI surface: the flood insight, and the ask sandbox."""

from typing import Any

from fastapi import APIRouter, Header, Response

from app.core.http_cache import cache_for, no_store
from app.core.logging import get_logger
from app.domains.ai.ask.rate_limit import hash_client
from app.domains.ai.ask.run import run_ask_turn, sandbox_status
from app.domains.ai.ask.tools import build_snapshot
from app.domains.ai.insights import CACHE_TTL_S, get_insight

log = get_logger(__name__)

router = APIRouter(tags=["ai"])


def _client_ip(forwarded: str | None, real: str | None) -> str:
    if forwarded:
        return forwarded.split(",")[0].strip()
    return real or "unknown"


@router.get("/flood/insights", summary="The overview brief, in a chosen language")
async def flood_insights(response: Response, lang: str = "ne") -> dict[str, Any]:
    data = await get_insight(lang)
    if data.get("insight"):
        cache_for(response, edge=CACHE_TTL_S)
    else:
        # "No reporting" is a passing state. Cached, it would hold an empty
        # panel for ten minutes after the wire came back.
        no_store(response)
    return data


def _snapshot() -> dict[str, Any]:
    from app.domains.flood import service as flood_service

    store = flood_service.get_store()
    payload = flood_service.desk_payload()
    return build_snapshot(
        content=payload,
        sitrep=payload.get("sitrep"),
        gauges=(payload.get("river") or {}).get("gauges") or [],
        news=store.get("news") or [],
    )


@router.get("/sandbox/ask", summary="Sandbox status and remaining budget")
async def ask_status(
    response: Response,
    x_forwarded_for: str | None = Header(None),
    x_real_ip: str | None = Header(None),
) -> dict[str, Any]:
    no_store(response)
    return sandbox_status(hash_client(_client_ip(x_forwarded_for, x_real_ip)))


@router.post("/sandbox/ask", summary="Ask one question of the desk")
async def ask(
    response: Response,
    payload: dict[str, Any],
    x_forwarded_for: str | None = Header(None),
    x_real_ip: str | None = Header(None),
) -> dict[str, Any]:
    """An experiment, and labelled as one.

    It can only restate what is already on the desk. It will not search for a
    person, will not advise anyone to stay or leave, and will not predict — and
    those three refusals are decided before a model is consulted at all.
    """
    question = payload.get("question")
    if not isinstance(question, str) or not question.strip():
        response.status_code = 400
        return {"error": "question_required"}

    client_key = hash_client(_client_ip(x_forwarded_for, x_real_ip))
    no_store(response)
    try:
        return await run_ask_turn(
            question=question,
            lang=payload.get("lang") or "en",
            client_key=client_key,
            snapshot=_snapshot(),
            use_model=payload.get("useModel") is not False,
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("ask_turn_failed", error=str(exc))
        response.status_code = 503
        return {"error": "unavailable"}
