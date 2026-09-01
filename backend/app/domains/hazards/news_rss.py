"""The disaster-filtered Nepali news wire the dashboard maps and tickers.

Split out of the synthesizer because it is the only part that reaches the
network, and the only part with a random element.

Why the news layer exists at all: the sensor feeds describe *conditions*. They
do not describe consequences. A flood that has already happened shows up as
casualties and rescue operations in the district press hours before it reaches
ReliefWeb, so this is the only layer that sees an event already under way.
"""

import asyncio
import random
import re
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlparse

from app.core.http import safe_fetch
from app.domains.hazards.keywords import GEO_KEYWORDS, HAZARD_TERMS

# ~0.05 degrees is roughly 5km at Nepal's latitude.
GEO_JITTER_DEG = 0.05

# Several Nepali feeds ship no <pubDate>. Sorting purely by recency buries them
# under the high-volume ones, so guarantee every outlet a few slots before
# recency decides the rest.
PER_SOURCE_RESERVE = 4

FEED_WINDOW_DAYS = 30
MAX_ITEMS = 50

FEEDS: list[tuple[str, str]] = [
    # English-language dailies
    ("https://kathmandupost.com/rss", "Kathmandu Post"),
    ("https://english.onlinekhabar.com/feed", "Online Khabar EN"),
    ("https://english.khabarhub.com/feed/", "Khabarhub"),
    ("https://nepalitimes.com/feed", "Nepali Times"),
    ("https://www.nepalnews.com/feed", "Nepal News"),
    # Nepali-language, high volume
    ("https://www.onlinekhabar.com/feed", "Online Khabar"),
    ("https://www.setopati.com/feed", "Setopati"),
    ("https://www.ratopati.com/feed", "Ratopati"),
]

# Every feed above is a Nepal outlet, so an untagged hazard headline still
# belongs on the map — fall back to the outlet's own city rather than dropping
# the item.
_KATHMANDU = (27.7172, 85.3240, "Kathmandu")
RSS_SOURCE_FALLBACKS: dict[str, tuple[float, float, str]] = {
    source: _KATHMANDU for _, source in FEEDS
}

DEVANAGARI = re.compile(r"[ऀ-ॿ]")


def _build_matchers() -> list[tuple[str, re.Pattern[str] | None]]:
    """Short Latin keywords match on word boundaries; Devanagari does not.

    Plain substring matching turns 'rain' into a hit on "training" and 'storm'
    into one on "brainstorm". But Nepali attaches case suffixes directly to the
    noun, so a boundary match would miss "बाढीले" for "बाढी".
    """
    matchers: list[tuple[str, re.Pattern[str] | None]] = []
    for term in HAZARD_TERMS:
        key = term.lower()
        if DEVANAGARI.search(key):
            matchers.append((key, None))
        else:
            matchers.append(
                (key, re.compile(rf"(?:^|[^a-z0-9]){re.escape(key)}(?![a-z0-9])", re.I))
            )
    return matchers


HAZARD_MATCHERS = _build_matchers()

URGENT = re.compile(
    r"earthquake|भूकम्प|flood|बाढी|landslide|पहिरो|evacuat|rescue|उद्धार", re.I
)


def is_hazard_text(text: str | None) -> bool:
    if not text:
        return False
    lowered = text.lower()
    return any(
        pattern.search(lowered) if pattern else key in lowered
        for key, pattern in HAZARD_MATCHERS
    )


def geo_tag_text(text: str | None) -> tuple[float, float, str] | None:
    """First match wins, so GEO_KEYWORDS ordering is load-bearing."""
    if not text:
        return None
    for keyword, entry in GEO_KEYWORDS.items():
        if keyword in text:
            return entry
    return None


def sanitize_external_url(raw: str | None) -> str | None:
    """Only http(s) survives. A feed carrying javascript: is not a link."""
    if not raw:
        return None
    try:
        parsed = urlparse(raw)
    except ValueError:
        return None
    return raw if parsed.scheme in ("http", "https") else None


_ITEM = re.compile(r"<item>(.*?)</item>", re.S)
_TITLE = re.compile(r"<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</title>", re.S)
_LINK = re.compile(r"<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</link>", re.S)
_PUBDATE = re.compile(r"<pubDate>(.*?)</pubDate>", re.S)


