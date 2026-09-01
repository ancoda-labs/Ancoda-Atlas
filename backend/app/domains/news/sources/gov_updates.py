"""nepal.gov.np — the government publishing its own operational updates.

The national portal grew an updates feed, and the same JSON its page reads is
open at /api/updates. Ministries and the Office of the Prime Minister post to
it directly: district administration notices, relief-fund decisions, telecom
restoration logs, search-and-rescue tallies — often hours before any of it
reaches a wire, and much of it never reaching one at all.

This is a primary source, which is exactly why it needs three guards.

FILTERING. The feed is the whole government, not the disaster. A career
guidance directive from the Education ministry sits between two flood
sitreps. Every post therefore passes the same hazard gate the news wire
applies, so an administrative circular can never land on a hazard page.

NO TRANSLATION. Most posts are Nepali only. Paragraphs are filed under the
script they are written in, and a language the government did not publish
comes back None rather than a copy of the other one. The page falls back on
its own; the payload stays honest about who wrote what.

ATTRIBUTION, NOT BYLINES. The publishing ministry travels with every post. The
named official who typed it does not — the department is what makes the post
official and what a reader needs in order to weigh it.

Figures are not parsed out of these posts. A sentence saying a billion rupees
was released is quoted as the government's sentence; it never becomes a
counter on the desk. Several posts carry their substance as a photograph of a
printed notice, which is why the images travel with the text rather than being
summarised away.

Runnable alone:  python -m app.domains.news.sources.gov_updates week
"""

import re
from typing import Any

from app.core.http import is_error, now_iso, safe_fetch
from app.core.logging import get_logger
from app.domains.news.feeds import HAZARD_GATE_TERMS, TOPIC_RELEVANCE_RULES
from app.domains.news.sources.nepal_news import (
    DEVANAGARI,
    count_keyword_matches,
    matches_keyword,
)

log = get_logger(__name__)

BASE = "https://nepal.gov.np"
UA = (
    "AncodaAtlas/4.0 (Nepal hazard monitoring; "
    "+https://github.com/ancoda-labs/Ancoda-Atlas)"
)
HEADERS = {"Accept": "application/json", "User-Agent": UA}
TIMEOUT_S = 20.0
SOURCE = {"label": "Government of Nepal updates portal", "url": f"{BASE}/updates"}

# The portal's own filter values. An unrecognised one is not rejected upstream
# — it is quietly treated as the default view, which would narrow the window
# without saying so — so the value is checked here instead.
WINDOWS = {"hour", "today", "yesterday", "week", "month", "year", "latest"}
DEFAULT_WINDOW = "week"

# The feed answers ten at a time behind a cursor. Three pages covers a heavy
# day of ministry posting; past that the desk is paging through history it has
# already shown.
MAX_PAGES = 3

# Only what the portal has cleared. Anything else is a draft someone inside a
# ministry is still writing.
PUBLISHED = "APPROVED"

LATIN = re.compile(r"[A-Za-z]")
_IMAGE_MIME = re.compile(r"^image/", re.I)

# What counts as the government having actually published an English version.
#
# A Latin line under a Nepali post is usually a signature, an office name or a
# shared link rather than a translation. Reporting that as the English version
# is worse than reporting none: the page prefers English when it has it, so an
# English reader would be shown "National Disaster Risk Reduction & Management
# Authority" in place of a post saying which valley was told to evacuate. The
# English side therefore has to carry a real share of what the Nepali says.
MIN_ENGLISH_SHARE = 0.6
MIN_ENGLISH_CHARS = 40

# The order topics are tried in when a post matches more than one. Deliberately
# not the order they appear in the wire's rule table — see classify_topic.
TOPIC_ORDER = [
    "flood",
    "earthquake",
    "wildfire",
    "airquality",
    "climate",
    "weather",
    "relief",
]


def text(value: Any) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def is_nepali(value: str) -> bool:
    return len(DEVANAGARI.findall(value)) >= len(LATIN.findall(value))


def is_hazard_post(title: str | None, body: str | None) -> bool:
    """The news wire's gate, applied to a post's own words."""
    haystack = f"{title or ''} {body or ''}".lower()
    return any(matches_keyword(haystack, term) for term in HAZARD_GATE_TERMS)


def classify_topic(title: str | None, body: str | None) -> str | None:
    """Which hazard a post is about, so a page can tell one from another.

    The gate above only answers "is this a hazard at all", which is not enough
    on a page about one event: a Mahakali warning and a Bhotekoshi sitrep both
    clear it, and shown together the first reads as though it were about the
    second.

    Scored against the same term lists the news wire ranks headlines with, so a
    ministry post and a newspaper report about the same event land on the same
    topic. Ties go to the earlier topic, which is why `relief` is last —
    virtually every hazard post also mentions rescue or relief, so it is the
    answer only when nothing more specific fits.
    """
    haystack = f"{title or ''} {body or ''}".lower()
    best: str | None = None
    best_score = 0
    for topic in TOPIC_ORDER:
        rule = TOPIC_RELEVANCE_RULES.get(topic) or {}
        score = count_keyword_matches(haystack, rule.get("include") or [])
        if score > best_score:
            best, best_score = topic, score
    return best


def split_title(raw: Any) -> dict[str, str | None]:
    """A headline belongs to the language it was written in, whole.

    Titles here are single lines, and a mixed one carries the Nepali and the
    English saying the same thing rather than two halves worth separating.
    """
    title = text(raw)
    if not title:
        return {"title": None, "titleNe": None}
    nepali = is_nepali(title)
    return {"title": None if nepali else title, "titleNe": title if nepali else None}


