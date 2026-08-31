"""Image handling for community flood photos — validate, read, strip.

Three jobs, all done by walking the container format directly rather than by
pulling in an image library:

  VALIDATE — the declared MIME type of an upload is whatever the sender says it
  is, so the format is decided from the magic bytes instead.

  LOCATE — a phone photo usually carries the coordinates it was taken at. Those
  are far better than the uploader's current position, which is where they are
  standing now, not where the water was.

  STRIP — and then every tag goes. EXIF from a phone carries the device, its
  serial number in some makes, and the exact position of whoever pressed the
  shutter. Atlas keeps the one coordinate pair it displays and the orientation
  it needs to render the photo upright, and discards the rest before the bytes
  are ever stored.

WHY THIS IS BYTE SURGERY RATHER THAN PILLOW.

The obvious Python approach — open the image and re-save it — recompresses
every JPEG. These are evidence photographs of a disaster, taken on phones and
often already heavily compressed, and a second lossy pass costs detail that may
matter. Walking the container removes the metadata without touching a single
byte of the encoded image data.
"""

import re
import struct
from datetime import datetime, timezone
from typing import NamedTuple

from app.core.image_sniff import EXTENSION, ImageType, sniff_type

__all__ = ["EXTENSION", "ImageFacts", "read_image_facts", "sniff_type", "strip_metadata"]


class ImageFacts(NamedTuple):
    width: int | None
    height: int | None
    # EXIF orientation, 1-8. 1 when absent or unreadable.
    orientation: int
    lat: float | None
    lon: float | None
    taken_at: datetime | None


NO_FACTS = ImageFacts(None, None, 1, None, None, None)


# ─── EXIF (TIFF IFD) reading ─────────────────────────────────────────────────

TAG_ORIENTATION = 0x0112
TAG_EXIF_IFD = 0x8769
TAG_GPS_IFD = 0x8825
TAG_DATETIME_ORIGINAL = 0x9003
TAG_GPS_LAT_REF = 0x0001
TAG_GPS_LAT = 0x0002
TAG_GPS_LON_REF = 0x0003
TAG_GPS_LON = 0x0004

# Byte width of each TIFF field type, indexed by the type code.
TYPE_SIZE = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8}


class IfdEntry(NamedTuple):
    tag: int
    type: int
    # Named `value_count` rather than `count`, which would shadow tuple.count.
    value_count: int
    # Offset of the value inside the TIFF block, for inline and pointed-to alike.
    value_offset: int


def _u16(buf: bytes, offset: int, le: bool) -> int | None:
    if offset < 0 or offset + 2 > len(buf):
        return None
    return struct.unpack_from("<H" if le else ">H", buf, offset)[0]


def _u32(buf: bytes, offset: int, le: bool) -> int | None:
    if offset < 0 or offset + 4 > len(buf):
        return None
    return struct.unpack_from("<I" if le else ">I", buf, offset)[0]


def _read_ifd(tiff: bytes, offset: int, le: bool) -> list[IfdEntry]:
    """Read the entries of one IFD. `tiff` starts at the TIFF header."""
    if offset < 0 or offset + 2 > len(tiff):
        return []
    count = _u16(tiff, offset, le) or 0
    entries = []
    for i in range(count):
        at = offset + 2 + i * 12
        if at + 12 > len(tiff):
            break
        tag = _u16(tiff, at, le)
        type_ = _u16(tiff, at + 2, le)
        n = _u32(tiff, at + 4, le)
        if tag is None or type_ is None or n is None:
            break
        size = TYPE_SIZE.get(type_, 0) * n
        # Values of four bytes or fewer sit in the entry itself; longer ones
        # live elsewhere in the block and the entry holds their offset.
        value_offset = (_u32(tiff, at + 8, le) or 0) if size > 4 else at + 8
        entries.append(IfdEntry(tag, type_, n, value_offset))
    return entries


def _read_rational(tiff: bytes, offset: int, le: bool) -> float | None:
    """A TIFF RATIONAL: two longs, numerator over denominator."""
    num = _u32(tiff, offset, le)
    den = _u32(tiff, offset + 4, le)
    if num is None or den is None or den == 0:
        return None
    return num / den


def _read_ascii(tiff: bytes, entry: IfdEntry) -> str | None:
    end = entry.value_offset + entry.value_count
    if entry.value_offset < 0 or end > len(tiff):
        return None
    return tiff[entry.value_offset : end].decode("ascii", errors="replace").rstrip("\x00")


