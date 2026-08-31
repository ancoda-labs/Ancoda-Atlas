"""The live toll, from the Rasuwa flood bulletin's own figure panels.

The headline figures on the overview used to be a reviewed JSON file typed in
by hand from police briefings. That is the right way to hold numbers nobody
publishes as data — and the wrong way to hold numbers that move every few
hours. It went stale: the page said 469 dead while the compilation everyone
else was reading said 579.

The bulletin at nirajbhusal.github.io/rasuwa-flood-bulletin is the same
compilation Atlas already cites as a source, and it does something unusual for
a hand-built page: it keeps each headline figure beside its district split, and
ships a full Nepali/English dictionary for every label. So this module reads
the totals from the KPI strip, the parts from the panels under it, and the
labels from the page's own i18n file.

Nothing is translated here and no total is recomputed. A panel whose parts do
not add up to its stated total is still returned; merge_sitrep leaves the
reviewed group standing rather than publishing a scrape that does not close.

Numerals arrive in Devanagari and are parsed, not reformatted — ५७९ is 579, and
a value the page writes as "२००+" keeps its plus, because that plus is the
bulletin saying the real figure is higher than the one it can source.
"""

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
TIMEOUT_S = 20.0
SOURCE = {"label": "Rasuwa flood bulletin (compilation)", "url": f"{BASE}/"}


class Panel(NamedTuple):
    panel: str
    id: str
    tone: str
    title_en: str
    title_ne: str
    aside: tuple[str, ...] = ()
    skip: tuple[str, ...] = ()
    overlapping: bool = False


# Which panel becomes which card. Titles stay Atlas's own rather than the
# bulletin's ("Deaths", not "Deaths count"), so the ids and headings match the
# reviewed content this replaces and a reader sees the same page with newer
# numbers in it.
PANELS = [
    Panel("dead", "deaths", "critical", "Deaths", "मृत्यु"),
    Panel("injured", "injured", "warning", "Injured", "घाइते"),
    Panel("miss", "uncontacted", "critical", "Uncontacted", "सम्पर्कविहीन"),
    Panel(
        "deploy",
        "deployed",
        "positive",
        "Personnel deployed",
        "परिचालित जनशक्ति",
        # Medical staff are not counted in the security total, and a helicopter
        # is not a person. The bulletin lists them in the same strip; Atlas
        # draws them outside the total, where they cannot be added in by eye.
        aside=("d_medical", "d_surgical", "d_heli_n"),
    ),
    Panel(
        "air",
        "air-rescue",
        "positive",
        "Rescued by air",
        "हवाई उद्धार",
        # Aircraft and sorties, not people rescued. The bulletin's note is
        # explicit that the 14 helicopters are not 14 of the 1,976.
        aside=("d_heli_n", "d_ndrrma_heli", "d_heli_flights"),
        # The panel opens by restating its own headline figure. Once it is the
        # card's total, repeating it as the first part of itself reads as a
        # component of the thing it is.
        skip=("d_heli",),
        # The rows describe overlapping counts of the same operation — army
        # sorties inside the citizen figure, NDRRMA's own tally beside it — so
        # the arithmetic was never meant to close.
        overlapping=True,
    ),
]

DEVA_DIGITS = "०१२३४५६७८९"
_DEVA = {d: str(i) for i, d in enumerate(DEVA_DIGITS)}
_FIGURE = re.compile(r"^(\d+(?:\.\d+)?)\s*(\+?)$")


def parse_bulletin_figure(raw: Any) -> dict[str, Any] | None:
    """A published figure as a number, or None if it is not one.

    A row whose value is a word rather than a number ("अलग", separate) is
    dropped: it is a note about the deployment, not a count of it.
    """
    if not isinstance(raw, str):
        return None
    text = "".join(_DEVA.get(ch, ch) for ch in raw).replace(",", "").strip()
    match = _FIGURE.match(text)
    if not match:
        return None
    try:
        value = float(match.group(1))
    except ValueError:
        return None
    out: dict[str, Any] = {"value": int(value) if value.is_integer() else value}
    if match.group(2):
        out["suffix"] = match.group(2)
    return out


def parse_i18n(js: str) -> dict[str, Any]:
    """The bulletin's own bilingual dictionary, keyed by its data-i18n attributes.

    The file declares several objects in sequence, so the parse has to stop at
    the end of the first rather than run to the last brace in the file.
    """
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
    # A key the dictionary has not caught up with keeps the Nepali on both
    # sides rather than losing the row.
    return {"label_en": en or ne, "label_ne": ne or en}


_PANE_MARK = re.compile(r'<div class="ov-pane"[^>]*data-panel="(\w+)"[^>]*>')
_ROW = re.compile(
    r'<span data-i18n="([^"]+)">([^<]*)</span>[\s\S]{0,160}?<em class="num">([^<]*)</em>'
)


