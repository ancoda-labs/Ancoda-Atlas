"""Ground-report photo routes.

Every rail from the Node build is enforced here, in the same order. The order
matters: the cheap refusals come before the expensive ones, so a sender who is
rate-limited does not first have twelve megabytes read into memory.
"""

import hmac
from typing import Any

from fastapi import APIRouter, File, Form, Header, Query, Response, UploadFile

from app.core.config import settings
from app.core.http_cache import cache_for, no_store
from app.core.logging import get_logger
from app.core.storage import is_storage_configured
from app.core.supabase import is_db_configured
from app.domains.photos import service

log = get_logger(__name__)

router = APIRouter(prefix="/flood/photos", tags=["photos"])

PHOTOS_TTL_S = 30


def _client_ip(forwarded: str | None, real: str | None) -> str:
    if forwarded:
        return forwarded.split(",")[0].strip()
    return real or "unknown"


def _text(value: str | None, limit: int) -> str | None:
    if not isinstance(value, str):
        return None
    trimmed = value.strip()[:limit]
    return trimmed or None


def _float(value: str | None) -> float | None:
    try:
        return float(value) if value not in (None, "") else None
    except (TypeError, ValueError):
        return None


@router.get("", summary="Published ground reports")
async def list_photos(response: Response, limit: int = 60) -> dict[str, Any]:
    """Photos need BOTH Supabase and MinIO.

    When either is absent the section hides itself with a reason rather than
    rendering an empty gallery, which would read as "nobody has sent anything".
    """
    if not is_db_configured():
        no_store(response)
        return {"enabled": False, "photos": [], "reason": "database_not_configured"}
    if not is_storage_configured():
        no_store(response)
        return {"enabled": False, "photos": [], "reason": "storage_not_configured"}

    try:
        photos = await service.list_photos(limit)
    except Exception as exc:  # noqa: BLE001
        log.warning("photo_list_failed", error=str(exc))
        no_store(response)
        return {"enabled": False, "photos": [], "reason": "unavailable"}

    # Short: the presigned URLs inside expire, and a long edge cache would
    # serve links that have already died.
    cache_for(response, edge=PHOTOS_TTL_S)
    return {"enabled": True, "photos": photos}


@router.post("", summary="Send a ground report")
async def upload_photo(
    response: Response,
    file: UploadFile = File(...),
    safetyAcknowledged: str = Form(""),  # noqa: N803 - the field name the form sends
    caption: str | None = Form(None),
    contributor: str | None = Form(None),
    district: str | None = Form(None),
    placeLabel: str | None = Form(None),  # noqa: N803
    lat: str | None = Form(None),
    lon: str | None = Form(None),
    content_length: int | None = Header(None),
    x_forwarded_for: str | None = Header(None),
    x_real_ip: str | None = Header(None),
) -> dict[str, Any]:
    if not is_db_configured() or not is_storage_configured():
        response.status_code = 503
        return {"error": "uploads_unavailable"}

    # Refused on the declared length before the body is read, so an oversized
    # send is rejected without first buffering it.
    if content_length and content_length > service.MAX_UPLOAD_BYTES + 64 * 1024:
        response.status_code = 413
        return {"error": "file_too_large", "maxBytes": service.MAX_UPLOAD_BYTES}

    # The sender has to confirm they were not put at risk taking the photograph.
    # This is a rail, not a formality: the desk asks people not to go closer to
    # a river to get a picture for it.
    if safetyAcknowledged != "true":
        response.status_code = 400
        return {"error": "safety_not_acknowledged"}

    ip_hash = service.hash_ip(_client_ip(x_forwarded_for, x_real_ip))
    try:
        if await service.recent_upload_count(ip_hash) >= service.UPLOAD_LIMIT:
            response.status_code = 429
            return {
                "error": "rate_limited",
                "limit": service.UPLOAD_LIMIT,
                "windowMinutes": service.UPLOAD_LIMIT_WINDOW_MINUTES,
            }
    except Exception as exc:  # noqa: BLE001
        # A rate-limit check that cannot run must not silently admit everyone.
        log.warning("photo_rate_limit_check_failed", error=str(exc))
        response.status_code = 503
        return {"error": "uploads_unavailable"}

    data = await file.read()
    if len(data) > service.MAX_UPLOAD_BYTES:
        response.status_code = 413
        return {"error": "file_too_large", "maxBytes": service.MAX_UPLOAD_BYTES}

    result = await service.create_photo(
        data,
        caption=_text(caption, service.MAX_CAPTION_CHARS),
        contributor=_text(contributor, service.MAX_CONTRIBUTOR_CHARS),
        district=_text(district, 60),
        place_label=_text(placeLabel, 120),
        device_lat=_float(lat),
        device_lon=_float(lon),
        ip_hash=ip_hash,
    )
    if not result.ok:
        response.status_code = result.status
        return {"error": result.error}

    response.status_code = 201
    return {"photo": result.photo}


@router.post("/report", summary="Flag a ground report")
async def report_photo(
    response: Response,
    payload: dict[str, Any],
    x_forwarded_for: str | None = Header(None),
    x_real_ip: str | None = Header(None),
) -> dict[str, Any]:
    """Three distinct senders flagging one photo retires it automatically.

    The count is per sender, not per flag, so one person cannot retire a
    photograph on their own.
    """
    if not is_db_configured():
        response.status_code = 503
        return {"error": "database_not_configured"}

    photo_id = payload.get("id")
    if not isinstance(photo_id, str) or not photo_id:
        response.status_code = 400
        return {"error": "id_required"}

    ip_hash = service.hash_ip(_client_ip(x_forwarded_for, x_real_ip))
    try:
        result = await service.report_photo(
            photo_id, _text(payload.get("reason"), 200), ip_hash
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("photo_report_failed", error=str(exc))
        response.status_code = 503
        return {"error": "unavailable"}

    if result is None:
        response.status_code = 404
        return {"error": "not_found"}

    return {
        "counted": result.counted,
        "reportCount": result.report_count,
        "removed": result.removed,
    }


@router.delete("/{photo_id}", summary="Take a ground report down")
async def delete_photo(
    photo_id: str,
    response: Response,
    reason: str = Query("removed by maintainer"),
    authorization: str | None = Header(None),
) -> dict[str, Any]:
    """Maintainer only.

    Answers 404 when no admin token is configured, rather than 401 — see the
    note on the flood refresh route. Without FLOOD_ADMIN_TOKEN set there is no
    takedown path except the database directly, which is a documented foot-gun
    rather than an accident.
    """
    expected = settings.FLOOD_ADMIN_TOKEN
    presented = (authorization or "").removeprefix("Bearer ").strip()
    if not expected or not hmac.compare_digest(presented, expected):
        response.status_code = 404
        return {"error": "not_found"}

    if not is_db_configured():
        response.status_code = 503
        return {"error": "database_not_configured"}

    try:
        removed = await service.remove_photo(photo_id, reason)
    except Exception as exc:  # noqa: BLE001
        log.warning("photo_delete_failed", error=str(exc))
        response.status_code = 503
        return {"error": "unavailable"}

    if not removed:
        response.status_code = 404
        return {"error": "not_found"}
    return {"removed": True}
