"""The Copernicus EMSR927 grading, from the Rasuwa flood bulletin's damage page.

Copernicus does not publish this AOI as a live GeoJSON API Atlas can poll. The
bulletin at nirajbhusal.github.io/rasuwa-flood-bulletin/damage.html reprints the
EMSR927 AOI01 Syapru Besi table in a scrapeable form — KPI strip, full class
table, bilingual dictionary, and the grading maps in the bulletin's img folder.

What this deliberately does NOT read: the page's "Damage (preliminary)" news
log, which carries stale early death counts that would fight the Police sitrep,
and the NEA plant table on the same page, which is a dated government notice
that stays in reviewed JSON. This scrape is Copernicus only.

Numerals arrive in Devanagari. "~450" keeps its tilde (approximate), "5/5"
takes the first number, and a dash is a missing cell rather than a zero — the
difference between "not surveyed" and "none destroyed".
"""

import asyncio
import json
import re
import time
from typing import Any, NamedTuple

from app.core.http import now_iso, safe_fetch
from app.core.logging import get_logger

log = get_logger(__name__)

BASE = "https://nirajbhusal.github.io/rasuwa-flood-bulletin"
UA = (
    "AncodaAtlas/4.0 (Nepal hazard monitoring; "
    "+https://github.com/ancoda-labs/Ancoda-Atlas)"
)
IMG_HOST = f"{BASE}/img"
GITHUB_IMG = "https://api.github.com/repos/nirajbhusal/rasuwa-flood-bulletin/contents/img"
TIMEOUT_S = 20.0

SOURCE = {
    "label": "Rasuwa flood bulletin (compilation)",
    "url": f"{BASE}/damage.html",
}

DEVA_DIGITS = "०१२३४५६७८९"
_DEVA = {d: str(i) for i, d in enumerate(DEVA_DIGITS)}

ROW_FOR: dict[str, dict[str, str]] = {
    "ems_r_slide": {"id": "landslide", "group": "hazard"},
    "ems_r_pop": {"id": "population", "group": "people"},
    "ems_r_res": {"id": "residential", "group": "buildings"},
    "ems_r_inst": {"id": "institutional", "group": "buildings"},
    "ems_r_school": {"id": "school", "group": "buildings"},
    "ems_r_otherb": {"id": "other-nonres", "group": "buildings"},
    "ems_r_rel": {"id": "religious", "group": "buildings"},
    "ems_r_allb": {"id": "all-buildings", "group": "buildings"},
    "ems_r_pri": {"id": "primary-road", "group": "transport"},
    "ems_r_loc": {"id": "local-road", "group": "transport"},
    "ems_r_cart": {"id": "cart-track", "group": "transport"},
    "ems_r_br": {"id": "bridges", "group": "transport"},
    "ems_r_heli": {"id": "helipad", "group": "transport"},
    "ems_r_pp": {"id": "power-plant", "group": "facilities"},
    "ems_r_wet": {"id": "wetland", "group": "landcover"},
    "ems_r_otherlu": {"id": "other-landuse", "group": "landcover"},
    "ems_r_agri": {"id": "agriculture", "group": "landcover"},
    "ems_r_shrub": {"id": "shrub", "group": "landcover"},
    "ems_r_forest": {"id": "forest", "group": "landcover"},
    "ems_r_alllc": {"id": "all-landcover", "group": "landcover"},
}

KPI_FOR: dict[str, dict[str, str]] = {
    "ems_k_slide": {"id": "landslide", "tone": "critical"},
    "ems_k_pop": {"id": "population", "tone": "warning"},
    "ems_k_built": {"id": "buildings", "tone": "critical"},
    "ems_k_res": {"id": "residential", "tone": "critical"},
    "ems_k_road": {"id": "road", "tone": "warning"},
    "ems_k_br": {"id": "bridges", "tone": "critical"},
    "ems_k_pp": {"id": "power", "tone": "critical"},
    "ems_k_heli": {"id": "helipad", "tone": "warning"},
}

# Product-name captions when a map file has no figcaption. Not image descriptions.
MAP_CAPTION = {
    "overview": {
        "caption_en": "EMSR927 AOI01 grading overview",
        "caption_ne": "EMSR927 AOI01 ग्रेडिङ अवलोकन",
    },
    "detail": {
        "caption_en": "EMSR927 AOI01 grading detail",
        "caption_ne": "EMSR927 AOI01 ग्रेडिङ विवरण",
    },
    "infographic": {
        "caption_en": "EMSR927 grading infographic",
        "caption_ne": "EMSR927 ग्रेडिङ इन्फोग्राफिक",
    },
}

