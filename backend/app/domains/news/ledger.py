"""Every headline Atlas has shown, written down once, for issue #37.

The panels are a moving window — a story is on the dashboard for a day and then
falls off the end of a feed. Nothing kept a record of what had been shown, so
there was no way to score sentiment across a week of coverage, or to answer
afterwards which headlines a reader would actually have seen during an event.

This is that record: one row per item, the first time it appears, appended and
never rewritten. It carries what the wire and the government portal already
publish — title, outlet, time, topic — and nothing derived from them.

**No sentiment column.** The scoring belongs to whoever does the scoring, in a
sheet this file cannot reach. Putting an empty column here would invite a human
to type a label into a table the worker owns, where the next append would sit
on top of it. Each row carries a stable `id` instead, so a labelling sheet can
look a score up by it — see docs/news-ledger.md.

**Append, never rewrite.** The rest of runs/ is written whole through
`runs_store`, which is right for a snapshot that is replaced every cycle and
wrong for a file that only grows: rewriting the year's ledger every ten minutes
to add four rows is work that scales with history rather than with news. Rows
go on the end, and the writer is the worker alone, exactly as elsewhere.
"""

import csv
import hashlib
import io
import os
import re
from typing import Any

from app.core import runs_store
from app.core.http import now_iso
from app.core.logging import get_logger

log = get_logger(__name__)

LEDGER = "news-ledger.csv"

# `feed` says which of the two surfaces a row came from, because they are not
# the same kind of claim: `wire` is what an outlet reported, `government` is
# what a ministry itself posted. A sentiment score on the two means different
# things and they must stay separable.
COLUMNS = [
    "id",
    "title",
    "source",
    "feed",
    "topic",
    "publishedAt",
    "firstSeenAt",
    "link",
    "language",
    "district",
]

DEVANAGARI = re.compile(r"[ऀ-ॿ]")

# Loaded once from the file, then kept in memory. Safe because the worker is
# the only writer — see runs_store. A restart re-reads it.
_seen: set[str] | None = None


def row_id(link: str) -> str:
    """A stable handle for one item, so a label can outlive the row's position."""
    return hashlib.sha1(link.encode("utf-8")).hexdigest()[:12]


def language_of(title: str) -> str:
    return "ne" if DEVANAGARI.search(title) else "en"


def _path() -> Any:
    return runs_store.path_for(LEDGER)


def _load_seen() -> set[str]:
    """The ids already on file.

    A read failure answers an empty set rather than raising. The cost of being
    wrong is a duplicate row, which a sheet can group away; the cost of raising
    would be a sweep lost to a bookkeeping file.
    """
    global _seen
    if _seen is not None:
        return _seen

    seen: set[str] = set()
    try:
        with _path().open("r", encoding="utf-8", newline="") as handle:
            for row in csv.DictReader(handle):
                identifier = (row.get("id") or "").strip()
                if identifier:
                    seen.add(identifier)
    except FileNotFoundError:
        pass
    except (OSError, csv.Error) as exc:
        log.warning("news_ledger_read_failed", error=str(exc))

    _seen = seen
    return seen


def _append(rows: list[dict[str, str]]) -> int:
    """Add rows to the end of the ledger. Worker only. Never raises."""
    if not rows:
        return 0
    if not runs_store.ensure_dirs():
        return 0

    target = _path()
    header_needed = not target.exists()

    try:
        with target.open("a", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=COLUMNS, extrasaction="ignore")
            if header_needed:
                writer.writeheader()
            writer.writerows(rows)
            handle.flush()
            # A reader tailing this file must not see half a line, and a row
            # that was logged as written has to survive the container stopping.
            os.fsync(handle.fileno())
    except OSError as exc:
        log.warning("news_ledger_write_failed", error=str(exc))
        return 0

    _load_seen().update(row["id"] for row in rows)
    return len(rows)