def _read_gps_coordinate(
    tiff: bytes, entry: IfdEntry, ref: str | None, le: bool
) -> float | None:
    """Degrees, minutes and seconds as three rationals → signed decimal degrees."""
    if entry.value_count < 3:
        return None
    deg = _read_rational(tiff, entry.value_offset, le)
    minutes = _read_rational(tiff, entry.value_offset + 8, le)
    seconds = _read_rational(tiff, entry.value_offset + 16, le)
    if deg is None or minutes is None or seconds is None:
        return None
    value = deg + minutes / 60 + seconds / 3600
    return -value if ref in ("S", "W") else value


_EXIF_DATE = re.compile(r"^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})")


def _parse_exif_date(value: str | None) -> datetime | None:
    """"YYYY:MM:DD HH:MM:SS" as EXIF writes it. No zone, so it reads as UTC."""
    if not value:
        return None
    match = _EXIF_DATE.match(value.strip())
    if not match:
        return None
    year, month, day, hour, minute, second = (int(g) for g in match.groups())
    try:
        return datetime(year, month, day, hour, minute, second, tzinfo=timezone.utc)
    except ValueError:
        # A camera with a broken clock can write month 13. That costs the photo
        # its timestamp, not its upload.
        return None


class ExifFacts(NamedTuple):
    orientation: int
    lat: float | None
    lon: float | None
    taken_at: datetime | None


NO_EXIF = ExifFacts(1, None, None, None)


def _parse_tiff(tiff: bytes) -> ExifFacts:
    """Parse a TIFF block — an EXIF APP1 payload, past "Exif\\0\\0"."""
    if len(tiff) < 8:
        return NO_EXIF
    order = tiff[0:2]
    if order not in (b"II", b"MM"):
        return NO_EXIF
    le = order == b"II"
    if _u16(tiff, 2, le) != 0x002A:
        return NO_EXIF

    ifd0 = _read_ifd(tiff, _u32(tiff, 4, le) or 0, le)

    orientation, lat, lon, taken_at = 1, None, None, None

    for entry in ifd0:
        if entry.tag == TAG_ORIENTATION:
            value = _u16(tiff, entry.value_offset, le)
            if value is not None and 1 <= value <= 8:
                orientation = value
        elif entry.tag == TAG_GPS_IFD:
            gps_offset = _u32(tiff, entry.value_offset, le)
            if gps_offset is None:
                continue
            by_tag = {e.tag: e for e in _read_ifd(tiff, gps_offset, le)}
            lat_ref = by_tag.get(TAG_GPS_LAT_REF)
            lon_ref = by_tag.get(TAG_GPS_LON_REF)
            lat_entry = by_tag.get(TAG_GPS_LAT)
            lon_entry = by_tag.get(TAG_GPS_LON)
            if lat_entry:
                lat = _read_gps_coordinate(
                    tiff, lat_entry, _read_ascii(tiff, lat_ref) if lat_ref else None, le
                )
            if lon_entry:
                lon = _read_gps_coordinate(
                    tiff, lon_entry, _read_ascii(tiff, lon_ref) if lon_ref else None, le
                )
        elif entry.tag == TAG_EXIF_IFD:
            exif_offset = _u32(tiff, entry.value_offset, le)
            if exif_offset is None:
                continue
            for sub in _read_ifd(tiff, exif_offset, le):
                if sub.tag == TAG_DATETIME_ORIGINAL:
                    taken_at = _parse_exif_date(_read_ascii(tiff, sub))

    # 0,0 is what a phone writes when the fix failed. It is in the Gulf of
    # Guinea, not Rasuwa, so treat it as no reading at all.
    if lat == 0 and lon == 0:
        return ExifFacts(orientation, None, None, taken_at)
    return ExifFacts(orientation, lat, lon, taken_at)


def _tiff_from(block: bytes) -> bytes:
    """Strip the "Exif\\0\\0" preamble an APP1 or WebP EXIF chunk may carry."""
    return block[6:] if block[0:4] == b"Exif" else block


# ─── JPEG ────────────────────────────────────────────────────────────────────

JPEG_SOS = 0xDA
JPEG_EOI = 0xD9
JPEG_COM = 0xFE


def _is_sof_marker(marker: int) -> bool:
    """SOFn carries the frame dimensions. DHT, JPG and DAC share the range."""
    return 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC)


def _is_strippable_app(marker: int) -> bool:
    """APPn, where n is 1-15. APP0 is the JFIF header and stays."""
    return 0xE1 <= marker <= 0xEF


class JpegSegment(NamedTuple):
    marker: int
    at: int       # offset of the marker itself, at the 0xFF byte
    start: int    # offset of the payload, past the marker and length bytes
    end: int


