"""Reviewed climate-context facts.

Glacier, GLOF and ND-GAIN figures are not machine-readable. They live in
content/climate/source-facts.json with a source on every line. This module
loads that file and never fills a gap.
"""

import json
import time
from pathlib import Path
from typing import Any

from app.core.logging import get_logger
from app.domains.media.proxy import proxy_url_for

log = get_logger(__name__)

CONTENT_DIR = Path(__file__).resolve().parents[3] / "content" / "climate"

_CHECK_INTERVAL_S = 30
_cache: dict[str, Any] | None = None
_mtime: float = 0.0
_checked_at: float = 0.0


def _load() -> dict[str, Any]:
    path = CONTENT_DIR / "source-facts.json"
    try:
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except FileNotFoundError:
        log.error("climate_facts_missing", file=str(path))
        return {}
    except json.JSONDecodeError as exc:
        log.error("climate_facts_unparseable", file=str(path), error=str(exc))
        return {}
    return data if isinstance(data, dict) else {}


def load_source_facts() -> dict[str, Any]:
    """The reviewed file, re-read when its mtime changes."""
    global _cache, _mtime, _checked_at
    now = time.monotonic()
    if _cache is not None and (now - _checked_at) < _CHECK_INTERVAL_S:
        return _cache

    path = CONTENT_DIR / "source-facts.json"
    try:
        current = path.stat().st_mtime
    except OSError:
        current = 0.0

    _checked_at = now
    if _cache is not None and current == _mtime:
        return _cache

    _cache = _load()
    _mtime = current
    return _cache


def clear_source_facts() -> None:
    """Force the next load to re-read from disk."""
    global _cache, _mtime, _checked_at
    _cache = None
    _mtime = 0.0
    _checked_at = 0.0


def public_facts(raw: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """Facts as the page renders them: statement, organisation, date, URL.

    Optional reviewed `image_url` becomes a signed `imageProxy` only — the raw
    upstream URL never leaves the API.
    """
    source = raw if raw is not None else load_source_facts()
    facts: list[dict[str, Any]] = []
    for item in source.get("facts") or []:
        if not isinstance(item, dict):
            continue
        url = item.get("url")
        statement_en = item.get("statement_en")
        if not url or not statement_en:
            log.error("climate_fact_incomplete", id=item.get("id"))
            continue
        out: dict[str, Any] = {
            "id": item.get("id"),
            "statementEn": statement_en,
            "statementNe": item.get("statement_ne") or statement_en,
            "organisation": item.get("organisation"),
            "published": item.get("published"),
            "url": url,
            "imageProxy": None,
            "imageAltEn": None,
            "imageAltNe": None,
            "imageCreditEn": None,
            "imageCreditNe": None,
        }
        image_url = item.get("image_url")
        if isinstance(image_url, str) and image_url.startswith("https://"):
            proxy = proxy_url_for(image_url)
            if proxy:
                out["imageProxy"] = proxy
                alt_en = item.get("image_alt_en")
                out["imageAltEn"] = alt_en if isinstance(alt_en, str) and alt_en.strip() else None
                alt_ne = item.get("image_alt_ne")
                out["imageAltNe"] = (
                    alt_ne if isinstance(alt_ne, str) and alt_ne.strip() and alt_ne != "TODO" else None
                )
                credit_en = item.get("image_credit_en")
                out["imageCreditEn"] = (
                    credit_en if isinstance(credit_en, str) and credit_en.strip() else None
                )
                credit_ne = item.get("image_credit_ne")
                out["imageCreditNe"] = (
                    credit_ne
                    if isinstance(credit_ne, str) and credit_ne.strip() and credit_ne != "TODO"
                    else None
                )
            else:
                log.error("climate_fact_image_unproxyable", id=item.get("id"))
        elif image_url:
            log.error("climate_fact_image_not_https", id=item.get("id"))
        facts.append(out)
    return facts


def match_statements(
    items: list[dict[str, Any]],
    needles: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Ministry posts whose own words match a reviewed needle list.

    The post is returned as the government wrote it. Atlas does not paraphrase.
    If the government published no English, a reviewed translation on the needle
    may fill `title` / `bodyEn`, marked `translated`.
    One post is attached to at most one needle group, newest first.
    """
    if not items or not needles:
        return []

    used: set[str] = set()
    matched: list[dict[str, Any]] = []
    for rule in needles:
        terms = [
            term.lower()
            for term in (rule.get("needles") or [])
            if isinstance(term, str) and term.strip()
        ]
        if not terms:
            continue
        hit: dict[str, Any] | None = None
        hit_title = False
        for item in items:
            item_id = str(item.get("id") or "")
            if not item_id or item_id in used:
                continue
            title = " ".join(
                part for part in (item.get("title"), item.get("titleNe")) if isinstance(part, str)
            ).lower()
            body = " ".join(
                part for part in (item.get("bodyEn"), item.get("bodyNe")) if isinstance(part, str)
            ).lower()
            in_title = any(term in title for term in terms)
            in_body = any(term in body for term in terms)
            if not in_title and not in_body:
                continue
            newer = (
                (item.get("publishedAt") or "") > (hit.get("publishedAt") or "") if hit else True
            )
            # A title hit beats a body-only hit, so a relief update that
            # mentions the Himalaya in passing does not displace the
            # statement whose headline is about it.
            if hit is None or (in_title and not hit_title) or (in_title == hit_title and newer):
                hit = item
                hit_title = in_title
        if hit:
            used.add(str(hit.get("id")))
            title_raw = hit.get("title")
            body_raw = hit.get("bodyEn")
            title_en = title_raw.strip() if isinstance(title_raw, str) and title_raw.strip() else None
            body_en = body_raw.strip() if isinstance(body_raw, str) and body_raw.strip() else None
            reviewed_title = rule.get("title_en") if isinstance(rule.get("title_en"), str) else None
            reviewed_body = rule.get("body_en") if isinstance(rule.get("body_en"), str) else None
            translated = False
            if not title_en and reviewed_title:
                title_en = reviewed_title.strip()
                translated = True
            if not body_en and reviewed_body:
                body_en = reviewed_body.strip()
                translated = True
            matched.append(
                {
                    "id": hit.get("id"),
                    "title": title_en,
                    "titleNe": hit.get("titleNe"),
                    "bodyEn": body_en,
                    "bodyNe": hit.get("bodyNe"),
                    "ministry": hit.get("ministry"),
                    "publishedAt": hit.get("publishedAt"),
                    "link": hit.get("link"),
                    "needleId": rule.get("id"),
                    "translated": translated,
                }
            )
    return matched