class AoiPlace(NamedTuple):
    id: str
    pattern: re.Pattern[str]
    lat: float
    lon: float


# Reviewed flood-path coordinates for caption-matched AOI photographs. These
# are place pins, not GPS of the shutter.
AOI_PLACES = [
    AoiPlace("timure", re.compile(r"timure|टिमुरे", re.I), 28.207, 85.334),
    AoiPlace("syaphrubesi", re.compile(r"syafru|syabru|स्याफ्रु", re.I), 28.161, 85.336),
]

SKIP_PHOTO = re.compile(
    r"nepal-police|sitrep|ndrrma|pmdrf|us-state|jaishankar|family-|qr-|indians|"
    r"foreign-rescued|copernicus|ems927",
    re.I,
)

UNIT_FOR: dict[str, dict[str, str]] = {
    "landslide": {"unit_en": "ha", "unit_ne": "हे"},
    "road": {"unit_en": "km", "unit_ne": "कि.मी."},
    "primary-road": {"unit_en": "km", "unit_ne": "कि.मी."},
    "local-road": {"unit_en": "km", "unit_ne": "कि.मी."},
    "cart-track": {"unit_en": "km", "unit_ne": "कि.मी."},
    "helipad": {"unit_en": "ha", "unit_ne": "हे"},
    "power-plant": {"unit_en": "ha", "unit_ne": "हे"},
    "power": {"unit_en": "ha", "unit_ne": "हे"},
    "wetland": {"unit_en": "ha", "unit_ne": "हे"},
    "other-landuse": {"unit_en": "ha", "unit_ne": "हे"},
    "agriculture": {"unit_en": "ha", "unit_ne": "हे"},
    "shrub": {"unit_en": "ha", "unit_ne": "हे"},
    "forest": {"unit_en": "ha", "unit_ne": "हे"},
    "all-landcover": {"unit_en": "ha", "unit_ne": "हे"},
}


def ascii_digits(raw: Any) -> str:
    return "".join(_DEVA.get(ch, ch) for ch in str(raw))


def _number(text: str) -> float | int | None:
    try:
        value = float(text)
    except ValueError:
        return None
    return int(value) if value.is_integer() else value


def parse_damage_figure(raw: Any) -> dict[str, Any] | None:
    """A published Copernicus figure, or None if the cell is a dash or a word.

    "~450" keeps approximate. "5/5" returns the first number — destroyed of
    five in the AOI. A trailing plus is meaning, the same as the sitrep parser.
    """
    if not isinstance(raw, str):
        return None
    text = ascii_digits(raw).replace(",", "")
    text = re.sub(r"[—–−]", "-", text).strip()
    if not text or text == "-":
        return None

    approximate = bool(re.match(r"^[~≈]", text))
    if approximate:
        text = re.sub(r"^[~≈]\s*", "", text)

    plus = "+" in text
    text = text.replace("+", " ").strip()

    # Leading number only — trailing units ("हे", "किमि") are not word
    # characters, so they cannot be stripped with a word-boundary regex.
    slash = re.match(r"^(\d+(?:\.\d+)?)\s*/\s*\d+(?:\.\d+)?", text)
    match = slash or re.match(r"^(\d+(?:\.\d+)?)", text)
    if not match:
        return None
    value = _number(match.group(1))
    if value is None:
        return None

    out: dict[str, Any] = {"value": value}
    if plus:
        out["suffix"] = "+"
    if approximate:
        out["approximate"] = True
    return out


def parse_share(raw: str) -> str | None:
    text = re.sub(r"\s", "", ascii_digits(raw))
    match = re.match(r"^(\d+(?:\.\d+)?)%$", text)
    return f"{match.group(1)}%" if match else None


def strip_tags(html: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html)).strip()


def parse_i18n(js: str) -> dict[str, Any]:
    start = js.find("{")
    if start == -1:
        return {"ne": {}, "en": {}}
    text = js[start:]
    end = len(text)
    while end > 1:
        try:
            parsed = json.loads(text[:end])
        except json.JSONDecodeError:
            end = text.rfind("}", 0, end - 1) + 1
            if end <= 0:
                break
            continue
        return parsed if isinstance(parsed, dict) else {"ne": {}, "en": {}}
    return {"ne": {}, "en": {}}