def _jpeg_segments(buf: bytes) -> tuple[list[JpegSegment], int]:
    """Walk the marker segments up to the start of scan."""
    segments: list[JpegSegment] = []
    i = 2  # past SOI
    while i + 4 <= len(buf):
        if buf[i] != 0xFF:
            break
        marker = buf[i + 1]
        if marker in (JPEG_SOS, JPEG_EOI):
            return segments, i
        length = struct.unpack_from(">H", buf, i + 2)[0]
        if length < 2:
            break
        end = i + 2 + length
        if end > len(buf):
            break
        segments.append(JpegSegment(marker, i, i + 4, end))
        i = end
    return segments, i


def _jpeg_facts(buf: bytes) -> ImageFacts:
    width = height = None
    exif = NO_EXIF
    segments, _ = _jpeg_segments(buf)
    for seg in segments:
        # SOFn payload: precision(1), height(2), width(2).
        if _is_sof_marker(seg.marker) and width is None and seg.start + 5 <= len(buf):
            height = struct.unpack_from(">H", buf, seg.start + 1)[0]
            width = struct.unpack_from(">H", buf, seg.start + 3)[0]
        elif seg.marker == 0xE1 and buf[seg.start : seg.start + 4] == b"Exif":
            exif = _parse_tiff(_tiff_from(buf[seg.start : seg.end]))
    return ImageFacts(width, height, *exif)


def _jpeg_strip(buf: bytes) -> bytes:
    """Rebuild without APP1-APP15 or comment segments."""
    segments, scan_start = _jpeg_segments(buf)
    parts = [buf[0:2]]  # SOI
    for seg in segments:
        if _is_strippable_app(seg.marker) or seg.marker == JPEG_COM:
            continue
        parts.append(buf[seg.at : seg.end])
    # Everything from the start of scan on is entropy-coded data, copied as is.
    parts.append(buf[scan_start:])
    return b"".join(parts)


# ─── PNG ─────────────────────────────────────────────────────────────────────

# The image itself, plus what is needed to render it faithfully. The rest goes.
PNG_KEEP = {
    "IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA",
    "cHRM", "sRGB", "iCCP", "sBIT", "bKGD", "pHYs",
}


class PngChunk(NamedTuple):
    type: str
    start: int
    end: int
    data_start: int
    data_end: int


def _png_chunks(buf: bytes) -> list[PngChunk]:
    chunks: list[PngChunk] = []
    i = 8  # past the signature
    while i + 12 <= len(buf):
        length = struct.unpack_from(">I", buf, i)[0]
        type_ = buf[i + 4 : i + 8].decode("ascii", errors="replace")
        data_start = i + 8
        data_end = data_start + length
        end = data_end + 4  # past the CRC
        if end > len(buf):
            break
        chunks.append(PngChunk(type_, i, end, data_start, data_end))
        i = end
        if type_ == "IEND":
            break
    return chunks


def _png_facts(buf: bytes) -> ImageFacts:
    width = height = None
    exif = NO_EXIF
    for chunk in _png_chunks(buf):
        if chunk.type == "IHDR" and chunk.data_start + 8 <= len(buf):
            width = struct.unpack_from(">I", buf, chunk.data_start)[0]
            height = struct.unpack_from(">I", buf, chunk.data_start + 4)[0]
        elif chunk.type == "eXIf":
            exif = _parse_tiff(_tiff_from(buf[chunk.data_start : chunk.data_end]))
    return ImageFacts(width, height, *exif)


def _png_strip(buf: bytes) -> bytes:
    parts = [buf[0:8]]
    for chunk in _png_chunks(buf):
        if chunk.type in PNG_KEEP:
            parts.append(buf[chunk.start : chunk.end])
    return b"".join(parts)


# ─── WebP ────────────────────────────────────────────────────────────────────

WEBP_DROP = {"EXIF", "XMP "}


class RiffChunk(NamedTuple):
    fourcc: str
    start: int
    end: int  # including the pad byte
    data_start: int
    data_end: int


def _riff_chunks(buf: bytes) -> list[RiffChunk]:
    chunks: list[RiffChunk] = []
    i = 12  # past "RIFF", the size, and "WEBP"
    while i + 8 <= len(buf):
        fourcc = buf[i : i + 4].decode("ascii", errors="replace")
        size = struct.unpack_from("<I", buf, i + 4)[0]
        data_start = i + 8
        data_end = data_start + size
        if data_end > len(buf):
            break
        end = data_end + (size % 2)  # chunks are padded to an even length
        chunks.append(RiffChunk(fourcc, i, end, data_start, data_end))
        i = end
    return chunks


