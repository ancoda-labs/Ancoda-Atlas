"""Reading the climate snapshot.

The API never fetches Our World in Data or BIPAD on the request path. It reads
what the weekly task wrote under runs/, lays the reviewed glacier/GLOF facts
beside it, and matches ministry posts already ingested on the flood desk.
"""

from typing import Any

from app.core import runs_store
from app.core.http import now_iso
from app.domains.climate.content import load_source_facts, match_statements, public_facts
from app.domains.climate.sources.bipad_arrived import SOURCE as ARRIVED_SOURCE
from app.domains.climate.sources.bipad_arrived import empty_arrived
from app.domains.climate.sources.owid_co2 import DEFAULT_METRIC, SOURCE

EMPTY_EMISSIONS: dict[str, Any] = {
    "year": None,
    "defaultMetric": DEFAULT_METRIC,
    "metrics": {},
    "error": "awaiting_first_cycle",
    "stale": True,
    "source": SOURCE,
    "fetchedAt": None,
    "lastAttemptAt": None,
}

FLAGGED_OFF = ("heat", "water", "air", "fire")


def load_emissions() -> dict[str, Any] | None:
    parsed = runs_store.read_json(runs_store.CLIMATE)
    return parsed if isinstance(parsed, dict) else None


def persist_emissions(payload: dict[str, Any]) -> bool:
    return runs_store.write_json(runs_store.CLIMATE, payload)


def load_arrived() -> dict[str, Any] | None:
    parsed = runs_store.read_json(runs_store.CLIMATE_ARRIVED)
    return parsed if isinstance(parsed, dict) else None


def persist_arrived(payload: dict[str, Any]) -> bool:
    return runs_store.write_json(runs_store.CLIMATE_ARRIVED, payload)


def keep_last_good(previous: dict[str, Any], error: str) -> dict[str, Any]:
    """Last good figures, marked stale. Never substitutes a number."""
    return {
        **previous,
        "error": error,
        "stale": True,
        "lastAttemptAt": now_iso(),
    }


def _emissions_view(emissions: dict[str, Any] | None) -> dict[str, Any]:
    metrics = emissions.get("metrics") if isinstance(emissions, dict) else None
    if not emissions or not isinstance(metrics, dict) or not metrics:
        return {**EMPTY_EMISSIONS, "lastAttemptAt": now_iso()}
    return {
        "year": emissions.get("year"),
        "defaultMetric": emissions.get("defaultMetric") or DEFAULT_METRIC,
        "metrics": metrics,
        "error": emissions.get("error"),
        "stale": bool(emissions.get("stale")),
        "source": emissions.get("source") or SOURCE,
        "fetchedAt": emissions.get("fetchedAt"),
        "lastAttemptAt": emissions.get("lastAttemptAt"),
    }


def _arrived_view(arrived: dict[str, Any] | None) -> dict[str, Any]:
    hazards = arrived.get("hazards") if isinstance(arrived, dict) else None
    if not arrived or not isinstance(hazards, list):
        return empty_arrived("awaiting_first_cycle")
    return {
        "years": arrived.get("years") or [],
        "hazards": hazards,
        "windowStart": arrived.get("windowStart"),
        "windowEnd": arrived.get("windowEnd"),
        "truncated": bool(arrived.get("truncated")),
        "error": arrived.get("error"),
        "stale": bool(arrived.get("stale")),
        "source": arrived.get("source") or ARRIVED_SOURCE,
        "fetchedAt": arrived.get("fetchedAt"),
        "lastAttemptAt": arrived.get("lastAttemptAt"),
    }


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _panels(facts_file: dict[str, Any]) -> dict[str, Any]:
    raw = _as_dict(facts_file.get("panels"))
    out: dict[str, Any] = {}
    for key in FLAGGED_OFF:
        item = _as_dict(raw.get(key))
        out[key] = {
            "enabled": False,
            "todo": item.get("todo"),
        }
    return out


def _section(facts_file: dict[str, Any]) -> dict[str, Any]:
    raw = _as_dict(facts_file.get("section"))
    return {
        "titleEn": raw.get("title_en"),
        "titleNe": raw.get("title_ne"),
        "standfirstEn": raw.get("standfirst_en"),
        "standfirstNe": raw.get("standfirst_ne"),
        "ice": _camel_block(raw.get("ice")),
        "lakes": _camel_block(raw.get("lakes")),
        "arrived": _camel_block(raw.get("arrived")),
        "cause": _camel_block(raw.get("cause")),
        "news": _camel_block(raw.get("news")),
    }


def _camel_block(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    mapping = {
        "headline_en": "headlineEn",
        "headline_ne": "headlineNe",
        "caption_en": "captionEn",
        "caption_ne": "captionNe",
        "truncated_en": "truncatedEn",
        "truncated_ne": "truncatedNe",
        "percent": "percent",
        "fromYear": "fromYear",
        "toYear": "toYear",
        "factId": "factId",
        "china": "china",
        "nepal": "nepal",
        "india": "india",
    }
    out: dict[str, Any] = {}
    for src, dest in mapping.items():
        if src in raw:
            out[dest] = raw[src]
    return out or None


def payload() -> dict[str, Any]:
    """What the climate route and the dedicated page render."""
    facts_file = load_source_facts()
    from app.domains.flood import store as desk_store

    gov = (desk_store.load().get("govUpdates") or {}).get("items") or []
    statements = match_statements(gov, facts_file.get("statementNeedles") or [])

    return {
        "emissions": _emissions_view(load_emissions()),
        "arrived": _arrived_view(load_arrived()),
        "facts": public_facts(facts_file),
        "statements": statements,
        "section": _section(facts_file),
        "panels": _panels(facts_file),
        "disclaimerEn": facts_file.get("disclaimer_en"),
        "disclaimerNe": facts_file.get("disclaimer_ne"),
        "generatedAt": now_iso(),
    }
