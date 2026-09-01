"""MinIO object storage for flood ground-report photos.

Ported from src/lib/storage.ts. One bucket, keys namespaced by resource, and
pre-signed GET URLs generated on demand and never persisted — so a leaked row
from a backup is not a permanent public link to the bytes.

SCOPE — read this before adding a caller.

This bucket holds photographs uploaded by members of the public, and nothing
else. It is not a cache and not a mirror. Third-party material — news
photographs, video thumbnails, satellite imagery, anything Atlas did not
receive directly from the person who took it — is streamed through the media
proxy at request time and is never written here. Keeping that line sharp is
what makes the bucket's contents describable in one sentence: it is the
community's own photographs, and each one can be deleted on the word of the
person who sent it.

Keys follow:  flood-photos/{yyyy-mm-dd}/{id}.{ext}
"""

import asyncio
from datetime import datetime, timedelta, timezone
from io import BytesIO

from minio import Minio

from app.core.config import settings
from app.core.exceptions import ServiceUnavailableError
from app.core.logging import get_logger

log = get_logger(__name__)

BUCKET = settings.MINIO_BUCKET

_client: Minio | None = None
_public_client: Minio | None = None
_bucket_ready = False


def is_storage_configured() -> bool:
    return settings.is_storage_configured


def _split_endpoint(endpoint: str) -> str:
    """The Python SDK wants a bare host:port, with the scheme carried separately."""
    return endpoint.replace("https://", "").replace("http://", "").rstrip("/")


def _build(endpoint: str) -> Minio:
    return Minio(
        _split_endpoint(endpoint),
        access_key=settings.MINIO_ROOT_USER,
        secret_key=settings.MINIO_ROOT_PASSWORD,
        secure=settings.MINIO_SECURE,
        region=settings.MINIO_REGION,
    )


def client() -> Minio:
    global _client
    if not is_storage_configured():
        raise ServiceUnavailableError(
            "Object storage is not configured.",
            details={"reason": "storage_not_configured"},
        )
    if _client is None:
        _client = _build(settings.MINIO_ENDPOINT)
    return _client


def public_client() -> Minio:
    """The client used to sign URLs a browser will follow.

    Inside Docker the server reaches MinIO at `minio:9000`, which means nothing
    to a phone on the internet — so signatures for public links are produced
    against the public hostname instead.
    """
    global _public_client
    public = settings.MINIO_PUBLIC_ENDPOINT or settings.MINIO_ENDPOINT
    if public == settings.MINIO_ENDPOINT:
        return client()
    if _public_client is None:
        _public_client = _build(public)
    return _public_client


def _ensure_bucket_sync() -> None:
    global _bucket_ready
    if _bucket_ready:
        return
    c = client()
    if not c.bucket_exists(BUCKET):
        c.make_bucket(BUCKET, location=settings.MINIO_REGION)
        log.info("bucket_created", bucket=BUCKET)
    _bucket_ready = True


# ─── Async wrappers ──────────────────────────────────────────────────────────
#
# The MinIO SDK is synchronous. Every call below is pushed to a worker thread so
# an upload does not stall the event loop for every other reader — the same
# reason the Supabase client is the async one.


async def ensure_bucket() -> None:
    await asyncio.to_thread(_ensure_bucket_sync)


async def upload(key: str, data: bytes, content_type: str) -> str:
    await ensure_bucket()
    await asyncio.to_thread(
        client().put_object,
        BUCKET,
        key,
        BytesIO(data),
        len(data),
        content_type=content_type,
    )
    return key


async def presigned_get_url(key: str) -> str:
    """A time-limited URL a browser can load the object from."""
    return await asyncio.to_thread(
        public_client().presigned_get_object,
        BUCKET,
        key,
        timedelta(seconds=settings.MINIO_PRESIGNED_EXPIRY_SECONDS),
    )


async def remove(key: str) -> None:
    try:
        await asyncio.to_thread(client().remove_object, BUCKET, key)
    except Exception as exc:  # noqa: BLE001
        # A missing object is not worth failing a takedown over — the row is
        # what makes a photo visible, and the caller has already cleared it.
        log.warning("storage_delete_failed", key=key, error=str(exc))


async def download(key: str) -> bytes:
    """Read an object back. Used by the image proxy when MinIO is not public."""

    def _read() -> bytes:
        response = None
        try:
            response = client().get_object(BUCKET, key)
            return response.read()
        finally:
            if response is not None:
                response.close()
                response.release_conn()

    return await asyncio.to_thread(_read)


async def storage_healthy() -> bool:
    if not is_storage_configured():
        return False
    try:
        await asyncio.to_thread(client().bucket_exists, BUCKET)
        return True
    except Exception as exc:  # noqa: BLE001 - a probe reports, it does not raise
        log.warning("storage_health_check_failed", error=str(exc))
        return False


def photo_key(photo_id: str, ext: str) -> str:
    """Object key for one photo, partitioned by day so the bucket stays browsable."""
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return f"flood-photos/{day}/{photo_id}.{ext}"
