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

    return None
