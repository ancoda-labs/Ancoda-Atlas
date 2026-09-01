"""Serving third-party news photographs without ever storing one.

Outlets publish a lead image with most articles and it carries real
information — a washed-out bridge deck reads faster than the sentence
describing it. Three constraints shape how Atlas shows them:

  NOT STORED. The MinIO bucket holds photographs the public sent us and nothing
  else (see core/storage.py). These are streamed from the outlet at request
  time and forgotten.

  NOT HOTLINKED RAW. Several Nepali outlets still serve images over plain HTTP,
  which a browser blocks as mixed content on an HTTPS page. So the bytes pass
  through Atlas.

  NOT AN OPEN PROXY. A route that fetches whatever URL it is handed is an SSRF
  hole. Atlas will only fetch a URL it signed itself, and the signature is
  issued exactly once per feed item, at the point the feed is built.
"""

import base64
import hashlib
import hmac
import ipaddress
import re
import secrets
from urllib.parse import parse_qs, quote, urlparse

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger(__name__)

_process_secret: str | None = None


def _secret() -> str:
    """The signing key.

    A configured secret keeps signatures valid across restarts. Without one a
    per-process key is generated: links then stop working when the server
    restarts, which is harmless because the page refetches every few minutes,
    and is far better than shipping a guessable default that would turn this
    into the open proxy the design exists to avoid.
    """
    global _process_secret
    if settings.ATLAS_MEDIA_SECRET:
        return settings.ATLAS_MEDIA_SECRET
    if _process_secret is None:
        _process_secret = secrets.token_hex(32)
        # Harmless in development, silently destructive in production: behind
        # more than one replica the signatures this process mints are rejected
        # by every other one, and roughly half of all images fail with nothing
        # in the logs to say why. Say it once, loudly.
        if settings.is_production:
            log.warning(
                "media_secret_unset",
                detail=(
                    "ATLAS_MEDIA_SECRET is not set. A per-process key is in use, so "
                    "image links break on restart and fail across replicas. Set the "
                    "same value on every instance."
                ),
            )
    return _process_secret


def _sign(url: str) -> str:
    digest = hmac.new(_secret().encode(), url.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


_V4 = re.compile(r"^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$")


def is_private_host(hostname: str) -> bool:
    """Hosts that resolve to the machine itself or to a private network."""
    host = hostname.lower().strip("[]")
    if host == "localhost" or host.endswith((".localhost", ".internal", ".local")):
        return True
    if host == "::1" or host.startswith(("fc", "fd")):
        return True

    if not _V4.match(host):
        return False
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return False
    # link_local covers 169.254.0.0/16, which is the cloud metadata endpoint —
    # the single most valuable target for an SSRF against a hosted service.
    return bool(
        address.is_private
        or address.is_loopback
        or address.is_link_local
        or address.is_unspecified
    )


def is_signable_image_url(url: str) -> bool:
    """Is this a URL Atlas is willing to sign at all?"""
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    if parsed.scheme not in ("http", "https"):
        return False
    if not parsed.hostname:
        return False
    return not is_private_host(parsed.hostname)


def proxy_url_for(image_url: str | None) -> str | None:
    """Turn an outlet's image URL into a path on this server.

    None for anything Atlas will not fetch.
    """
    if not image_url or not is_signable_image_url(image_url):
        return None
    encoded = base64.urlsafe_b64encode(image_url.encode()).rstrip(b"=").decode()
    return (
        f"/api/flood/media/image?u={quote(encoded, safe='')}"
        f"&s={quote(_sign(image_url), safe='')}"
    )


def _decode_upstream(encoded: str | None) -> str | None:
    """The URL inside a `u=` parameter, with no signature check."""
    if not encoded:
        return None
    try:
        padded = encoded + "=" * (-len(encoded) % 4)
        url = base64.urlsafe_b64decode(padded).decode()
    except (ValueError, UnicodeDecodeError):
        return None
    return url if is_signable_image_url(url) else None


def resign_proxy_url(path: str | None) -> str | None:
    """Re-sign a stored proxy path with the key this process actually holds.

    The worker writes `imageProxy` at persist time. If that process and the
    API do not share `ATLAS_MEDIA_SECRET` — a missing env on one of them, or
    a one-off script that minted the store — every thumbnail 403s. The
    upstream URL is already in the path; this issues a signature the API
    will accept, still refusing anything that is not a public http(s) URL.
    """
    if not path:
        return None
    try:
        encoded = parse_qs(urlparse(path).query).get("u", [None])[0]
    except ValueError:
        return None
    return proxy_url_for(_decode_upstream(encoded))


def resolve_signed_url(u: str | None, s: str | None) -> str | None:
    """Recover the URL behind a proxy request, or None if the signature fails."""
    if not u or not s:
        return None
    url = _decode_upstream(u)
    if not url:
        return None

    # compare_digest rather than ==: a plain comparison leaks the position of
    # the first wrong byte through timing, which is enough to forge a signature
    # one byte at a time.
    if not hmac.compare_digest(_sign(url), s):
        return None
    return url