def _label_for(dict_: dict[str, Any], key: str, fallback_ne: str | None) -> dict[str, Any]:
    ne = (dict_.get("ne") or {}).get(key) or fallback_ne or None
    en = (dict_.get("en") or {}).get(key) or None
    return {"label_en": en or ne, "label_ne": ne or en}


def plants_table_html(html: str) -> str | None:
    """The Copernicus class table.

    The first `table.plants` on the page, before the NEA plant list that reuses
    the same class under #power.
    """
    power = html.find("id=\"power\"")
    if power == -1:
        power = html.find("id='power'")
    chunk = html if power == -1 else html[:power]
    start = chunk.find('<table class="plants">')
    if start == -1:
        return None
    end = chunk.find("</table>", start)
    return None if end == -1 else chunk[start : end + len("</table>")]


_TR = re.compile(r"<tr\b[^>]*>([\s\S]*?)</tr>")
_TD = re.compile(r"<td\b[^>]*>([\s\S]*?)</td>")
_ROW_KEY = re.compile(r'data-i18n="(ems_r_[^"]+)"')


def parse_copernicus_table(
    html: str, dict_: dict[str, Any] | None = None
) -> list[dict[str, Any]]:
    """One grading row per class, numbers as the bulletin printed them."""
    dict_ = dict_ or {"ne": {}, "en": {}}
    table = plants_table_html(html)
    if not table:
        return []

    rows = []
    for tr in _TR.finditer(table):
        body = tr.group(1)
        key_match = _ROW_KEY.search(body)
        if not key_match:
            continue
        spec = ROW_FOR.get(key_match.group(1))
        if not spec:
            continue
        cells = _TD.findall(body)
        if len(cells) < 7:
            continue

        destroyed = parse_damage_figure(strip_tags(cells[1]))
        damaged = parse_damage_figure(strip_tags(cells[2]))
        possible = parse_damage_figure(strip_tags(cells[3]))
        affected = parse_damage_figure(strip_tags(cells[4]))
        aoi = parse_damage_figure(strip_tags(cells[5]))
        approximate = bool(
            (affected or {}).get("approximate") or (aoi or {}).get("approximate")
        )

        row: dict[str, Any] = {
            "id": spec["id"],
            "group": spec["group"],
            **_label_for(dict_, key_match.group(1), strip_tags(cells[0])),
            **UNIT_FOR.get(spec["id"], {}),
            "destroyed": destroyed["value"] if destroyed else None,
            "damaged": damaged["value"] if damaged else None,
            "possible": possible["value"] if possible else None,
            "affected": affected["value"] if affected else None,
            "aoi": aoi["value"] if aoi else None,
            "share": parse_share(strip_tags(cells[6])),
        }
        if approximate:
            row["approximate"] = True
        rows.append(row)
    return rows


_KPI = re.compile(
    r'<span class="kpi-k" data-i18n="(ems_k_[^"]+)">([^<]*)</span>\s*'
    r'<strong class="num">([^<]*)</strong>'
)


def parse_copernicus_kpis(
    html: str, dict_: dict[str, Any] | None = None
) -> list[dict[str, Any]]:
    dict_ = dict_ or {"ne": {}, "en": {}}
    headline = []
    for match in _KPI.finditer(html):
        spec = KPI_FOR.get(match.group(1))
        if not spec:
            continue
        parsed = parse_damage_figure(match.group(3))
        if not parsed:
            continue
        labels = _label_for(dict_, f"{match.group(1)}_sub", match.group(2).strip())
        item: dict[str, Any] = {
            "id": spec["id"],
            "value": parsed["value"],
            "tone": spec["tone"],
            "source": "EMSR927",
            "label_en": labels["label_en"],
            "label_ne": labels["label_ne"],
            **UNIT_FOR.get(spec["id"], {}),
        }
        if parsed.get("suffix"):
            item["suffix"] = parsed["suffix"]
        if parsed.get("approximate"):
            item["approximate"] = True
        headline.append(item)
    return headline


