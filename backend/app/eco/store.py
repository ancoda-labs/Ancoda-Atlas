"""Footprint and exposure artifacts under runs/<event_id>/."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.core import runs_store
from app.eco.models import EcosystemExposure


def event_dir(event_id: str) -> str:
    return f"events/{event_id}"


def footprint_name(event_id: str) -> str:
    return f"{event_dir(event_id)}/footprint.json"


def exposure_name(event_id: str) -> str:
    return f"{event_dir(event_id)}/eco_exposure.json"


def read_footprint(event_id: str) -> dict[str, Any] | None:
    payload = runs_store.read_json(footprint_name(event_id))
    return payload if isinstance(payload, dict) else None


def write_footprint(event_id: str, record: dict[str, Any]) -> bool:
    runs_store.ensure_dirs()
    target_dir = runs_store.path_for(event_dir(event_id))
    target_dir.mkdir(parents=True, exist_ok=True)
    return runs_store.write_json(footprint_name(event_id), record)


def read_exposure(event_id: str) -> EcosystemExposure | None:
    payload = runs_store.read_json(exposure_name(event_id))
    if not isinstance(payload, dict):
        return None
    if payload.get("exposure") is None:
        return None
    return EcosystemExposure.model_validate(payload["exposure"])


def write_exposure(event_id: str, exposure: EcosystemExposure | None) -> bool:
    runs_store.ensure_dirs()
    target_dir = runs_store.path_for(event_dir(event_id))
    target_dir.mkdir(parents=True, exist_ok=True)
    body = {
        "eventId": event_id,
        "exposure": exposure.model_dump(mode="json", by_alias=True) if exposure else None,
        "writtenAt": datetime.now(timezone.utc).isoformat(),
    }
    return runs_store.write_json(exposure_name(event_id), body)