def panes_in(html: str) -> dict[str, str]:
    """Each figure panel's own slice of the page.

    Sliced between one panel and the next rather than by matching a closing
    tag: the panes contain nested divs, and the same data-panel names also sit
    on the KPI buttons above them, so anything looser collects every row on the
    page into whichever panel asked first.
    """
    marks = list(_PANE_MARK.finditer(html))
    panes: dict[str, str] = {}
    for i, mark in enumerate(marks):
        start = mark.end()
        end = marks[i + 1].start() if i + 1 < len(marks) else min(len(html), start + 8000)
        chunk = html[start:end]
        # Every pane closes with its own source note and the rows sit above it.
        # Cutting there keeps the last pane from running on into whatever
        # section follows and collecting its numbers.
        note = chunk.find('class="ov-note"')
        panes[mark.group(1)] = chunk if note == -1 else chunk[:note]
    return panes


def rows_in(pane: str, dict_: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for match in _ROW.finditer(pane):
        parsed = parse_bulletin_figure(match.group(3))
        if not parsed:
            continue
        rows.append(
            {
                "key": match.group(1),
                **_label_for(dict_, match.group(1), match.group(2).strip()),
                **parsed,
            }
        )
    return rows


def total_for(html: str, panel: str) -> dict[str, Any] | None:
    """The stated total, from the KPI button rather than re-added from parts."""
    match = re.search(
        rf'id="kpi-{panel}"[\s\S]{{0,400}}?<strong class="num">([^<]*)</strong>', html
    )
    return parse_bulletin_figure(match.group(1)) if match else None


def _note_for(dict_: dict[str, Any], panel: str, suffix: str) -> dict[str, Any]:
    key = f"ov_{panel}_{suffix}"
    ne = (dict_.get("ne") or {}).get(key) or None
    en = (dict_.get("en") or {}).get(key) or None
    return {"en": en or ne, "ne": ne or en}


def build_breakdowns(html: str, dict_: dict[str, Any]) -> list[dict[str, Any]]:
    panes = panes_in(html)
    breakdowns = []

    for spec in PANELS:
        pane = panes.get(spec.panel)
        total = total_for(html, spec.panel)
        if not pane or not total:
            continue

        rows = [r for r in rows_in(pane, dict_) if r["key"] not in spec.skip]
        items = [r for r in rows if r["key"] not in spec.aside]
        aside = [r for r in rows if r["key"] in spec.aside]
        if not items:
            continue

        caption = _note_for(dict_, spec.panel, "note")
        breakdown: dict[str, Any] = {
            "id": spec.id,
            "total": total["value"],
            "tone": spec.tone,
            "title_en": spec.title_en,
            "title_ne": spec.title_ne,
            # The bulletin's own footnote, which carries the hour and the
            # reporting body the figure came from.
            "caption_en": caption["en"],
            "caption_ne": caption["ne"],
            "items": [{k: v for k, v in item.items() if k != "key"} for item in items],
            "aside": [
                {**{k: v for k, v in item.items() if k != "key"}, "exclusive": True}
                for item in aside
            ],
        }
        # Both of these are omitted rather than set to null when they do not
        # apply. The TypeScript declares them optional, and a literal null
        # where the Node build emitted no key at all is a contract difference
        # for the sake of nothing.
        if total.get("suffix"):
            breakdown["suffix"] = total["suffix"]
        if spec.overlapping:
            breakdown["no_total_check"] = True
        breakdowns.append(breakdown)

    return breakdowns


async def get_bulletin_sitrep() -> dict[str, Any]:
    """The overview's headline figures, as the bulletin currently states them."""
    fetched_at = now_iso()
    try:
        stamp = int(time.time() * 1000)
        html = await safe_fetch(
            f"{BASE}/?t={stamp}",
            as_="text",
            timeout=TIMEOUT_S,
            retries=1,
            headers={"Accept": "text/html", "User-Agent": UA},
        )
        i18n = await safe_fetch(
            f"{BASE}/i18n.js?t={stamp}",
            as_="text",
            timeout=TIMEOUT_S,
            retries=1,
            headers={"Accept": "application/javascript", "User-Agent": UA},
        )
        if not isinstance(html, str):
            raise RuntimeError("could not read the bulletin")
        if not isinstance(i18n, str):
            raise RuntimeError("could not read the bulletin dictionary")

        dict_ = parse_i18n(i18n)
        breakdowns = build_breakdowns(html, dict_)
        if not breakdowns:
            raise RuntimeError("no figure panels found — the bulletin markup has moved")

        def dateline(lang: str) -> str | None:
            """"Flood snapshot · 12 Bhadra" is the page's own dateline; only the
            date half belongs on a line that already says "Figures as of"."""
            text = (dict_.get(lang) or {}).get("hero_overview")
            if not text:
                return None
            return (text.split("·")[-1] or text).strip() or None

        return {
            "breakdowns": breakdowns,
            "asOfLabelEn": dateline("en"),
            "asOfLabelNe": dateline("ne"),
            "error": None,
            "source": SOURCE,
            "fetchedAt": fetched_at,
        }
    except Exception as exc:  # noqa: BLE001
        log.warning("bulletin_sitrep_unavailable", error=str(exc))
        return {
            "breakdowns": [],
            "asOfLabelEn": None,
            "asOfLabelNe": None,
            "error": str(exc) or exc.__class__.__name__,
            "source": SOURCE,
            "fetchedAt": fetched_at,
        }
