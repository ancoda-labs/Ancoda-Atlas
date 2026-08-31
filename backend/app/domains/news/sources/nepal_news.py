"""Nepal disaster news — hazard-scoped RSS fan-out with per-topic ranking.

Every topic here is a natural hazard, its impact, or the response to it. A
global hazard gate runs on top of the per-topic rules, so an off-topic headline
that slips through a Google News query never reaches a panel.

The national dailies are read directly rather than through a search wrapper: a
Google News query returns a redirect stub and a truncated title, while the
outlet's own feed returns the headline as filed, the publication time, and
usually a photograph. For district-level flood reporting — most of what matters
here, much of which never reaches an English wire — that difference is the
whole story.

Runnable alone:  python -m app.domains.news.sources.nepal_news flood 24h
"""

import asyncio
import re
from datetime import datetime, timezone
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from app.core.http import now_iso, safe_fetch
from app.core.logging import get_logger
from app.domains.news.feeds import (
    HAZARD_GATE_TERMS,
    LOCAL_SOURCE_HINTS,
    NEPAL_CONTEXT_TERMS,
    NEPAL_SOURCES,
    TOPIC_FALLBACKS,
    TOPIC_MIN_ITEMS,
    TOPIC_RELEVANCE_RULES,
)

log = get_logger(__name__)

SUPPORTED_TOPICS = {
    "all", "disaster", "earthquake", "flood", "weather",
    "wildfire", "airquality", "climate", "relief",
}
DEFAULT_TOPIC = "all"

SUPPORTED_WINDOWS = {"1h", "6h", "24h", "48h", "7d", "all"}
WINDOW_TO_GOOGLE_WHEN = {
    "1h": "when:1h",
    "6h": "when:6h",
    "24h": "when:1d",
    "48h": "when:2d",
    "7d": "when:7d",
}
WINDOW_MS = {
    "1h": 3600_000,
    "6h": 6 * 3600_000,
    "24h": 24 * 3600_000,
    "48h": 48 * 3600_000,
    "7d": 7 * 24 * 3600_000,
}

FEED_TIMEOUT_S = 12.0
DEFAULT_LIMIT = 60
MAX_LIMIT = 120
DEFAULT_SOURCE_CAP = 20
MIN_TOPIC_ITEMS = 12

FEED_HEADERS = {
    "User-Agent": "AncodaAtlas-NepalHazardFeed/1.0",
    "Accept": "application/rss+xml, application/xml, text/xml, */*",
    "Accept-Language": "en-US,en;q=0.9,ne;q=0.8",
}


# ─── XML parsing ─────────────────────────────────────────────────────────────

_CDATA = re.compile(r"<!\[CDATA\[([\s\S]*?)\]\]>")


def decode_xml(value: Any) -> str:
    text = _CDATA.sub(r"\1", str(value))
    for entity, char in (
        ("&lt;", "<"), ("&gt;", ">"), ("&quot;", '"'), ("&apos;", "'"), ("&amp;", "&"),
    ):
        text = text.replace(entity, char)
    return text.strip()


def parse_date_ms(value: str | None) -> float:
    """A feed's timestamp in epoch milliseconds, or now if it is unreadable.

    Defaulting to now rather than dropping the item: several Nepali portals ship
    a malformed or absent pubDate, and losing their district reporting over a
    date format is a far worse outcome than showing it as recent.
    """
    if not value:
        return datetime.now(timezone.utc).timestamp() * 1000
    from email.utils import parsedate_to_datetime

    for parser in (parsedate_to_datetime, datetime.fromisoformat):
        try:
            parsed = parser(value.replace("Z", "+00:00") if parser is datetime.fromisoformat else value)
        except (TypeError, ValueError, IndexError):
            continue
        if parsed is None:
            continue
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.timestamp() * 1000
    return datetime.now(timezone.utc).timestamp() * 1000


def extract_tag(block: str, tag: str) -> str:
    match = re.search(rf"<{tag}(?:\s[^>]*)?>([\s\S]*?)</{tag}>", block, re.I)
    return decode_xml(match.group(1)) if match else ""


_IMAGE_PATTERNS = [
    re.compile(r"<media:thumbnail[^>]*\burl=[\"']([^\"']+)[\"']", re.I),
    re.compile(r"<media:content[^>]*\burl=[\"']([^\"']+)[\"']", re.I),
    re.compile(r"<enclosure[^>]*\burl=[\"']([^\"']+)[\"'][^>]*type=[\"']image/", re.I),
    re.compile(r"<enclosure[^>]*type=[\"']image/[^\"']*[\"'][^>]*\burl=[\"']([^\"']+)[\"']", re.I),
    re.compile(r"<img[^>]*\bsrc=[\"']([^\"']+)[\"']", re.I),
]
_FURNITURE = re.compile(r"\b(logo|icon|avatar|pixel|blank|spacer)\b", re.I)