def is_english_version(english: list[str], nepali: list[str]) -> bool:
    """Whether the Latin lines are a translation or just a letterhead."""
    english_chars = sum(len(line) for line in english)
    if english_chars < MIN_ENGLISH_CHARS:
        return False
    nepali_chars = sum(len(line) for line in nepali)
    return not nepali_chars or english_chars >= nepali_chars * MIN_ENGLISH_SHARE


def split_body(raw: Any) -> dict[str, str | None]:
    """File each line under the alphabet it is written in.

    Line breaks are kept rather than collapsed into paragraphs: these posts are
    frequently lists — restored telecom sites, shelters opened, roads cleared —
    and a run of short lines is the shape of the information.

    When the Latin lines do not amount to a translation they stay where the
    government put them, inside the Nepali text, rather than being dropped or
    promoted into an English version that says something else.
    """
    source = text(raw)
    if not source:
        return {"en": None, "ne": None}

    lines = [line.strip() for line in re.split(r"\r\n|\r|\n", source) if line.strip()]
    if not lines:
        return {"en": None, "ne": None}

    english = [line for line in lines if not is_nepali(line)]
    nepali = [line for line in lines if is_nepali(line)]

    if not is_english_version(english, nepali):
        return {"en": None, "ne": "\n".join(lines)}

    return {"en": "\n".join(english), "ne": "\n".join(nepali) or None}


def split_attachments(update_id: str, rows: Any) -> tuple[list[Any], list[Any]]:
    """A post's files, split into pictures and everything else.

    Both are served behind the post's own id, so an attachment id on its own
    does not address a file. The image URL is handed on raw for the cycle to
    sign — the key lives there, not here.
    """
    images: list[dict[str, Any]] = []
    documents: list[dict[str, Any]] = []

    for row in rows if isinstance(rows, list) else []:
        if not isinstance(row, dict):
            continue
        file_id = text(row.get("id"))
        if not file_id:
            continue
        url = f"{BASE}/api/updates/{update_id}/attachments/{file_id}"
        mime = text(row.get("mimeType"))
        entry = {"filename": text(row.get("filename")), "mimeType": mime}
        if mime and _IMAGE_MIME.match(mime):
            images.append({**entry, "image": url})
        else:
            documents.append({**entry, "url": url})

    return images, documents


def compact(row: Any) -> dict[str, Any] | None:
    """One post, or None if it is unapproved, unusable or not about a hazard."""
    if not isinstance(row, dict):
        return None

    update_id = text(row.get("id"))
    if not update_id or row.get("status") != PUBLISHED:
        return None

    raw_title = text(row.get("title"))
    raw_body = text(row.get("content"))
    if not raw_title and not raw_body:
        return None
    if not is_hazard_post(raw_title, raw_body):
        return None

    body = split_body(raw_body)
    images, documents = split_attachments(update_id, row.get("attachments"))
    author = row.get("author")

    return {
        "id": update_id,
        **split_title(raw_title),
        "bodyEn": body["en"],
        "bodyNe": body["ne"],
        "topic": classify_topic(raw_title, raw_body),
        "ministry": text(author.get("department")) if isinstance(author, dict) else None,
        "publishedAt": text(row.get("createdAt")),
        "link": f"{BASE}/updates/{update_id}",
        "images": images,
        "documents": documents,
    }


async def _page(window: str, cursor: str | None) -> dict[str, Any]:
    params: dict[str, Any] = {"time": window}
    if cursor:
        params["cursor"] = cursor

    body = await safe_fetch(
        f"{BASE}/api/updates",
        params=params,
        timeout=TIMEOUT_S,
        retries=1,
        headers=HEADERS,
    )
    if is_error(body):
        raise RuntimeError(body.error)
    if not isinstance(body, dict):
        raise RuntimeError("the portal answered with something other than JSON")
    return body


async def get_gov_updates(
    limit: int = 24, window: str = DEFAULT_WINDOW
) -> dict[str, Any]:
    """Hazard-scoped official posts, newest first."""
    fetched_at = now_iso()
    window = window if window in WINDOWS else DEFAULT_WINDOW
    limit = max(1, min(60, limit))

    items: list[dict[str, Any]] = []
    seen: set[str] = set()

    try:
        cursor: str | None = None
        for _ in range(MAX_PAGES):
            page = await _page(window, cursor)
            rows = page.get("items")
            for row in rows if isinstance(rows, list) else []:
                item = compact(row)
                # The portal has repeated a post across a cursor boundary while
                # something was published mid-read.
                if item and item["id"] not in seen:
                    seen.add(item["id"])
                    items.append(item)
            cursor = text(page.get("nextCursor"))
            if not cursor or len(items) >= limit:
                break
    except Exception as exc:  # noqa: BLE001
        log.warning("gov_updates_unavailable", error=str(exc))
        return {
            "items": [],
            "error": str(exc) or exc.__class__.__name__,
            "source": SOURCE,
            "fetchedAt": fetched_at,
        }

    items.sort(key=lambda i: i["publishedAt"] or "", reverse=True)
    return {
        "items": items[:limit],
        "error": None,
        "source": SOURCE,
        "fetchedAt": fetched_at,
    }


if __name__ == "__main__":
    import asyncio
    import json
    import sys

    result = asyncio.run(
        get_gov_updates(window=sys.argv[1] if len(sys.argv) > 1 else DEFAULT_WINDOW)
    )
    print(json.dumps(result, indent=2, ensure_ascii=False))
