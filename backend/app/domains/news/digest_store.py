"""Persistence and scheduling for the ten-minute news digests.

digest.py writes one brief; this decides which briefs are missing, gets them
written, and reads them back. Two rules shape it:

  Windows with no reporting are not stored. A timeline of "nothing arrived"
  rows every ten minutes buries the windows where something did.

  Catch-up never blocks a request. If nobody opens the page for two hours, the
  visitor who finally does gets the briefs that exist immediately, and the
  backlog fills in behind them rather than holding the response open for as
  many model calls as the gap is wide.
"""

import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from app.core.logging import get_logger
from app.core.supabase import iso_timestamp, require_db
from app.domains.ai.providers.factory import get_provider
from app.domains.news.digest import bucket_end_for, bucket_start_for, draft_digest

log = get_logger(__name__)

# Windows to fill in one catch-up pass. Bounds a cold start's model spend.
MAX_CATCHUP_BUCKETS = 3
# How far back a catch-up will look for gaps.
LOOKBACK_BUCKETS = 12
# Floor between passes, so a burst of readers triggers one run.
CATCHUP_COOLDOWN_S = 60

SELECT_COLUMNS = (
    "id, bucket_start, bucket_end, lang, headline, summary, bullets, sources, "
    "item_count, generator, model"
)

_run_lock = asyncio.Lock()
_running = False
_last_run: float = 0.0


def _as_string_list(value: Any) -> list[str]:
    """jsonb arrives parsed, but rows written by an older build stored text.

    Without the string branch the array check below would quietly see a string,
    fail, and return empty — bullets and sources would vanish rather than error.
    """
    if isinstance(value, str):
        import json

        try:
            value = json.loads(value)
        except ValueError:
            return []
    return [v for v in value if isinstance(v, str)] if isinstance(value, list) else []


def _as_sources(value: Any) -> list[dict[str, str]]:
    if isinstance(value, str):
        import json

        try:
            value = json.loads(value)
        except ValueError:
            return []
    if not isinstance(value, list):
        return []
    out = []
    for entry in value:
        if not isinstance(entry, dict):
            continue
        if all(isinstance(entry.get(k), str) for k in ("title", "url", "source")):
            out.append(
                {"title": entry["title"], "url": entry["url"], "source": entry["source"]}
            )
    return out


def _rows(response: Any) -> list[dict[str, Any]]:
    """PostgREST answers loosely typed JSON. Narrow once, at the boundary."""
    data = response.data
    return [r for r in data if isinstance(r, dict)] if isinstance(data, list) else []


def _text(value: Any) -> str | None:
    return value if isinstance(value, str) else None


def _to_digest(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "bucketStart": iso_timestamp(_text(row.get("bucket_start"))),
        "bucketEnd": iso_timestamp(_text(row.get("bucket_end"))),
        "lang": "ne" if row["lang"] == "ne" else "en",
        "headline": row["headline"],
        "summary": row["summary"],
        "bullets": _as_string_list(row.get("bullets")),
        "sources": _as_sources(row.get("sources")),
        "itemCount": row["item_count"],
        "generator": "llm" if row["generator"] == "llm" else "extractive",
        "model": row.get("model"),
    }


async def get_digests(lang: str = "en", limit: int = 12) -> list[dict[str, Any]]:
    db = await require_db()
    response = await (
        db.table("news_digests")
        .select(SELECT_COLUMNS)
        .eq("topic", "flood")
        .eq("lang", lang)
        .order("bucket_start", desc=True)
        .limit(min(max(limit, 1), 48))
        .execute()
    )
    return [_to_digest(row) for row in _rows(response)]


async def _existing_bucket_keys() -> set[str]:
    """Bucket starts already written, for either language, within the lookback.

    Keyed on the NORMALISED timestamp, because the caller builds its side of
    this comparison from an ISO string with a Z and Postgres hands back the
    same instant spelled +00:00. Unnormalised, no window would ever look
    written and every pass would re-draft the whole lookback.
    """
    since = (datetime.now(timezone.utc) - timedelta(hours=6)).isoformat()
    db = await require_db()
    response = await (
        db.table("news_digests")
        .select("bucket_start, lang")
        .eq("topic", "flood")
        .gt("bucket_start", since)
        .execute()
    )
    return {
        f"{iso_timestamp(_text(row.get('bucket_start')))}|{row.get('lang')}"
        for row in _rows(response)
    }