def parse_rss(xml: str, source: str) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for block in _ITEM.findall(xml):
        title_match = _TITLE.search(block)
        title = (title_match.group(1) if title_match else "").strip()
        link_match = _LINK.search(block)
        link = sanitize_external_url((link_match.group(1) if link_match else "").strip())
        date_match = _PUBDATE.search(block)
        pub_date = date_match.group(1) if date_match else ""
        # A <title> equal to the feed name is the channel title, not an item.
        if title and title != source:
            items.append({"title": title, "date": pub_date, "source": source, "url": link})
    return items


async def fetch_rss(url: str, source: str) -> list[dict[str, Any]]:
    xml = await safe_fetch(url, timeout=8.0, retries=0, as_="text")
    if not isinstance(xml, str):
        return []
    return parse_rss(xml, source)


def _parsed_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        from email.utils import parsedate_to_datetime

        parsed = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return None
    if parsed is None:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _sort_key(item: dict[str, Any]) -> datetime:
    return _parsed_date(item.get("date")) or datetime.min.replace(tzinfo=timezone.utc)


def _reserve_then_recency(
    items: list[dict[str, Any]], key: Any, limit: int = MAX_ITEMS
) -> list[dict[str, Any]]:
    """Give every outlet its reserved slots first, then let recency fill the rest."""
    selected: list[dict[str, Any]] = []
    seen: set[str] = set()

    def push(item: dict[str, Any]) -> None:
        identity = key(item)
        if identity in seen:
            return
        seen.add(identity)
        selected.append(item)

    for source in dict.fromkeys(item["source"] for item in items):
        for item in [i for i in items if i["source"] == source][:PER_SOURCE_RESERVE]:
            push(item)
    for item in items:
        push(item)
    return selected[:limit]


async def fetch_all_news(jitter: bool = True) -> list[dict[str, Any]]:
    results = await asyncio.gather(
        *(fetch_rss(url, source) for url, source in FEEDS), return_exceptions=True
    )
    all_news: list[dict[str, Any]] = []
    for result in results:
        if isinstance(result, list):
            all_news.extend(result)

    seen: set[str] = set()
    geo_news: list[dict[str, Any]] = []
    for item in all_news:
        if not is_hazard_text(item["title"]):
            continue
        # De-duplicate on a title prefix: outlets syndicate each other's copy
        # with small trailing edits.
        dedupe_key = item["title"][:40].lower()
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)

        geo = geo_tag_text(item["title"]) or RSS_SOURCE_FALLBACKS.get(item["source"])
        if not geo:
            continue
        lat, lon, region = geo
        # Small jitter so headlines sharing a city do not stack into one dot.
        # Kept to ~5km: on a country the size of Nepal a wider spread would
        # throw a Kathmandu story into the next province.
        offset_lat = (random.random() - 0.5) * GEO_JITTER_DEG if jitter else 0.0
        offset_lon = (random.random() - 0.5) * GEO_JITTER_DEG if jitter else 0.0
        geo_news.append(
            {
                "title": item["title"][:100],
                "source": item["source"],
                "date": item["date"],
                "url": item["url"],
                "lat": lat + offset_lat,
                "lon": lon + offset_lon,
                "region": region,
            }
        )

    cutoff = datetime.now(timezone.utc) - timedelta(days=FEED_WINDOW_DAYS)
    recent = [
        n for n in geo_news if not n["date"] or (_parsed_date(n["date"]) or cutoff) >= cutoff
    ]
    recent.sort(key=_sort_key, reverse=True)

    return _reserve_then_recency(
        recent, key=lambda i: f"{i['source']}|{i['title']}|{i['date']}"
    )


def build_news_feed(rss_news: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """The ticker's shape.

    Nepali-language headlines stay in: most first-hand hazard reporting from
    the districts is published in Nepali first.
    """
    feed = [
        {
            "headline": n["title"],
            "source": n["source"],
            "type": "rss",
            "timestamp": n["date"],
            "region": n["region"],
            "urgent": bool(URGENT.search(n["title"])),
            "url": n["url"],
        }
        for n in rss_news
    ]

    cutoff = datetime.now(timezone.utc) - timedelta(days=FEED_WINDOW_DAYS)
    recent = [
        f for f in feed if not f["timestamp"] or (_parsed_date(f["timestamp"]) or cutoff) >= cutoff
    ]
    recent.sort(key=lambda i: _parsed_date(i.get("timestamp")) or datetime.min.replace(tzinfo=timezone.utc), reverse=True)

    return _reserve_then_recency(
        recent,
        key=lambda i: f"{i['type']}|{i['source']}|{i['headline']}|{i['timestamp']}",
    )
