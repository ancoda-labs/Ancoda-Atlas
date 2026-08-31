"""Ground-report photos — the domain layer between the routes and the database.

PHOTOS PUBLISH ON ARRIVAL. That is a deliberate choice about a live event: a
picture of a blocked road is worth most in the hour it is taken, and a review
queue nobody is staffing at 3am is not moderation, it is just delay.

What stands in for pre-review is a set of narrow rails, and they are the review:

  format decided from magic bytes, never the declared type
  every metadata tag stripped before the bytes are stored
  a size cap
  uploads per sender capped inside a window
  coordinates confined to Nepal
  any photo three separate people flag pulled automatically

None of these may be weakened. Together they are what makes publishing on
arrival defensible rather than reckless.
"""

import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, NamedTuple

from postgrest.types import CountMethod

from app.core.config import settings
from app.core.logging import get_logger
from app.core.storage import photo_key, presigned_get_url, upload
from app.core.storage import remove as remove_object
from app.core.supabase import iso_timestamp, require_db
from app.domains.photos.image import (
    EXTENSION,
    read_image_facts,
    sniff_type,
    strip_metadata,
)

log = get_logger(__name__)

MAX_UPLOAD_BYTES = 12 * 1024 * 1024
MAX_CAPTION_CHARS = 280
MAX_CONTRIBUTOR_CHARS = 60

# Uploads allowed from one sender per window, before the desk stops taking them.
UPLOAD_LIMIT = 8
UPLOAD_LIMIT_WINDOW_MINUTES = 15

# Distinct flags that retire a photo automatically.
REPORT_THRESHOLD = 3

# Nepal's bounding box, near enough. A photo pinned outside it is not of this
# flood, and an unbounded coordinate would drag the whole map off-screen.
NEPAL_BOUNDS = {"minLat": 26.3, "maxLat": 30.5, "minLon": 80.0, "maxLon": 88.3}

GEO_SOURCES = ("exif", "device", "district", "none")

SELECT_COLUMNS = (
    "id, object_key, width, height, orientation, lat, lon, geo_source, district, "
    "place_label, caption, contributor, taken_at, created_at, report_count"
)

DISTRICT_CENTRES: dict[str, dict[str, Any]] = {
    "Rasuwa": {"lat": 28.1167, "lon": 85.3000, "ne": "रसुवा"},
    "Nuwakot": {"lat": 27.9167, "lon": 85.1667, "ne": "नुवाकोट"},
    "Dhading": {"lat": 27.8667, "lon": 84.9000, "ne": "धादिङ"},
    "Gorkha": {"lat": 28.0000, "lon": 84.6333, "ne": "गोरखा"},
    "Chitwan": {"lat": 27.5833, "lon": 84.5000, "ne": "चितवन"},
    "Kathmandu": {"lat": 27.7172, "lon": 85.3240, "ne": "काठमाडौँ"},
    "Sindhupalchok": {"lat": 27.9500, "lon": 85.6833, "ne": "सिन्धुपाल्चोक"},
}


def within_nepal(lat: float, lon: float) -> bool:
    return (
        NEPAL_BOUNDS["minLat"] <= lat <= NEPAL_BOUNDS["maxLat"]
        and NEPAL_BOUNDS["minLon"] <= lon <= NEPAL_BOUNDS["maxLon"]
    )


_salt: str | None = None


def hash_ip(ip: str) -> str:
    """A sender's address, salted and truncated. Never stored in the clear.

    An unsalted hash of an IPv4 address is trivially reversible — there are only
    four billion of them — and these belong to people photographing a disaster.
    """
    global _salt

    salt = settings.ATLAS_IP_SALT
    if not salt:
        if _salt is None:
            _salt = secrets.token_hex(16)
        salt = _salt
    return hmac.new(salt.encode(), ip.encode(), hashlib.sha256).hexdigest()[:32]


def _as_geo_source(value: Any) -> str:
    return value if value in GEO_SOURCES else "none"


async def _to_photo(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        # Signed on read and never persisted, so a leaked row from a backup is
        # not a permanent public link to the bytes.
        "url": await presigned_get_url(row["object_key"]),
        "width": row.get("width"),
        "height": row.get("height"),
        "orientation": row.get("orientation"),
        "lat": row.get("lat"),
        "lon": row.get("lon"),
        "geoSource": _as_geo_source(row.get("geo_source")),
        "district": row.get("district"),
        "placeLabel": row.get("place_label"),
        "caption": row.get("caption"),
        "contributor": row.get("contributor"),
        "takenAt": iso_timestamp(row.get("taken_at")),
        "createdAt": iso_timestamp(row.get("created_at")),
        "reportCount": row.get("report_count") or 0,
    }


def _rows(response: Any) -> list[dict[str, Any]]:
    data = response.data
    return [r for r in data if isinstance(r, dict)] if isinstance(data, list) else []


async def list_photos(limit: int = 60) -> list[dict[str, Any]]:
    db = await require_db()
    response = await (
        db.table("flood_photos")
        .select(SELECT_COLUMNS)
        .eq("status", "published")
        .order("created_at", desc=True)
        .limit(min(max(limit, 1), 200))
        .execute()
    )
    return [await _to_photo(row) for row in _rows(response)]