def abs_url(src: str | None) -> str | None:
    if not src:
        return None
    if re.match(r"^https?://", src, re.I):
        return src
    path = re.sub(r"^\./", "", str(src)).lstrip("/")
    return f"{BASE}/{path}"


def id_from_src(src: str) -> str:
    file = str(src).split("/")[-1]
    file = re.sub(r"\.(jpe?g|png|webp)$", "", file, flags=re.I)
    return re.sub(r"^today-\d{4}-\d{2}-\d{2}-", "", file)


def classify_copernicus_map(src: str) -> str | None:
    """Which Copernicus product a filename is.

    None for a thumbnail, the table screenshot, a PDF, or anything not EMSR927.
    """
    file = str(src).split("/")[-1]
    if not re.search(r"copernicus-ems927", file, re.I):
        return None
    if re.search(r"-sm\.", file, re.I) or re.search(r"table\.", file, re.I):
        return None
    if re.search(r"\.pdf$", file, re.I):
        return None
    if re.search(r"overview", file, re.I):
        return "overview"
    if re.search(r"infographic", file, re.I):
        return "infographic"
    return "detail"


_FIGURE = re.compile(r'<figure class="photo">([\s\S]*?)</figure>')
_IMG_SRC = re.compile(r'<img\b[^>]*\ssrc="([^"]+)"', re.I)
_IMG_ALT = re.compile(r'<img\b[^>]*\salt="([^"]*)"', re.I)
_HREF = re.compile(r'<a\b[^>]*\shref="([^"]+)"', re.I)
_FIGCAPTION = re.compile(r"<figcaption>([\s\S]*?)</figcaption>", re.I)
_STRONG = re.compile(r"<strong>([\s\S]*?)</strong>")


def parse_bulletin_figures(html: str) -> list[dict[str, Any]]:
    """`figure.photo` cards: src, alt, and a bilingual caption from figcaption
    (`<strong>` is the Nepali, the remainder is English)."""
    if not isinstance(html, str) or not html:
        return []

    figures = []
    for match in _FIGURE.finditer(html):
        body = match.group(1)
        src_match = _IMG_SRC.search(body)
        if not src_match:
            continue
        src = abs_url(src_match.group(1))
        if not src:
            continue

        alt_match = _IMG_ALT.search(body)
        href_match = _HREF.search(body)
        cap_match = _FIGCAPTION.search(body)
        alt = alt_match.group(1) if alt_match else ""

        caption_ne = caption_en = None
        if cap_match:
            strong = _STRONG.search(cap_match.group(1))
            caption_ne = strip_tags(strong.group(1)) if strong else None
            rest = strip_tags(_STRONG.sub("", cap_match.group(1), count=1))
            caption_en = rest or None

        figures.append(
            {
                "id": id_from_src(src),
                "src": src,
                "href": abs_url(href_match.group(1)) if href_match else src,
                "alt": alt,
                "caption_en": caption_en or alt or None,
                "caption_ne": caption_ne or alt or None,
            }
        )
    return figures


def _map_from_src(src: str, extra: dict[str, Any] | None = None) -> dict[str, Any] | None:
    kind = classify_copernicus_map(src)
    if not kind:
        return None
    extra = extra or {}
    named = MAP_CAPTION.get(kind, MAP_CAPTION["detail"])
    return {
        "id": id_from_src(src),
        "kind": kind,
        "src": src,
        "href": extra.get("href") or src,
        "alt": extra.get("alt") or named["caption_en"],
        "caption_en": extra.get("caption_en") or named["caption_en"],
        "caption_ne": extra.get("caption_ne") or named["caption_ne"],
    }


_MAP_RANK = {"overview": 0, "detail": 1, "infographic": 2}


def collect_copernicus_maps(
    html: str, photos_html: str = "", listed: list[str] | None = None
) -> list[dict[str, Any]]:
    """Grading maps from damage.html and photos.html, then any EMSR927 files in
    the bulletin's img folder the HTML omitted."""
    by_id: dict[str, dict[str, Any]] = {}

    def take(item: dict[str, Any] | None) -> None:
        if item and item["id"] not in by_id:
            by_id[item["id"]] = item

    for fig in [*parse_bulletin_figures(html), *parse_bulletin_figures(photos_html)]:
        take(_map_from_src(fig["src"], fig))
    for src in listed or []:
        take(_map_from_src(src))

    return sorted(
        by_id.values(), key=lambda m: (_MAP_RANK.get(m["kind"], 9), str(m["id"]))
    )


