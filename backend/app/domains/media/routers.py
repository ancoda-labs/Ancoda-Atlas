"""Streaming third-party photographs, and only ones Atlas signed itself."""

from fastapi import APIRouter, Query, Response

from app.core.http import get_client
from app.core.image_sniff import sniff_type
from app.core.logging import get_logger
from app.domains.flood.gauges import resolve_station_photo_url
from app.domains.media.proxy import resolve_signed_url

log = get_logger(__name__)

router = APIRouter(tags=["flood"])

MAX_BYTES = 8 * 1024 * 1024
STATION_MAX_BYTES = 20 * 1024 * 1024
FETCH_TIMEOUT_S = 15.0

FETCH_HEADERS = {
    "Accept": "image/*",
    "User-Agent": "AncodaAtlas/4.0 (Nepal hazard monitoring)",
    # No referer, so an outlet's logs do not record which Atlas page a reader
    # is on.
    "Referer": "",
}

# DHM publishes gauge-station photos over plain HTTP, which a browser blocks as
# mixed content. Proxy them — but only from the hosts we expect, never an
# arbitrary URL supplied by the caller.
STATION_HOSTS = {
    "daq.hydrology.gov.np",
    "hydrology.gov.np",
    "www.dhm.gov.np",
    "bipadportal.gov.np",
}

IMAGE_HEADERS = {
    "Cache-Control": "public, max-age=1800, stale-while-revalidate=3600",
    # The response is bytes we did not author. Even though the type is sniffed,
    # a CSP that permits nothing to execute costs nothing and closes the gap if
    # a browser ever guesses differently than we did.
    "Content-Security-Policy": "default-src 'none'; img-src 'self'",
    "X-Content-Type-Options": "nosniff",
}


@router.get("/flood/media/image", summary="Proxy one news photograph")
async def media_image(
    u: str | None = Query(None, description="base64url of the upstream URL"),
    s: str | None = Query(None, description="HMAC signature Atlas issued"),
) -> Response:
    """Stream one photograph from the outlet that published it.

    Nothing is written to disk or to object storage. The route only fetches a
    URL Atlas signed itself, so it cannot be pointed at an arbitrary host.
    """
    upstream = resolve_signed_url(u, s)
    if not upstream:
        return Response("Bad or missing signature", status_code=403)

    try:
        client = await get_client()
        response = await client.get(
            upstream, headers=FETCH_HEADERS, timeout=FETCH_TIMEOUT_S
        )
        if response.status_code >= 400:
            return Response("Upstream error", status_code=502)

        declared = int(response.headers.get("content-length") or 0)
        if declared > MAX_BYTES:
            return Response("Image too large", status_code=502)

        body = response.content
        if len(body) > MAX_BYTES:
            return Response("Image too large", status_code=502)

        # Decided from the bytes, not the upstream's Content-Type header, so a
        # mislabelled or hostile response cannot be passed through as an image.
        content_type = sniff_type(body)
        if not content_type:
            return Response("Upstream is not an image", status_code=502)

        return Response(body, media_type=content_type, headers=IMAGE_HEADERS)
    except Exception as exc:  # noqa: BLE001
        log.warning("media_fetch_failed", error=str(exc))
        return Response("Fetch failed", status_code=502)


@router.get("/flood/station-photo", summary="Proxy one DHM gauge-station photo")
async def station_photo(id: int = Query(..., description="BIPAD station id")) -> Response:
    upstream = await resolve_station_photo_url(id)
    if not upstream:
        return Response("No photo for station", status_code=404)

    from urllib.parse import urlparse

    try:
        parsed = urlparse(upstream)
    except ValueError:
        return Response("Bad upstream URL", status_code=502)
    if parsed.hostname not in STATION_HOSTS:
        return Response("Upstream host not allowed", status_code=502)

    try:
        client = await get_client()
        response = await client.get(upstream, timeout=20.0)
        if response.status_code >= 400:
            return Response("Upstream error", status_code=502)

        body = response.content
        if len(body) > STATION_MAX_BYTES:
            return Response("Image too large", status_code=502)

        # The upstream serves application/octet-stream, so the type has to be
        # sniffed for the browser to render it — and a non-image is rejected
        # rather than passed through.
        content_type = sniff_type(body)
        if not content_type:
            return Response("Upstream is not an image", status_code=502)

        return Response(
            body,
            media_type=content_type,
            headers={"Cache-Control": "public, max-age=3600"},
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("station_photo_failed", station=id, error=str(exc))
        return Response("Fetch failed", status_code=502)
