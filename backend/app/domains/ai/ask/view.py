"""The closed map side-channel.

The model may suggest a view action, but only from this fixed set, and it is
re-validated after the model returns. An open-ended instruction from a model to
the map would be a way for text in a headline to move a reader's screen.
"""

from typing import Any

DISTRICT_IDS = {
    "rasuwa", "nuwakot", "dhading", "chitwan", "gorkha", "tanahun",
    "nawalparasi east", "nawalparasi west", "makwanpur", "kathmandu",
}

NAME_TO_ID = {
    **{d: d for d in DISTRICT_IDS},
    "नवलपरासी पूर्व": "nawalparasi east",
    "नवलपरासी पश्चिम": "nawalparasi west",
    "चितवन": "chitwan",
    "नुवाकोट": "nuwakot",
    "रसुवा": "rasuwa",
    "धादिङ": "dhading",
    "गोरखा": "gorkha",
    "तनहुँ": "tanahun",
}

DISPLAY = {
    "rasuwa": "Rasuwa",
    "nuwakot": "Nuwakot",
    "dhading": "Dhading",
    "chitwan": "Chitwan",
    "gorkha": "Gorkha",
    "tanahun": "Tanahun",
    "nawalparasi east": "Nawalparasi East",
    "nawalparasi west": "Nawalparasi West",
    "makwanpur": "Makwanpur",
    "kathmandu": "Kathmandu",
}

METRICS = ("deaths", "uncontacted")


def district_id_from_label(label: str) -> str | None:
    key = (label or "").strip().lower()
    return NAME_TO_ID.get(key) or (key if key in DISTRICT_IDS else None)


def display_name_for_id(district_id: str) -> str:
    return DISPLAY.get(district_id, district_id)


_CHART_BAR_IDS = frozenset({"received", "recovery", "gap"})


def validate_view(value: Any) -> dict[str, Any] | None:
    """Anything not in the closed set becomes None. Unknown actions are dropped,
    never forwarded."""
    if not isinstance(value, dict):
        return None

    focus = value.get("focus")
    if focus == "corridor":
        return {"focus": "corridor"}
    if focus in ("district", "gauge"):
        target = value.get("id")
        if not isinstance(target, str):
            return None
        if focus == "district":
            resolved = district_id_from_label(target)
            return {"focus": "district", "id": resolved} if resolved else None
        return {"focus": "gauge", "id": target[:60]}

    if value.get("highlight") == "districts":
        ids = value.get("ids")
        metric = value.get("metric")
        if not isinstance(ids, list) or metric not in METRICS:
            return None
        # Named differently from the `resolved` above: mypy reads a rebound
        # name in the same function as one variable.
        district_ids = [
            r for r in (district_id_from_label(i) for i in ids if isinstance(i, str)) if r
        ]
        return (
            {"highlight": "districts", "ids": district_ids[:6], "metric": metric}
            if district_ids
            else None
        )

    # Funding-gap chart — bars must already be desk-derived; unknown ids drop.
    if value.get("chart") == "funding_gap":
        bars_in = value.get("bars")
        if not isinstance(bars_in, list) or value.get("unit") != "npr_cr":
            return None
        bars: list[dict[str, Any]] = []
        for bar in bars_in[:3]:
            if not isinstance(bar, dict):
                continue
            bar_id = bar.get("id")
            value_cr = bar.get("value_cr")
            if bar_id not in _CHART_BAR_IDS or not isinstance(value_cr, (int, float)):
                continue
            bars.append(
                {
                    "id": bar_id,
                    "label_en": str(bar.get("label_en") or bar_id)[:80],
                    "label_ne": str(bar.get("label_ne") or bar.get("label_en") or bar_id)[:80],
                    "value_cr": float(value_cr),
                }
            )
        if len(bars) < 2:
            return None
        return {
            "chart": "funding_gap",
            "unit": "npr_cr",
            "bars": bars,
            "caveat_en": str(value.get("caveat_en") or "")[:400] or None,
            "caveat_ne": str(value.get("caveat_ne") or "")[:400] or None,
        }

    return None