def _new_rows(candidates: list[dict[str, str]]) -> list[dict[str, str]]:
    """Drop what is already on file, and what repeats inside this batch.

    The same story reaches several topics — a landslide report is on both the
    flood and the disaster panel — so a bundle carries duplicates of its own.
    """
    seen = _load_seen()
    batch: set[str] = set()
    out = []
    for row in candidates:
        if row["id"] in seen or row["id"] in batch:
            continue
        batch.add(row["id"])
        out.append(row)
    return out


def _wire_row(item: dict[str, Any], topic: str, first_seen: str) -> dict[str, str] | None:
    """One shown headline, from either the ranked panels or the map's RSS set.

    The map items use `url`/`date` rather than `link`/`pubDate`. Both are the
    same story; treating only one spelling would silently drop the map.
    """
    link = (item.get("link") or item.get("url") or "").strip()
    title = (item.get("title") or "").strip()
    if not link or not title:
        return None
    return {
        "id": row_id(link),
        "title": title,
        "source": (item.get("source") or "").strip(),
        "feed": "wire",
        "topic": topic,
        "publishedAt": (item.get("pubDate") or item.get("date") or "").strip(),
        "firstSeenAt": first_seen,
        "link": link,
        "language": language_of(title),
        "district": "",
    }


def record_wire_items(items: list[dict[str, Any]] | None, topic: str) -> int:
    """Log a flat list of headlines (the flood desk rail, or the map's RSS)."""
    first_seen = now_iso()
    candidates = []
    for item in items or []:
        row = _wire_row(item, topic, first_seen)
        if row:
            candidates.append(row)
    return _append(_new_rows(candidates))


def record_wire_bundle(bundle: dict[str, Any]) -> int:
    """Log every headline in a news bundle that has not been logged before.

    The bundle is the right place to read from rather than each panel: it is
    what the dashboard renders, so a row in this file is a headline that was
    genuinely on a page.

    An item reaching two topics is written once, under whichever topic the
    bundle happens to list first. The topic is a label on the story, not a
    claim that it belongs to exactly one panel.
    """
    first_seen = now_iso()
    candidates = []
    for topic, payload in (bundle.get("topics") or {}).items():
        for item in (payload or {}).get("items") or []:
            row = _wire_row(item, str(topic), first_seen)
            if row:
                candidates.append(row)
    return _append(_new_rows(candidates))


def record_gov_updates(items: list[dict[str, Any]]) -> int:
    """Log the ministry posts the flood desk is showing.

    Their `source` is the publishing ministry rather than an outlet, which is
    the whole reason they are worth scoring separately from the wire.
    """
    first_seen = now_iso()
    candidates = []
    for item in items or []:
        link = (item.get("link") or "").strip()
        title = (item.get("titleNe") or item.get("title") or "").strip()
        if not link or not title:
            continue
        candidates.append(
            {
                "id": row_id(link),
                "title": title,
                "source": item.get("ministry") or "",
                "feed": "government",
                "topic": item.get("topic") or "",
                "publishedAt": (item.get("publishedAt") or "").strip(),
                "firstSeenAt": first_seen,
                "link": link,
                "language": language_of(title),
                "district": item.get("district") or "",
            }
        )
    return _append(_new_rows(candidates))


def read_csv() -> str:
    """The whole ledger as text, for the export route. Never raises.

    An empty ledger answers a header row rather than an empty body, so a
    spreadsheet pulling this before the first cycle gets column names instead
    of an error.
    """
    try:
        return _path().read_text(encoding="utf-8")
    except FileNotFoundError:
        pass
    except OSError as exc:
        log.warning("news_ledger_read_failed", error=str(exc))

    buffer = io.StringIO()
    csv.DictWriter(buffer, fieldnames=COLUMNS).writeheader()
    return buffer.getvalue()


def stats() -> dict[str, Any]:
    """How much has been collected, for the diag script and the export header."""
    return {"rows": len(_load_seen()), "file": str(_path())}