def _window_label(start: datetime, end: datetime) -> str:
    from zoneinfo import ZoneInfo

    kathmandu = ZoneInfo("Asia/Kathmandu")
    return (
        f"{start.astimezone(kathmandu):%H:%M}–{end.astimezone(kathmandu):%H:%M} Nepal time"
    )


async def _write_digest(
    start: datetime, end: datetime, lang: str, items: list[dict[str, Any]]
) -> None:
    result = await draft_digest(get_provider(), items, lang, _window_label(start, end))
    draft = result["draft"]
    sources = [
        {"title": i["title"], "url": i["link"], "source": i["source"]} for i in items[:8]
    ]

    db = await require_db()
    await (
        db.table("news_digests")
        .upsert(
            {
                "id": str(uuid.uuid4()),
                "topic": "flood",
                "bucket_start": start.isoformat(),
                "bucket_end": end.isoformat(),
                "lang": lang,
                "headline": draft["headline"],
                "summary": draft["summary"],
                # jsonb columns: pass the values, not serialized text, or they
                # land as a quoted string that reads back as a string.
                "bullets": draft["bullets"],
                "sources": sources,
                "item_count": len(items),
                "generator": result["generator"],
                "model": result["model"],
            },
            # Two readers arriving at once can both decide a window is missing.
            # The loser of that race should leave the existing brief alone
            # rather than pay for a second model call's worth of overwrite.
            on_conflict="topic,bucket_start,lang",
            ignore_duplicates=True,
        )
        .execute()
    )


async def run_catchup() -> int:
    """Fill any missing windows. Returns how many were written."""
    from app.domains.news.sources.nepal_news import fetch_topic_news

    news = await fetch_topic_news(topic="flood", window="6h", limit=120, source_cap=12)

    # Each item belongs to exactly one window, decided by when it was
    # published, so no story is summarised into two consecutive briefs.
    by_bucket: dict[str, list[dict[str, Any]]] = {}
    for item in news.get("items") or []:
        try:
            published = datetime.fromisoformat(item["pubDate"].replace("Z", "+00:00"))
        except (ValueError, KeyError, AttributeError):
            continue
        key = bucket_start_for(published).isoformat()
        by_bucket.setdefault(key, []).append(item)

    existing = await _existing_bucket_keys()
    now = datetime.now(timezone.utc)

    # Newest closed window first: the brief a reader is waiting for is the last.
    candidates = sorted(
        (
            start
            for start in (datetime.fromisoformat(k) for k in by_bucket)
            # Still open — more may arrive, and a half-window brief would be
            # rewritten ten minutes later saying something different.
            if bucket_end_for(start) <= now
            and (now - start) < timedelta(minutes=LOOKBACK_BUCKETS * 10)
        ),
        reverse=True,
    )

    written = 0
    for start in candidates:
        if written >= MAX_CATCHUP_BUCKETS:
            break
        items = by_bucket.get(start.isoformat()) or []
        if not items:
            continue

        langs = [
            lang
            for lang in ("en", "ne")
            if f"{iso_timestamp(start.isoformat())}|{lang}" not in existing
        ]
        if not langs:
            continue

        end = bucket_end_for(start)
        # Both languages for one window go together; the windows themselves are
        # sequential so a slow model cannot fan out into a dozen parallel calls.
        await asyncio.gather(*(_write_digest(start, end, lang, items) for lang in langs))
        written += 1

    if written:
        log.info("digest_windows_written", count=written)
    return written


async def schedule_catchup() -> None:
    """Start a catch-up if one is not running and the cooldown has passed.

    Deliberately fire-and-forget — see the note at the top of the module.
    """
    global _running, _last_run

    import time

    async with _run_lock:
        if _running:
            return
        if _last_run and (time.monotonic() - _last_run) < CATCHUP_COOLDOWN_S:
            return
        _last_run = time.monotonic()
        _running = True

    async def run() -> None:
        global _running
        try:
            await run_catchup()
        except Exception as exc:  # noqa: BLE001
            log.warning("digest_catchup_failed", error=str(exc))
        finally:
            _running = False

    asyncio.create_task(run())
