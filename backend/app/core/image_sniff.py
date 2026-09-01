"""Deciding what an image actually is, from its bytes.

The declared MIME type of an upload — or of an upstream response — is whatever
the sender says it is. Every place Atlas serves or stores image bytes decides
the format from the magic bytes instead, so a mislabelled or hostile response
cannot be passed through as an image.

Lives in core/ because two very different callers need it: the media proxy,
which must not relay a non-image, and the ground-report uploader, which must
not store one. The full EXIF reader and metadata stripper build on this.
"""

from typing import Literal

ImageType = Literal["image/jpeg", "image/png", "image/webp"]

EXTENSION: dict[str, str] = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}


def sniff_type(buf: bytes) -> ImageType | None:
    """Identify the format from its magic bytes, or None if it is not one we take."""
    if len(buf) < 12:
        return None
    if buf[0] == 0xFF and buf[1] == 0xD8 and buf[2] == 0xFF:
        return "image/jpeg"
    if buf[0:4] == b"\x89PNG":
        return "image/png"
    if buf[0:4] == b"RIFF" and buf[8:12] == b"WEBP":
        return "image/webp"
    return None