def parse_aoi_photos(html: str) -> list[dict[str, Any]]:
    """Syabrubesi / Timure ground photographs.

    Casualty infographics and the Copernicus table screenshots stay off this
    list — the media page is for what the corridor looks like, not for
    graphics about the dead.
    """
    photos = []
    for fig in parse_bulletin_figures(html):
        hay = f"{fig['src']} {fig['alt']} {fig['caption_en'] or ''} {fig['caption_ne'] or ''}"
        if SKIP_PHOTO.search(hay):
            continue
        place = next((p for p in AOI_PLACES if p.pattern.search(hay)), None)
        if not place:
            continue
        photos.append(
            {
                "id": fig["id"],
                "kind": "photo",
                "src": fig["src"],
                "href": fig["href"],
                "alt": fig["alt"],
                "caption_en": fig["caption_en"],
                "caption_ne": fig["caption_ne"],
                "lat": place.lat,
                "lon": place.lon,
                "place_id": place.id,
            }
        )
        if len(photos) >= 8:
            break
    return photos


async def _list_copernicus_files() -> list[str]:
    body = await safe_fetch(
        GITHUB_IMG,
        timeout=12.0,
        retries=0,
        headers={"Accept": "application/vnd.github+json", "User-Agent": UA},
    )
    if not isinstance(body, list):
        return []
    return [
        f"{IMG_HOST}/{f['name']}"
        for f in body
        if isinstance(f, dict)
        and f.get("type") == "file"
        and isinstance(f.get("name"), str)
        and classify_copernicus_map(f["name"])
    ]


def _empty(error: str, fetched_at: str) -> dict[str, Any]:
    return {
        "rows": [],
        "headline": [],
        "maps": [],
        "photos": [],
        "asOfLabelEn": None,
        "asOfLabelNe": None,
        "error": error,
        "source": SOURCE,
        "fetchedAt": fetched_at,
    }


async def get_bulletin_damage() -> dict[str, Any]:
    """The EMSR927 AOI01 table as the bulletin currently states it, plus the
    grading maps and the Syabrubesi / Timure photographs it hosts."""
    fetched_at = now_iso()
    try:
        stamp = int(time.time() * 1000)

        async def page(path: str, accept: str) -> Any:
            return await safe_fetch(
                f"{BASE}/{path}?t={stamp}",
                as_="text",
                timeout=TIMEOUT_S,
                retries=1,
                headers={"Accept": accept, "User-Agent": UA},
            )

        # return_exceptions so the GitHub listing failing — it is rate-limited
        # and unauthenticated — cannot take the table down with it.
        results: list[Any] = list(
            await asyncio.gather(
                page("damage.html", "text/html"),
                page("i18n.js", "application/javascript"),
                page("photos.html", "text/html"),
                _list_copernicus_files(),
                return_exceptions=True,
            )
        )
        html, i18n, photos_html, listed = results
        if not isinstance(html, str):
            raise RuntimeError("could not read the bulletin damage page")
        if not isinstance(i18n, str):
            raise RuntimeError("could not read the bulletin dictionary")

        dict_ = parse_i18n(i18n)
        rows = parse_copernicus_table(html, dict_)
        headline = parse_copernicus_kpis(html, dict_)
        if not rows:
            raise RuntimeError("no Copernicus table found — the bulletin markup has moved")

        photos_page = photos_html if isinstance(photos_html, str) else ""
        maps = collect_copernicus_maps(
            html, photos_page, listed if isinstance(listed, list) else []
        )

        def dateline(lang: str) -> str | None:
            text = (dict_.get(lang) or {}).get("brand_date")
            if not text:
                return None
            return (text.split("·")[0] or text).strip() or None

        return {
            "rows": rows,
            "headline": headline,
            "maps": maps,
            "photos": parse_aoi_photos(photos_page),
            "asOfLabelEn": dateline("en"),
            "asOfLabelNe": dateline("ne"),
            "error": None,
            "source": SOURCE,
            "fetchedAt": fetched_at,
        }
    except Exception as exc:  # noqa: BLE001
        log.warning("bulletin_damage_unavailable", error=str(exc))
        return _empty(str(exc) or exc.__class__.__name__, fetched_at)
