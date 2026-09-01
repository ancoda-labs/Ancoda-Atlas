"""Nepali broadcast video for the flood desk.

Television is where a lot of this coverage actually lives — a correspondent
standing where a bridge used to be says more than the wire copy about it — and
the Nepali channels put it on YouTube within the hour.

How Atlas reaches it, and why:

  EMBED, NEVER DOWNLOAD. Videos are shown in YouTube's own iframe player, so the
  outlet keeps its view count and its advertising. Nothing is copied to MinIO;
  that bucket is for photographs the public sent us and nothing else.

  The Data API when a key exists. YOUTUBE_API_KEY gives proper search, which is
  the only way to find relevant video across channels Atlas has not been told
  about.

  Channel pages and oEmbed when it does not. YouTube's old RSS endpoint answers
  404 now, so recent video ids are read off the channel page and each one's
  title, author and thumbnail come from the documented oEmbed endpoint rather
  than from scraped markup.
"""

import asyncio
import re
import time
from typing import Any, NamedTuple
from urllib.parse import quote

from app.core.config import settings
from app.core.http import is_error, now_iso, safe_fetch
from app.core.logging import get_logger

log = get_logger(__name__)

BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)


class Channel(NamedTuple):
    id: str
    name: str


# Nepali news channels, verified by channel id. Handles change and get
# squatted; ids do not.
DEFAULT_CHANNELS = [
    Channel("UC3yDoaqQzOd1bNP74ZrGPTA", "Kantipur TV HD"),
    Channel("UCo4cuctdb-1YdZNgWEVZGwA", "Onlinekhabar"),
    Channel("UCjG2HX7jfwqIjzTlaF1CPGA", "News24 Nepal"),
    Channel("UCg04d_B2CR0Di1rs7mSu6JQ", "Nepal News"),
]

# Nepali broadcasters only.
#
# The list used to carry Al Jazeera, DW, Republic World and India Global
# Review. A rolling international channel is almost never on this flood when a
# reader opens it — it is on whatever the world is covering that hour — so it
# took space from the broadcasters actually reporting from the corridor and
# lent a foreign anchor the authority of appearing on a Nepal flood desk.
LIVE_CHANNELS = [
    ("UC3yDoaqQzOd1bNP74ZrGPTA", "Kantipur TV HD Live", "Kantipur TV"),
    ("UCjG2HX7jfwqIjzTlaF1CPGA", "News24 Nepal Live", "News24"),
    ("UCo4cuctdb-1YdZNgWEVZGwA", "Onlinekhabar Live", "Onlinekhabar"),
    ("UCg04d_B2CR0Di1rs7mSu6JQ", "Nepal News Live", "Nepal News"),
]

# A video is only shown if its title says it is about this event. Broadcasters
# post everything to the same channel, and a flood desk carrying last night's
# football highlights would be worse than carrying no video at all.
RELEVANCE_TERMS = [
    "बाढी", "पहिरो", "रसुवा", "भोटेकोशी", "त्रिशूली", "उद्धार", "राहत", "विपद्",
    "डुबान", "बगायो", "सखाप", "घाइते", "बेपत्ता", "तटबन्ध", "हिमताल", "लेन्डे",
    "नुवाकोट", "धादिङ", "तिमुरे", "स्याफ्रुबेसी", "धुन्चे", "बेत्रावती",
    "flood", "landslide", "rasuwa", "bhotekoshi", "bhote koshi", "trishuli",
    "rescue", "relief", "disaster", "washed away", "timure", "syafrubesi",
    "dhunche", "nuwakot", "dhading", "glof", "inundat",
]

TTL_S = 10 * 60
_cache: dict[str, tuple[float, Any]] = {}

_VIDEO_ID = re.compile(r'"videoId":"([A-Za-z0-9_-]{11})"')
_CANONICAL = re.compile(
    r'<link rel="canonical" href="https://www\.youtube\.com/watch\?v=([A-Za-z0-9_-]{11})">'
)


async def _cached(key: str, loader: Any) -> Any:
    hit = _cache.get(key)
    if hit and (time.monotonic() - hit[0]) < TTL_S:
        return hit[1]
    value = await loader()
    _cache[key] = (time.monotonic(), value)
    return value


def is_relevant(text: str | None) -> bool:
    lower = str(text or "").lower()
    return any(term.lower() in lower for term in RELEVANCE_TERMS)


async def get_channel_video_ids(channel_id: str, limit: int = 25) -> list[str]:
    """Recent video ids from a channel's uploads page.

    Only the eleven-character ids are taken — no titles, no descriptions,
    nothing that oEmbed will give authoritatively a moment later.
    """
    html = await safe_fetch(
        f"https://www.youtube.com/channel/{channel_id}/videos",
        as_="text",
        timeout=20.0,
        retries=0,
        headers={"User-Agent": BROWSER_UA, "Accept-Language": "ne,en;q=0.8"},
    )
    if not isinstance(html, str):
        raise RuntimeError("YouTube channel page unavailable")

    ids: list[str] = []
    seen: set[str] = set()
    for match in _VIDEO_ID.finditer(html):
        video_id = match.group(1)
        if video_id in seen:
            continue
        seen.add(video_id)
        ids.append(video_id)
        if len(ids) >= limit:
            break
    return ids


