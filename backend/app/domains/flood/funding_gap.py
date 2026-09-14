"""PMDRF cash vs RDNA recovery need — Atlas arithmetic, not an official shortfall.

The two inputs are separately reviewed figures that Atlas already publishes.
This module only converts units and subtracts. It never invents a MoF or NPC
shortfall claim, and it never adds pledges or in-kind onto the cash bar.
"""

from __future__ import annotations

from typing import Any

NPR_PER_CRORE = 10_000_000

CAVEAT_EN = (
    "Atlas arithmetic — not an official MoF or NPC shortfall. "
    "PM Disaster Relief Fund bank stock versus NPC–NDRRMA preliminary RDNA "
    "recovery need. Scopes differ; PhonePe, foreign pledges and in-kind are "
    "not in the cash bar."
)
CAVEAT_NE = (
    "एट्लसको अंकगणित — आधिकारिक MoF वा NPC अभाव होइन। "
    "प्रधानमन्त्री दैवी प्रकोप उद्धार कोषको बैंक मौज्दात विरुद्ध "
    "NPC–NDRRMA प्रारम्भिक RDNA पुनर्प्राप्ति आवश्यकता। "
    "क्षेत्र फरक; फोनपे, वैदेशिक घोषणा र जिन्सी यो नगद बारमा छैनन्।"
)


def npr_to_crore(npr: float | int | None) -> float | None:
    if npr is None:
        return None
    return round(float(npr) / NPR_PER_CRORE, 2)


def _pm_fund_npr(relief_received: dict[str, Any] | None) -> float | None:
    if not relief_received:
        return None
    pm = next(
        (h for h in (relief_received.get("headline") or []) if h.get("id") == "pm-fund"),
        None,
    )
    if not pm or pm.get("value") is None:
        return None
    return float(pm["value"])


def _rdna_recovery_cr(damage: dict[str, Any] | None) -> float | None:
    rdna = (damage or {}).get("rdna") or {}
    recovery = next(
        (h for h in (rdna.get("headline") or []) if h.get("id") == "recovery"),
        None,
    )
    if recovery and recovery.get("value_cr") is not None:
        return float(recovery["value_cr"])
    total = next((r for r in (rdna.get("rows") or []) if r.get("id") == "total"), None)
    if total and total.get("recovery_cr") is not None:
        return float(total["recovery_cr"])
    return None


def _rdna_effects_cr(damage: dict[str, Any] | None) -> float | None:
    rdna = (damage or {}).get("rdna") or {}
    effects = next(
        (h for h in (rdna.get("headline") or []) if h.get("id") == "effects"),
        None,
    )
    if effects and effects.get("value_cr") is not None:
        return float(effects["value_cr"])
    total = next((r for r in (rdna.get("rows") or []) if r.get("id") == "total"), None)
    if total and total.get("effects_cr") is not None:
        return float(total["effects_cr"])
    return None


def compute_funding_gap(
    *,
    relief_received: dict[str, Any] | None,
    damage: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """Return crore bars for received · recovery · difference, or None if either side is missing."""
    received_cr = npr_to_crore(_pm_fund_npr(relief_received))
    recovery_cr = _rdna_recovery_cr(damage)
    if received_cr is None or recovery_cr is None:
        return None

    effects_cr = _rdna_effects_cr(damage)
    gap_cr = round(recovery_cr - received_cr, 2)
    received = relief_received or {}
    rdna = (damage or {}).get("rdna") or {}

    return {
        "unit": "npr_cr",
        "received_cr": received_cr,
        "recovery_cr": recovery_cr,
        "effects_cr": effects_cr,
        "gap_cr": gap_cr,
        "received_as_of": received.get("as_of_label_en") or received.get("as_of"),
        "received_as_of_ne": received.get("as_of_label_ne") or received.get("as_of_label_en"),
        "rdna_as_of": rdna.get("as_of_label_en") or (damage or {}).get("as_of_label_en"),
        "rdna_as_of_ne": rdna.get("as_of_label_ne")
        or rdna.get("as_of_label_en")
        or (damage or {}).get("as_of_label_ne"),
        "caveat_en": CAVEAT_EN,
        "caveat_ne": CAVEAT_NE,
        "bars": [
            {
                "id": "received",
                "label_en": "PM fund cash",
                "label_ne": "प्रधानमन्त्री कोष नगद",
                "value_cr": received_cr,
            },
            {
                "id": "recovery",
                "label_en": "RDNA recovery need",
                "label_ne": "RDNA पुनर्प्राप्ति आवश्यकता",
                "value_cr": recovery_cr,
            },
            {
                "id": "gap",
                "label_en": "Difference",
                "label_ne": "अन्तर",
                "value_cr": gap_cr,
            },
        ],
    }


def funding_gap_from_snap(snap: dict[str, Any]) -> dict[str, Any] | None:
    return compute_funding_gap(
        relief_received=snap.get("reliefReceived"),
        damage=snap.get("damage"),
    )


def funding_gap_chart_view(snap: dict[str, Any]) -> dict[str, Any] | None:
    gap = funding_gap_from_snap(snap)
    if not gap:
        return None
    return {
        "chart": "funding_gap",
        "unit": gap["unit"],
        "bars": gap["bars"],
        "caveat_en": gap["caveat_en"],
        "caveat_ne": gap["caveat_ne"],
    }
