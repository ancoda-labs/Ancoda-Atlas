"""Corrections filed against the rescue register.

A relative saying a name is misspelled, that someone listed as missing is
safe, or asking to be taken off the list.

WHAT THIS DOES NOT DO. Nothing filed here changes what the register shows.
Atlas does not edit a government list on the word of an anonymous form — the
register belongs to NDRRMA and OPMCM, and a machine-applied correction could
mark someone found who is not. These are stored for a human to read and act on,
and the form says so.
"""

import hashlib
import uuid
from typing import Any

from app.core.config import settings
from app.core.logging import get_logger
from app.core.supabase import require_db

log = get_logger(__name__)

KINDS = {"wrong_details", "not_safe", "missing_person", "remove_me", "other"}

MAX_MESSAGE = 2000
MAX_NAME = 200
MAX_CONTACT = 200


def hash_ip(ip: str) -> str:
    """A salted hash, never the address itself.

    The salt is process-random when ATLAS_IP_SALT is unset, which resets the
    grouping on restart — acceptable for rate limiting, and better than a
    rainbow-table-able bare hash of an address belonging to someone reporting a
    missing relative.
    """
    salt = settings.ATLAS_IP_SALT or _process_salt()
    return hashlib.sha256(f"{salt}:{ip}".encode()).hexdigest()


_salt: str | None = None


def _process_salt() -> str:
    global _salt
    if _salt is None:
        import secrets

        _salt = secrets.token_hex(16)
    return _salt


def _text(value: Any, limit: int) -> str | None:
    if not isinstance(value, str):
        return None
    trimmed = value.strip()[:limit]
    return trimmed or None


async def file_correction(payload: dict[str, Any], ip: str = "unknown") -> dict[str, Any]:
    message = _text(payload.get("message"), MAX_MESSAGE)
    if not message:
        raise ValueError("message_required")

    kind = payload.get("kind")
    kind = kind if isinstance(kind, str) and kind in KINDS else "other"

    person_id = payload.get("personId")
    person_id = person_id if isinstance(person_id, int) and not isinstance(person_id, bool) else None

    db = await require_db()
    await (
        db.table("rescue_corrections")
        .insert(
            {
                "id": str(uuid.uuid4()),
                "person_id": person_id,
                "person_name": _text(payload.get("personName"), MAX_NAME),
                "kind": kind,
                "message": message,
                "contact": _text(payload.get("contact"), MAX_CONTACT),
                "ip_hash": hash_ip(ip),
            }
        )
        .execute()
    )

    # Logged at warning so it stands out in a live response: somebody is
    # telling the desk a name is wrong, and that is worth a human's attention.
    log.warning(
        "rescue_correction_filed",
        kind=kind,
        person=person_id or _text(payload.get("personName"), MAX_NAME) or "unspecified",
    )
    return {"received": True}


async def list_corrections(limit: int = 100) -> list[dict[str, Any]]:
    """For a maintainer. Contact details are returned — that is the point of
    the field — so this route must stay behind the admin token."""
    db = await require_db()
    response = await (
        db.table("rescue_corrections")
        .select("id, person_id, person_name, kind, message, contact, created_at")
        .order("created_at", desc=True)
        .limit(min(max(limit, 1), 500))
        .execute()
    )
    data = response.data
    return [r for r in data if isinstance(r, dict)] if isinstance(data, list) else []