def extract_image(block: str) -> str | None:
    """The lead photograph, if the feed offers one.

    Outlets advertise it four different ways and no two Nepali portals agree:
    Ratopati uses media:thumbnail, Nagarik embeds an <img> in the body, others
    use media:content or an enclosure. All four are tried in order of how likely
    they are to be the article's lead image rather than a logo.

    Returned as published — Atlas never copies the file. It is served through
    the signed proxy at request time, so the outlet keeps its bytes.
    """
    for pattern in _IMAGE_PATTERNS:
        match = pattern.search(block)
        if not match:
            continue
        url = decode_xml(match.group(1))
        if not re.match(r"^https?://", url, re.I):
            continue
        # Tracking pixels and the outlet's own logo are not the story.
        if _FURNITURE.search(url):
            continue
        return url
    return None


_ITEM = re.compile(r"<item\b[\s\S]*?</item>", re.I)
_ENTRY = re.compile(r"<entry\b[\s\S]*?</entry>", re.I)
_ATOM_LINK = re.compile(r"<link[^>]*href=[\"']([^\"']+)[\"'][^>]*/?\s*>", re.I)


def parse_rss_items(xml: str, fallback_source: str) -> list[dict[str, Any]]:
    items = []
    for block in _ITEM.findall(xml):
        title = extract_tag(block, "title")
        link = extract_tag(block, "link")
        if not title or not link:
            continue
        items.append(
            {
                "title": title,
                "link": link,
                "source": extract_tag(block, "source") or fallback_source,
                "pubDate": parse_date_ms(
                    extract_tag(block, "pubDate")
                    or extract_tag(block, "dc:date")
                    or extract_tag(block, "updated")
                ),
                "image": extract_image(block),
            }
        )
    if items:
        return items

    # Atom, for the feeds that publish it instead.
    for block in _ENTRY.findall(xml):
        title = extract_tag(block, "title")
        href = _ATOM_LINK.search(block)
        link = decode_xml(href.group(1)) if href else extract_tag(block, "link")
        if not title or not link:
            continue
        items.append(
            {
                "title": title,
                "link": link,
                "source": extract_tag(block, "source") or fallback_source,
                "pubDate": parse_date_ms(
                    extract_tag(block, "published")
                    or extract_tag(block, "updated")
                    or extract_tag(block, "dc:date")
                ),
                "image": extract_image(block),
            }
        )
    return items


# ─── Keyword matching ────────────────────────────────────────────────────────

DEVANAGARI = re.compile(r"[ऀ-ॿ]")
_boundary_cache: dict[str, re.Pattern[str] | None] = {}


def _matcher(keyword: str) -> re.Pattern[str] | None:
    """Short Latin keywords match on word boundaries; Devanagari does not.

    Substring matching turns 'rain' into a hit on "training", 'fire' into one on
    "firefighter" and 'heat' into one on "wheat". But Nepali attaches case
    suffixes directly to the noun, so a boundary match would miss "रसुवामा" for
    "रसुवा".
    """
    key = keyword.lower()
    if key not in _boundary_cache:
        _boundary_cache[key] = (
            None
            if DEVANAGARI.search(key)
            else re.compile(rf"(?:^|[^a-z0-9]){re.escape(key)}(?![a-z0-9])", re.I)
        )
    return _boundary_cache[key]


def matches_keyword(text: str, keyword: str) -> bool:
    pattern = _matcher(keyword)
    return bool(pattern.search(text)) if pattern else keyword.lower() in text


def count_keyword_matches(text: str, keywords: list[str]) -> int:
    return sum(1 for k in keywords if matches_keyword(text, k))


def is_likely_local_source(source: str | None) -> bool:
    lower = str(source or "").lower()
    return any(hint in lower for hint in LOCAL_SOURCE_HINTS)


def is_hazard_item(item: dict[str, Any]) -> bool:
    """The gate every item passes, whatever the topic."""
    text = f"{item.get('title', '')} {item.get('link', '')}".lower()
    return any(matches_keyword(text, term) for term in HAZARD_GATE_TERMS)


def score_item_for_topic(item: dict[str, Any], topic: str) -> dict[str, Any]:
    rule = TOPIC_RELEVANCE_RULES.get(topic)
    if not rule:
        return {"score": 0, "includeMatches": 0, "nepalMatches": 0, "localSource": False}

    text = f"{item.get('title', '')} {item.get('source', '')} {item.get('link', '')}".lower()
    include_matches = count_keyword_matches(text, rule["include"])
    nepal_matches = count_keyword_matches(text, NEPAL_CONTEXT_TERMS)
    local_source = is_likely_local_source(item.get("source"))

    score = include_matches * 7 + nepal_matches * 4
    if local_source:
        score += 3
    # A hazard story with no Nepal marker and no Nepali byline is usually
    # coverage of a disaster somewhere else.
    if nepal_matches == 0 and not local_source:
        score -= 20
    if include_matches == 0:
        score -= 10

    return {
        "score": score,
        "includeMatches": include_matches,
        "nepalMatches": nepal_matches,
        "localSource": local_source,
    }


