"""The EXIF reader and the metadata stripper.

This code walks JPEG, PNG and WebP containers byte by byte with no image
library behind it, and it decides two things that matter: where a ground report
gets pinned on the map, and whether the device and location tags a phone wrote
into the file are still there after Atlas stores it.

The fixtures under tests/fixtures/images are the exact bytes the Node
implementation was tested against, and node_results.json is what it produced
from them. The parity test below asserts this port produces the same reading
AND the same stripped bytes, hash for hash — not merely something plausible.
"""

import hashlib
import json
from pathlib import Path

import pytest

from app.domains.photos.image import read_image_facts, sniff_type, strip_metadata

FIXTURES = Path(__file__).parent / "fixtures" / "images"


def _load(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


def _iso(moment) -> str | None:
    if not moment:
        return None
    return f"{moment:%Y-%m-%dT%H:%M:%S}.{moment.microsecond // 1000:03d}Z"


# ─── Parity with the Node implementation ─────────────────────────────────────


def _node_results() -> dict:
    return json.loads((FIXTURES / "node_results.json").read_text())


@pytest.mark.parametrize("name", sorted(_node_results()))
def test_matches_the_node_implementation_byte_for_byte(name):
    """The whole reason this port is byte surgery rather than a Pillow re-save.

    A re-encode would recompress evidence photographs. This asserts the walk
    produces the identical stripped bytes, so nothing about the image data
    changed.
    """
    expected = _node_results()[name]
    buf = _load(name)

    type_ = sniff_type(buf)
    assert type_ == expected["type"]

    if type_:
        facts = read_image_facts(buf, type_)
        assert facts.width == expected["facts"]["width"]
        assert facts.height == expected["facts"]["height"]
        assert facts.orientation == expected["facts"]["orientation"]
        assert facts.lat == expected["facts"]["lat"]
        assert facts.lon == expected["facts"]["lon"]
        assert _iso(facts.taken_at) == expected["facts"]["takenAt"]

        stripped = strip_metadata(buf, type_)
        assert hashlib.sha256(stripped).hexdigest() == expected["strippedSha"]


# ─── The behaviours those bytes exist to prove ───────────────────────────────


class TestSniff:
    def test_each_format_is_identified_from_its_magic_bytes(self):
        assert sniff_type(_load("jpeg_plain.jpg")) == "image/jpeg"
        assert sniff_type(_load("png_clean.png")) == "image/png"
        assert sniff_type(_load("webp_clean.webp")) == "image/webp"

    def test_a_mislabelled_file_is_judged_on_its_bytes(self):
        """The declared type of an upload is whatever the sender says it is."""
        assert sniff_type(b"GIF89a" + b"\x00" * 20) is None
        assert sniff_type(b"<?php system($_GET[0]); ?>" + b"\x00" * 20) is None

    def test_something_too_short_to_judge_is_refused(self):
        assert sniff_type(b"\xff\xd8\xff") is None


class TestExifReading:
    def test_gps_orientation_and_capture_time_are_read(self):
        facts = read_image_facts(_load("jpeg_exif.jpg"), "image/jpeg")
        assert facts.orientation == 6
        assert facts.lat == pytest.approx(28.1167, abs=0.001)
        assert facts.lon == pytest.approx(85.3, abs=0.001)
        assert facts.taken_at is not None
        assert facts.width == 4032
        assert facts.height == 3024

    def test_southern_and_western_refs_come_back_negative(self):
        """A hemisphere sign error puts a Rasuwa photo in the wrong ocean."""
        facts = read_image_facts(_load("jpeg_south.jpg"), "image/jpeg")
        assert facts.lat < 0
        assert facts.lon < 0

    def test_a_zero_fix_is_treated_as_no_fix(self):
        """0,0 is what a phone writes when the fix failed.

        It is in the Gulf of Guinea, not Rasuwa.
        """
        facts = read_image_facts(_load("jpeg_zerofix.jpg"), "image/jpeg")
        assert facts.lat is None
        assert facts.lon is None

    def test_a_photo_with_no_exif_is_handled_not_rejected(self):
        """Most photographs sent from a phone with location off have none."""
        facts = read_image_facts(_load("jpeg_plain.jpg"), "image/jpeg")
        assert facts.lat is None
        assert facts.orientation == 1
        assert facts.width == 4032

    def test_a_truncated_file_costs_its_metadata_not_the_upload(self):
        """Somebody standing in a flood should not be told to try again."""
        facts = read_image_facts(_load("truncated.jpg"), "image/jpeg")
        assert facts.lat is None
        assert facts.orientation == 1

    def test_png_dimensions_are_read(self):
        facts = read_image_facts(_load("png_text.png"), "image/png")
        assert (facts.width, facts.height) == (800, 600)

    def test_webp_dimensions_and_exif_are_read(self):
        facts = read_image_facts(_load("webp_exif.webp"), "image/webp")
        assert (facts.width, facts.height) == (1200, 900)
        assert facts.lat == pytest.approx(28.1167, abs=0.001)


class TestStripping:
    """What must not survive into storage."""

    def test_jpeg_exif_and_comments_are_removed(self):
        original = _load("jpeg_exif.jpg")
        stripped = strip_metadata(original, "image/jpeg")

        assert b"Exif" not in stripped
        assert b"Shot on a phone" not in stripped
        assert len(stripped) < len(original)
        # Still a whole image.
        assert sniff_type(stripped) == "image/jpeg"
        assert stripped[-2:] == b"\xff\xd9"

    def test_the_gps_is_actually_gone_after_stripping(self):
        """The single most important assertion in this file.

        Reading the position and then failing to remove it publishes the exact
        spot where someone stood during a disaster.
        """
        stripped = strip_metadata(_load("jpeg_exif.jpg"), "image/jpeg")
        facts = read_image_facts(stripped, "image/jpeg")
        assert facts.lat is None
        assert facts.lon is None
        assert facts.taken_at is None

    def test_the_image_data_is_untouched(self):
        """No recompression: the entropy-coded scan must survive byte for byte."""
        original = _load("jpeg_exif.jpg")
        stripped = strip_metadata(original, "image/jpeg")
        scan = bytes([0x5A] * 512)
        assert scan in original and scan in stripped

    def test_png_text_and_time_chunks_are_removed(self):
        original = _load("png_text.png")
        stripped = strip_metadata(original, "image/png")
        assert b"Nikon Transfer 2" not in stripped
        assert b"tEXt" not in stripped
        assert b"IDAT" in stripped and b"IEND" in stripped

    def test_webp_exif_and_xmp_are_removed_and_the_riff_size_rewritten(self):
        import struct

        original = _load("webp_exif.webp")
        stripped = strip_metadata(original, "image/webp")
        assert b"<x:xmpmeta>" not in stripped
        assert len(stripped) < len(original)
        # The RIFF size field covers everything after it; a stale one makes the
        # file unreadable to a strict decoder.
        assert struct.unpack_from("<I", stripped, 4)[0] == len(stripped) - 8

    def test_an_image_with_nothing_to_strip_is_returned_unchanged(self):
        original = _load("png_clean.png")
        assert strip_metadata(original, "image/png") == original

    def test_a_malformed_container_returns_the_original_rather_than_corruption(self):
        """A container this walker does not understand is never half-rewritten."""
        junk = b"\xff\xd8\xff" + b"\x00" * 200
        assert strip_metadata(junk, "image/jpeg") == junk

    def test_stripping_never_grows_a_file(self):
        for name, type_ in (
            ("jpeg_exif.jpg", "image/jpeg"),
            ("png_text.png", "image/png"),
            ("webp_exif.webp", "image/webp"),
        ):
            buf = _load(name)
            assert len(strip_metadata(buf, type_)) <= len(buf)