def _u24le(buf: bytes, offset: int) -> int:
    return buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16)


def _webp_facts(buf: bytes) -> ImageFacts:
    width = height = None
    exif = NO_EXIF
    for chunk in _riff_chunks(buf):
        d = chunk.data_start
        if chunk.fourcc == "VP8X" and d + 10 <= len(buf):
            # flags(4), then canvas width-1 and height-1 as 24-bit LE.
            width = _u24le(buf, d + 4) + 1
            height = _u24le(buf, d + 7) + 1
        elif chunk.fourcc == "VP8 " and width is None and d + 10 <= len(buf):
            # 3-byte frame tag, 3-byte start code, then 14-bit width and height.
            width = struct.unpack_from("<H", buf, d + 6)[0] & 0x3FFF
            height = struct.unpack_from("<H", buf, d + 8)[0] & 0x3FFF
        elif chunk.fourcc == "VP8L" and width is None and d + 5 <= len(buf):
            # Signature byte, then width-1 and height-1 packed into 14 bits each.
            bits = struct.unpack_from("<I", buf, d + 1)[0]
            width = (bits & 0x3FFF) + 1
            height = ((bits >> 14) & 0x3FFF) + 1
        elif chunk.fourcc == "EXIF":
            exif = _parse_tiff(_tiff_from(buf[chunk.data_start : chunk.data_end]))
    return ImageFacts(width, height, *exif)


def _webp_strip(buf: bytes) -> bytes:
    kept = []
    dropped = False
    for chunk in _riff_chunks(buf):
        if chunk.fourcc in WEBP_DROP:
            dropped = True
            continue
        kept.append(buf[chunk.start : chunk.end])
    if not dropped:
        return buf
    out = bytearray(buf[0:12] + b"".join(kept))
    # The RIFF size field covers "WEBP" plus every chunk, so it is rewritten.
    struct.pack_into("<I", out, 4, len(out) - 8)
    return bytes(out)


# ─── Public surface ──────────────────────────────────────────────────────────


def read_image_facts(buf: bytes, type_: ImageType) -> ImageFacts:
    """Dimensions, orientation, capture position and capture time."""
    try:
        if type_ == "image/jpeg":
            return _jpeg_facts(buf)
        if type_ == "image/png":
            return _png_facts(buf)
        return _webp_facts(buf)
    except Exception:  # noqa: BLE001
        # A malformed container should cost the photo its metadata, not its
        # upload — somebody standing in a flood should not be told to try again.
        return NO_FACTS


def _looks_intact(out: bytes, type_: ImageType) -> bool:
    """Is a stripped result still a whole image of the type it started as?

    Checked structurally rather than by size. An earlier version required the
    output to clear a fixed byte floor, which quietly returned the ORIGINAL
    bytes — metadata and all — for any image small enough to fall under it. A
    rule meant to catch corruption cannot be allowed to fail in the direction
    of publishing someone's GPS coordinates.
    """
    if sniff_type(out) != type_:
        return False

    if type_ == "image/jpeg":
        # Must still end at EOI and still contain a start of scan.
        if len(out) < 2 or struct.unpack_from(">H", out, len(out) - 2)[0] != 0xFFD9:
            return False
        _, scan_start = _jpeg_segments(out)
        return scan_start < len(out)

    if type_ == "image/png":
        types = {c.type for c in _png_chunks(out)}
        return {"IHDR", "IDAT", "IEND"} <= types

    # WebP: the image data chunk has to have survived, and the RIFF size field
    # must describe the buffer actually being returned.
    chunks = _riff_chunks(out)
    if not any(c.fourcc in ("VP8 ", "VP8L", "VP8X") for c in chunks):
        return False
    return struct.unpack_from("<I", out, 4)[0] == len(out) - 8


def strip_metadata(buf: bytes, type_: ImageType) -> bytes:
    """The image with every metadata block removed.

    Falls back to the original bytes only when the rewrite produced something
    that is no longer a whole image, so a container this walker does not
    understand is never silently corrupted.
    """
    try:
        if type_ == "image/jpeg":
            out = _jpeg_strip(buf)
        elif type_ == "image/png":
            out = _png_strip(buf)
        else:
            out = _webp_strip(buf)
        # Stripping only ever removes; anything larger means the walk went wrong.
        if len(out) > len(buf) or len(out) < 12:
            return buf
        return out if _looks_intact(out, type_) else buf
    except Exception:  # noqa: BLE001
        return buf