def rank_and_filter(items: list[dict[str, Any]], topic: str) -> list[dict[str, Any]]:
    hazard_only = [i for i in items if is_hazard_item(i)]

    if topic == "all":
        by_time = [
            i
            for i in hazard_only
            if count_keyword_matches(
                f"{i.get('title', '')} {i.get('source', '')} {i.get('link', '')}".lower(),
                NEPAL_CONTEXT_TERMS,
            )
            > 0
            or is_likely_local_source(i.get("source"))
        ]
        by_time.sort(key=lambda i: i["pubDate"], reverse=True)
        return by_time

    rule = TOPIC_RELEVANCE_RULES.get(topic)
    if not rule:
        return hazard_only

    scored = [{"item": i, **score_item_for_topic(i, topic)} for i in hazard_only]
    filtered = [
        e
        for e in scored
        if (e["nepalMatches"] > 0 or e["localSource"])
        and e["includeMatches"] > 0
        and e["score"] >= rule.get("minScore", 1)
    ]
    filtered.sort(key=lambda e: (e["score"], e["item"]["pubDate"]), reverse=True)
    return [e["item"] for e in filtered]


# ─── Source and window handling ──────────────────────────────────────────────


def get_sources_for_topic(topic: str) -> list[dict[str, str]]:
    if topic == "all":
        seen: set[str] = set()
        out = []
        for source in [s for group in NEPAL_SOURCES.values() for s in group]:
            if source["url"] in seen:
                continue
            seen.add(source["url"])
            out.append(source)
        return out
    return NEPAL_SOURCES.get(topic) or NEPAL_SOURCES["disaster"]


def dedupe_sources(sources: list[dict[str, str]]) -> list[dict[str, str]]:
    seen: set[str] = set()
    out = []
    for source in sources:
        url = source.get("url") or ""
        if not url or url in seen:
            continue
        seen.add(url)
        out.append(source)
    return out


def clamp_limit(limit: Any) -> int:
    try:
        value = int(limit)
    except (TypeError, ValueError):
        return DEFAULT_LIMIT
    return max(10, min(MAX_LIMIT, value))


def clamp_source_cap(value: Any) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return DEFAULT_SOURCE_CAP
    return max(1, min(50, parsed))


def normalize_window(window: Any) -> str:
    value = str(window or "all").lower()
    return value if value in SUPPORTED_WINDOWS else "all"


def window_cutoff(window: str, now_ms: float | None = None) -> float | None:
    now_ms = now_ms if now_ms is not None else datetime.now(timezone.utc).timestamp() * 1000
    span = WINDOW_MS.get(window)
    return None if span is None else now_ms - span


_WHEN = re.compile(r"\s+when:\d+[hdw]\b", re.I)


def with_window_adjusted_sources(
    sources: list[dict[str, str]], window: str
) -> list[dict[str, str]]:
    """Re-point each Google News query at the requested horizon."""
    if window == "all":
        return sources
    token = WINDOW_TO_GOOGLE_WHEN.get(window)
    if not token:
        return sources

    out = []
    for source in sources:
        if "news.google.com/rss/search?" not in source["url"]:
            out.append(source)
            continue
        try:
            parsed = urlparse(source["url"])
            params = dict(parse_qsl(parsed.query, keep_blank_values=True))
            query = _WHEN.sub("", params.get("q", "")).strip()
            params["q"] = f"{query} {token}".strip()
            out.append({**source, "url": urlunparse(parsed._replace(query=urlencode(params)))})
        except ValueError:
            out.append(source)
    return out


def dedupe_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    out = []
    for item in items:
        key = f"{item['link']}|{item['title']}"
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def apply_source_cap(items: list[dict[str, Any]], cap: int) -> list[dict[str, Any]]:
    """No single outlet may fill a panel."""
    counts: dict[str, int] = {}
    out = []
    for item in items:
        key = item.get("source") or "unknown"
        if counts.get(key, 0) >= cap:
            continue
        counts[key] = counts.get(key, 0) + 1
        out.append(item)
    return out


def apply_window_filter(
    items: list[dict[str, Any]], cutoff: float | None
) -> list[dict[str, Any]]:
    if cutoff is None:
        return items
    return [i for i in items if i["pubDate"] >= cutoff]