async def recent_upload_count(ip_hash: str) -> int:
    """How many photos this sender has uploaded inside the rate-limit window."""
    since = (
        datetime.now(timezone.utc) - timedelta(minutes=UPLOAD_LIMIT_WINDOW_MINUTES)
    ).isoformat()
    db = await require_db()
    response = await (
        db.table("flood_photos")
        .select("id", count=CountMethod.exact, head=True)
        .eq("ip_hash", ip_hash)
        .gt("created_at", since)
        .execute()
    )
    return response.count or 0


class CreateResult(NamedTuple):
    ok: bool
    photo: dict[str, Any] | None = None
    status: int = 200
    error: str | None = None


async def create_photo(
    data: bytes,
    *,
    caption: str | None,
    contributor: str | None,
    district: str | None,
    place_label: str | None,
    device_lat: float | None,
    device_lon: float | None,
    ip_hash: str,
) -> CreateResult:
    if not data:
        return CreateResult(False, status=400, error="empty_file")
    if len(data) > MAX_UPLOAD_BYTES:
        return CreateResult(False, status=413, error="file_too_large")

    # The declared type is whatever the sender said. The bytes decide.
    type_ = sniff_type(data)
    if not type_:
        return CreateResult(False, status=415, error="unsupported_format")

    facts = read_image_facts(data, type_)
    clean = strip_metadata(data, type_)

    # Where the photo gets pinned, most trustworthy source first. The file's own
    # coordinates beat the browser's, because the browser reports where the
    # sender is standing now — not where the water was.
    lat = lon = None
    geo_source = "none"
    if facts.lat is not None and facts.lon is not None and within_nepal(facts.lat, facts.lon):
        lat, lon, geo_source = facts.lat, facts.lon, "exif"
    elif (
        device_lat is not None
        and device_lon is not None
        and within_nepal(device_lat, device_lon)
    ):
        lat, lon, geo_source = device_lat, device_lon, "device"
    elif district and district in DISTRICT_CENTRES:
        centre = DISTRICT_CENTRES[district]
        lat, lon, geo_source = centre["lat"], centre["lon"], "district"

    photo_id = str(uuid.uuid4())
    key = photo_key(photo_id, EXTENSION[type_])

    try:
        # The STRIPPED bytes, never the original. This is the line that decides
        # whether someone's GPS coordinates reach object storage.
        await upload(key, clean, type_)
    except Exception as exc:  # noqa: BLE001
        log.warning("photo_storage_upload_failed", error=str(exc))
        return CreateResult(False, status=502, error="storage_unavailable")

    try:
        db = await require_db()
        response = await (
            db.table("flood_photos")
            .insert(
                {
                    "id": photo_id,
                    "object_key": key,
                    "content_type": type_,
                    "bytes": len(clean),
                    "width": facts.width,
                    "height": facts.height,
                    "orientation": facts.orientation,
                    "lat": lat,
                    "lon": lon,
                    "geo_source": geo_source,
                    "district": district,
                    "place_label": place_label,
                    "caption": caption,
                    "contributor": contributor,
                    "ip_hash": ip_hash,
                    "taken_at": facts.taken_at.isoformat() if facts.taken_at else None,
                }
            )
            .execute()
        )
        rows = _rows(response)
        if not rows:
            return CreateResult(False, status=500, error="save_failed")
        return CreateResult(True, photo=await _to_photo(rows[0]))
    except Exception as exc:  # noqa: BLE001
        log.warning("photo_insert_failed", error=str(exc))
        return CreateResult(False, status=500, error="save_failed")


class ReportResult(NamedTuple):
    counted: bool
    report_count: int
    removed: bool


async def report_photo(
    photo_id: str, reason: str | None, ip_hash: str
) -> ReportResult | None:
    db = await require_db()

    # ignore_duplicates makes this the ON CONFLICT DO NOTHING it reads as: a
    # second flag from the same sender comes back with no row, which is how the
    # caller learns their flag was not counted twice.
    inserted = await (
        db.table("flood_photo_reports")
        .upsert(
            {
                "id": str(uuid.uuid4()),
                "photo_id": photo_id,
                "reason": reason,
                "ip_hash": ip_hash,
            },
            on_conflict="photo_id,ip_hash",
            ignore_duplicates=True,
        )
        .execute()
    )

    # The recount and the auto-retire happen inside one statement in Postgres —
    # see flood_photo_recount in the migration. Doing it as read-then-write from
    # here would let two flags arriving together each act on the same stale
    # count, and a photo could sit at two reports forever.
    response = await db.rpc(
        "flood_photo_recount", {"p_photo_id": photo_id, "p_threshold": REPORT_THRESHOLD}
    ).execute()

    rows = _rows(response)
    if not rows:
        return None
    row = rows[0]

    # `retired` is true only on the call that crossed the threshold, so this
    # warns once rather than on every later flag of an already-retired photo.
    if row.get("retired"):
        log.warning(
            "photo_auto_retired", photo=photo_id, reports=row.get("report_count")
        )

    return ReportResult(
        counted=bool(_rows(inserted)),
        report_count=row.get("report_count") or 0,
        removed=row.get("status") == "removed",
    )


async def remove_photo(photo_id: str, reason: str) -> bool:
    """Take a photo down. Maintainer only — see the route."""
    db = await require_db()
    response = await (
        db.table("flood_photos")
        .update({"status": "removed", "removed_reason": reason[:200]})
        .eq("id", photo_id)
        # Only a published photo can be removed, so a repeated takedown does not
        # re-delete an object another request already cleared.
        .eq("status", "published")
        .execute()
    )
    rows = _rows(response)
    if not rows:
        return False
    await remove_object(rows[0]["object_key"])
    return True
