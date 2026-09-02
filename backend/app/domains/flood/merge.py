"""Laying the live bulletin over the reviewed content.

The reviewed files are a floor, not a ceiling. They hold groups the bulletin
does not publish; the bulletin publishes figures that move every few hours. A
live group replaces the reviewed one of the same id only when it passes the
checks below — and a failed read always leaves the reviewed figures standing.

The rules here are the difference between a desk that updates and a desk that
publishes a scrape nobody checked.
"""

from typing import Any

from app.domains.flood.content import reconcile

# Which live panel updates which headline tile. The air-rescue panel is the
# SitRep helicopter total; the overview tile is still labelled `heli` from when
# that figure lived only in reviewed JSON.
HEADLINE_FOR = {
    "deaths": "deaths",
    "injured": "injured",
    "uncontacted": "uncontacted",
    "deployed": "deployed",
    "air-rescue": "heli",
}


def _summed(breakdown: dict[str, Any]) -> float:
    return sum((item.get("value") or 0) for item in (breakdown.get("items") or []))


def should_overlay(
    reviewed: dict[str, Any] | None, live: dict[str, Any]
) -> bool:
    """Whether a live panel is safe to lay over the reviewed group of the same id.

    Deaths never go down. This disaster's toll is recovered bodies, and a
    compilation that has not caught up would otherwise put 1003 back over 1114 —
    which on a page families are reading is not a display bug.

    Other groups may fall: uncontacted drops as people are found.

    A panel whose parts do not add up to its stated total is left as reviewed,
    including the overlapping air-rescue rows. The bulletin's air KPI has
    drifted to NDRRMA's all-rescued graphic (11,993 air and ground), and that
    must not replace the SitRep helicopter tile.
    """
    total = live.get("total")
    if total is None or not isinstance(total, (int, float)):
        return False
    if live.get("id") == "deaths" and reviewed and total < (reviewed.get("total") or 0):
        return False
    return _summed(live) == total


def _overlay_headline(
    headlines: list[dict[str, Any]] | None, live: dict[str, Any], source_label: str
) -> list[dict[str, Any]] | None:
    headline_id = HEADLINE_FOR.get(live.get("id", ""))
    if not headline_id or not headlines:
        return headlines
    return [
        (
            {
                **h,
                "value": live.get("total"),
                "suffix": live.get("suffix") or h.get("suffix"),
                "source": source_label,
                "tone": live.get("tone"),
                "live": True,
            }
            if h.get("id") == headline_id
            else h
        )
        for h in headlines
    ]


def merge_sitrep(
    reviewed: dict[str, Any] | None, live: dict[str, Any] | None
) -> dict[str, Any] | None:
    """The reviewed toll with the bulletin's current figures laid over it."""
    if not reviewed:
        return reviewed
    if not live or live.get("error") or not live.get("breakdowns"):
        return reviewed

    reviewed_by_id = {b.get("id"): b for b in (reviewed.get("breakdowns") or [])}
    fresh = {b.get("id"): b for b in live["breakdowns"]}
    seen: set[str] = set()
    overlaid = False
    deaths_overlaid = False
    headlines = reviewed.get("headline")
    source_label = (live.get("source") or {}).get("label", "")

    breakdowns = []
    for b in reviewed.get("breakdowns") or []:
        replacement = fresh.get(b.get("id"))
        if not replacement or not should_overlay(b, replacement):
            breakdowns.append(b)
            continue
        seen.add(b.get("id"))
        overlaid = True
        if b.get("id") == "deaths":
            deaths_overlaid = True
        headlines = _overlay_headline(headlines, replacement, source_label)
        breakdowns.append({**replacement, "live": True})

    for b in live["breakdowns"]:
        if b.get("id") in seen or b.get("id") in reviewed_by_id:
            continue
        if not should_overlay(None, b):
            continue
        breakdowns.append({**b, "live": True})
        overlaid = True
        if b.get("id") == "deaths":
            deaths_overlaid = True
        headlines = _overlay_headline(headlines, b, source_label)

    if not overlaid:
        return {**reviewed, "discrepancies": reconcile(reviewed.get("breakdowns"))}

    sources = list(reviewed.get("sources") or [])
    live_source = live.get("source") or {}
    if not any(s.get("url") == live_source.get("url") for s in sources):
        sources.append(live_source)

    return {
        **reviewed,
        "breakdowns": breakdowns,
        "headline": headlines,
        "sources": sources,
        # Only the death overlay moves the dateline. The other panels update on
        # their own schedules, and stamping the whole page with a fresh time
        # because a deployment count changed would overstate how current the
        # toll is.
        "as_of": live.get("fetchedAt") or reviewed.get("as_of")
        if deaths_overlaid
        else reviewed.get("as_of"),
        "as_of_label_en": live.get("asOfLabelEn") or reviewed.get("as_of_label_en")
        if deaths_overlaid
        else reviewed.get("as_of_label_en"),
        "as_of_label_ne": live.get("asOfLabelNe") or reviewed.get("as_of_label_ne")
        if deaths_overlaid
        else reviewed.get("as_of_label_ne"),
        "discrepancies": reconcile(breakdowns),
    }