async def _fetch_one(source: dict[str, str]) -> list[dict[str, Any]]:
    xml = await safe_fetch(
        source["url"], as_="text", timeout=FEED_TIMEOUT_S, retries=0, headers=FEED_HEADERS
    )
    if not isinstance(xml, str):
        return []
    return parse_rss_items(xml, source["name"])


async def fetch_aggregated_items(sources: list[dict[str, str]]) -> list[dict[str, Any]]:
    results = await asyncio.gather(
        *(_fetch_one(s) for s in sources), return_exceptions=True
    )
    out: list[dict[str, Any]] = []
    for result in results:
        if isinstance(result, list):
            out.extend(result)
    return out


def compact_item(item: dict[str, Any]) -> dict[str, Any]:
    moment = datetime.fromtimestamp(item["pubDate"] / 1000, tz=timezone.utc)
    return {
        "title": item["title"],
        "link": item["link"],
        "source": item["source"],
        "pubDate": f"{moment:%Y-%m-%dT%H:%M:%S}.{moment.microsecond // 1000:03d}Z",
        "image": item.get("image"),
    }


async def fetch_topic_news(
    topic: str = DEFAULT_TOPIC,
    window: str = "24h",
    limit: int = DEFAULT_LIMIT,
    source_cap: int | None = None,
) -> dict[str, Any]:
    """Ranked, deduplicated hazard news for one topic."""
    requested = str(topic or DEFAULT_TOPIC).lower()
    topic = requested if requested in SUPPORTED_TOPICS else DEFAULT_TOPIC
    window = normalize_window(window)
    cutoff = window_cutoff(window)
    limit = clamp_limit(limit)
    cap = clamp_source_cap(source_cap)

    primary_set = dedupe_sources(get_sources_for_topic(topic))
    primary = with_window_adjusted_sources(primary_set, window)

    def respond(items: list[dict[str, Any]], mode: str) -> dict[str, Any]:
        return {
            "topic": topic,
            "window": window,
            "mode": mode,
            "timestamp": now_iso(),
            "count": len(items),
            "items": [compact_item(i) for i in items],
        }

    try:
        aggregated = apply_window_filter(await fetch_aggregated_items(primary), cutoff)
        ranked = rank_and_filter(dedupe_items(aggregated), topic)

        if topic != "all":
            target = TOPIC_MIN_ITEMS.get(topic, MIN_TOPIC_ITEMS)
            primary_urls = {s["url"] for s in primary}

            for fallback_topic in TOPIC_FALLBACKS.get(topic, ["disaster"]):
                if len(ranked) >= target:
                    break
                fallback_sources = [
                    s
                    for s in with_window_adjusted_sources(
                        dedupe_sources(get_sources_for_topic(fallback_topic)), window
                    )
                    if s["url"] not in primary_urls
                ]
                if not fallback_sources:
                    continue
                aggregated = apply_window_filter(
                    aggregated + await fetch_aggregated_items(fallback_sources), cutoff
                )
                ranked = rank_and_filter(dedupe_items(aggregated), topic)

            if not ranked and window != "all":
                # Hazard topics go quiet for long stretches, which is the normal
                # state. Widen the horizon before showing an empty panel — but
                # never relax the hazard or Nepal gates to fill it.
                extended = await fetch_aggregated_items(
                    with_window_adjusted_sources(primary_set, "all")
                )
                ranked = rank_and_filter(dedupe_items(aggregated + extended), topic)

        final = dedupe_items(ranked)
        final.sort(key=lambda i: i["pubDate"], reverse=True)
        return respond(apply_source_cap(final, cap)[:limit], "normal")

    except Exception as exc:  # noqa: BLE001
        log.warning("news_aggregation_failed", error=str(exc))
        try:
            # Emergency path: best-effort hazard headlines rather than an empty
            # panel. The gates still apply.
            emergency = apply_window_filter(
                await fetch_aggregated_items(
                    with_window_adjusted_sources(get_sources_for_topic("disaster"), window)
                ),
                cutoff,
            )
            deduped = [i for i in dedupe_items(emergency) if is_hazard_item(i)]
            deduped.sort(key=lambda i: i["pubDate"], reverse=True)
            return respond(deduped[: min(limit, 30)], "fallback")
        except Exception as fallback_exc:  # noqa: BLE001
            log.warning("news_fallback_failed", error=str(fallback_exc))
            return respond([], "empty")


if __name__ == "__main__":
    import json
    import sys

    result = asyncio.run(
        fetch_topic_news(
            topic=sys.argv[1] if len(sys.argv) > 1 else "all",
            window=sys.argv[2] if len(sys.argv) > 2 else "24h",
            limit=15,
        )
    )
    print(json.dumps(result, indent=2, ensure_ascii=False))