async def get_video_meta(video_id: str) -> dict[str, Any] | None:
    """Title, author and thumbnail, from YouTube's documented oEmbed endpoint."""

    async def load() -> dict[str, Any] | None:
        target = quote(f"https://www.youtube.com/watch?v={video_id}", safe="")
        data = await safe_fetch(
            f"https://www.youtube.com/oembed?url={target}&format=json",
            timeout=12.0,
            retries=1,
        )
        if is_error(data) or not isinstance(data, dict) or not data.get("title"):
            return None
        return {
            "id": video_id,
            "title": data["title"],
            "channel": data.get("author_name"),
            "channelUrl": data.get("author_url"),
            "thumbnail": data.get("thumbnail_url")
            or f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
            "url": f"https://www.youtube.com/watch?v={video_id}",
            # nocookie: the reader has not asked YouTube for anything yet.
            "embedUrl": f"https://www.youtube-nocookie.com/embed/{video_id}",
            "publishedAt": None,
        }

    return await _cached(f"meta:{video_id}", load)


async def search_via_api(query: str, limit: int) -> list[dict[str, Any]]:
    """Search, when a Data API key is configured. Empty list when it is not."""
    key = settings.YOUTUBE_API_KEY
    if not key:
        return []

    data = await safe_fetch(
        "https://www.googleapis.com/youtube/v3/search",
        timeout=15.0,
        params={
            "part": "snippet",
            "q": query,
            "type": "video",
            "order": "date",
            "maxResults": min(limit, 50),
            "relevanceLanguage": "ne",
            "regionCode": "NP",
            "key": key,
        },
    )
    if is_error(data) or not isinstance(data, dict) or data.get("error"):
        log.warning("youtube_search_failed")
        return []

    out = []
    for item in data.get("items") or []:
        video_id = (item.get("id") or {}).get("videoId")
        if not video_id:
            continue
        snippet = item.get("snippet") or {}
        channel_id = snippet.get("channelId")
        thumbnails = snippet.get("thumbnails") or {}
        out.append(
            {
                "id": video_id,
                "title": snippet.get("title") or "",
                "channel": snippet.get("channelTitle"),
                "channelUrl": f"https://www.youtube.com/channel/{channel_id}"
                if channel_id
                else None,
                "thumbnail": (thumbnails.get("high") or {}).get("url")
                or f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
                "url": f"https://www.youtube.com/watch?v={video_id}",
                "embedUrl": f"https://www.youtube-nocookie.com/embed/{video_id}",
                "publishedAt": snippet.get("publishedAt"),
            }
        )
    return out


async def get_live_video_id(channel_id: str) -> str | None:
    html = await safe_fetch(
        f"https://www.youtube.com/channel/{channel_id}/live",
        as_="text",
        timeout=10.0,
        retries=0,
        headers={"User-Agent": BROWSER_UA},
    )
    if not isinstance(html, str) or '"isLive":true' not in html:
        return None
    canonical = _CANONICAL.search(html)
    if canonical:
        return canonical.group(1)
    match = _VIDEO_ID.search(html)
    return match.group(1) if match else None


async def get_flood_videos(
    channels: list[Channel] | None = None,
    limit: int = 24,
    query: str = "रसुवा बाढी भोटेकोशी",
) -> dict[str, Any]:
    """Flood coverage from the Nepali broadcasters."""
    channels = channels or DEFAULT_CHANNELS
    fetched_at = now_iso()
    errors: list[str] = []

    async def live_for(entry: tuple[str, str, str]) -> dict[str, Any] | None:
        channel_id, title, channel_name = entry
        video_id = await get_live_video_id(channel_id)
        if not video_id:
            return None
        return {
            "id": video_id,
            "title": title,
            "channel": channel_name,
            "channelUrl": f"https://www.youtube.com/channel/{channel_id}",
            "thumbnail": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
            "url": f"https://www.youtube.com/watch?v={video_id}",
            "embedUrl": f"https://www.youtube.com/embed/{video_id}",
            "publishedAt": None,
        }

    api_results, id_lists, live_results = await asyncio.gather(
        search_via_api(query, limit),
        asyncio.gather(
            *(get_channel_video_ids(c.id) for c in channels), return_exceptions=True
        ),
        asyncio.gather(*(live_for(c) for c in LIVE_CHANNELS), return_exceptions=True),
    )

    live = [r for r in live_results if isinstance(r, dict)]

    ids: list[str] = []
    for channel, result in zip(channels, id_lists):
        if isinstance(result, list):
            ids.extend(result)
        else:
            errors.append(f"{channel.name}: {result}")

    # oEmbed is one request per video, so cap the fan-out and lean on the cache.
    unique_ids = list(dict.fromkeys(ids))[:60]
    metas: list[dict[str, Any]] = []
    concurrency = 8
    for i in range(0, len(unique_ids), concurrency):
        chunk = unique_ids[i : i + concurrency]
        settled = await asyncio.gather(
            *(get_video_meta(v) for v in chunk), return_exceptions=True
        )
        metas.extend(r for r in settled if isinstance(r, dict))

    # Search results first — they were matched on the query, not merely on
    # being recent — then channel uploads whose titles are about this event.
    seen: set[str] = set()
    videos: list[dict[str, Any]] = []
    for video in [*api_results, *metas]:
        if video["id"] in seen or not is_relevant(video["title"]):
            continue
        seen.add(video["id"])
        videos.append(video)
        if len(videos) >= limit:
            break

    return {
        "videos": videos,
        "live": live,
        "searchEnabled": bool(settings.YOUTUBE_API_KEY),
        "error": "; ".join(errors) if errors else None,
        "fetchedAt": fetched_at,
    }