# ─── Damage ──────────────────────────────────────────────────────────────────

BUILDING_PARTS = ["residential", "institutional", "school", "other-nonres", "religious"]


def _parts_of(row: dict[str, Any] | None) -> float | None:
    if not row or row.get("affected") is None:
        return None
    return (row.get("destroyed") or 0) + (row.get("damaged") or 0) + (row.get("possible") or 0)


def buildings_close(rows: list[dict[str, Any]] | None) -> bool:
    """Whether the Copernicus building arithmetic still closes.

    Three identities the source itself prints:
        destroyed + damaged + possible = all buildings (323+32+78 = 433)
        the same for residential                      (283+31+78 = 392)
        the five building classes sum to all buildings (392+1+1+37+2 = 433)

    392 is inside 433. A scrape that would let a reader add them is refused.
    """
    if not rows:
        return False
    by_id = {r.get("id"): r for r in rows}
    all_b = by_id.get("all-buildings")
    res = by_id.get("residential")
    if not all_b or not res:
        return False
    if all_b.get("affected") is None or res.get("affected") is None:
        return False
    if _parts_of(all_b) != all_b["affected"]:
        return False
    if _parts_of(res) != res["affected"]:
        return False
    class_sum = sum((by_id.get(i) or {}).get("affected") or 0 for i in BUILDING_PARTS)
    return class_sum == all_b["affected"]


def _overlay_row(reviewed: dict[str, Any], live: dict[str, Any]) -> dict[str, Any]:
    out = dict(reviewed)
    for key in ("destroyed", "damaged", "possible", "affected", "aoi", "share", "approximate"):
        if live.get(key) is not None:
            out[key] = live[key]
    for key in ("label_en", "label_ne"):
        if live.get(key):
            out[key] = live[key]
    return out


def _overlay_damage_headline(
    headlines: list[dict[str, Any]] | None,
    live: list[dict[str, Any]],
    source_label: str,
) -> list[dict[str, Any]] | None:
    if not headlines or not live:
        return headlines
    fresh = {h.get("id"): h for h in live}
    out = []
    for h in headlines:
        replacement = fresh.get(h.get("id"))
        if not replacement or replacement.get("value") is None:
            out.append(h)
            continue
        out.append(
            {
                **h,
                "value": replacement["value"],
                "suffix": replacement.get("suffix"),
                "approximate": replacement.get("approximate"),
                "source": source_label,
            }
        )
    return out


def merge_damage(
    reviewed: dict[str, Any] | None, live: dict[str, Any] | None
) -> dict[str, Any] | None:
    """The reviewed Copernicus table with the bulletin's current figures over it.

    The NEA plant list is never overlaid — that notice is dated and does not
    move every cycle. A failed read, or a scrape whose buildings do not add up,
    leaves the reviewed figures standing.

    Maps and AOI photographs overlay on their own: a closed table is not
    required for them, and an empty scrape leaves the reviewed images in place.
    """
    if not reviewed:
        return reviewed
    if not live or live.get("error"):
        return reviewed

    next_ = dict(reviewed)
    sources = list(reviewed.get("sources") or [])
    live_source = live.get("source") or {}
    if live_source.get("url") and not any(
        s.get("url") == live_source["url"] for s in sources
    ):
        sources.append(live_source)
    next_["sources"] = sources

    if live.get("rows") and buildings_close(live["rows"]):
        copernicus = dict(next_.get("copernicus") or {})
        fresh = {r.get("id"): r for r in live["rows"]}
        copernicus["rows"] = [
            _overlay_row(row, fresh[row["id"]]) if row.get("id") in fresh else row
            for row in (copernicus.get("rows") or [])
        ]
        copernicus["headline"] = _overlay_damage_headline(
            copernicus.get("headline"), live.get("headline") or [], live_source.get("label", "")
        )
        next_["as_of"] = live.get("fetchedAt") or next_.get("as_of")
        next_["copernicus"] = copernicus

    if live.get("maps") or live.get("photos"):
        copernicus = dict(next_.get("copernicus") or {})
        if live.get("maps"):
            copernicus["maps"] = live["maps"]
        if live.get("photos"):
            copernicus["photos"] = live["photos"]
        next_["copernicus"] = copernicus

    return next_
