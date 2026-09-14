"""PMDRF available cash vs RDNA recovery need — Atlas arithmetic, not an official shortfall.

The two inputs are separately reviewed figures that Atlas already publishes.
Received cash prefers the published "total available" label (NPR bank stock +
USD accounts at the desk's published rate). Foreign pledges, PhonePe, World
Bank and IFRC stay off this bar — they are not that bank stock.
"""

from __future__ import annotations

from typing import Any

NPR_PER_CRORE = 10_000_000

CAVEAT_EN = (
    "Atlas arithmetic — not an official MoF or NPC shortfall. "
    "PM Disaster Relief Fund available cash (NPR bank stock + USD accounts at "
    "the published rate) versus NPC–NDRRMA preliminary RDNA recovery need. "
    "Foreign pledges outside the fund table, PhonePe, World Bank and IFRC "
    "are not in the cash bar."
)
CAVEAT_NE = (
    "एट्लसको अंकगणित — आधिकारिक MoF वा NPC अभाव होइन। "
    "प्रधानमन्त्री दैवी प्रकोप उद्धार कोषको उपलब्ध नगद "
    "(NPR बैंक मौज्दात + प्रकाशित दरमा USD खाता) विरुद्ध "
    "NPC–NDRRMA प्रारम्भिक RDNA पुनर्प्राप्ति आवश्यकता। "
    "कोष तालिकाबाहिरका वैदेशिक घोषणा, फोनपे, विश्व बैंक र आईएफआरसी "
    "यो नगद बारमा छैनन्।"
)

RECEIVED_LABEL_EN = "PM fund available"
RECEIVED_LABEL_NE = "प्रधानमन्त्री कोष उपलब्ध"


def npr_to_crore(npr: float | int | None) -> float | None:
    if npr is None:
        return None
    return round(float(npr) / NPR_PER_CRORE, 2)


def _pm_fund_npr_stock(relief_received: dict[str, Any] | None) -> float | None:
    if not relief_received:
        return None
    pm = next(
        (h for h in (relief_received.get("headline") or []) if h.get("id") == "pm-fund"),
        None,
    )
    if not pm or pm.get("value") is None:
        return None
    return float(pm["value"])


def _pm_fund_total_available_npr(relief_received: dict[str, Any] | None) -> float | None:
    """Published NPR stock + USD-account equivalent — not foreign pledges."""
    if not relief_received:
        return None
    # Prefer an explicit reviewed field when the ask snapshot carries it.
    direct = relief_received.get("total_available_npr")
    if isinstance(direct, (int, float)):
        return float(direct)

    for group in relief_received.get("breakdowns") or []:
        if group.get("id") != "pm-fund":
            continue
        for row in group.get("aside") or []:
            label = (row.get("label_en") or "").lower()
            if "total available" not in label:
                continue
            if (row.get("unit_en") or "NPR").upper() not in ("NPR", "रु.", "RS", "NPR."):
                continue
            if row.get("value") is None:
                continue
            return float(row["value"])
    return None


def _pm_fund_available_npr(relief_received: dict[str, Any] | None) -> float | None:
    """Prefer total-available (NPR + USD); fall back to NPR stock alone."""
    return _pm_fund_total_available_npr(relief_received) or _pm_fund_npr_stock(
        relief_received
    )


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
    """Return crore bars for available · recovery · difference, or None if either side is missing."""
    stock_npr = _pm_fund_npr_stock(relief_received)
    available_npr = _pm_fund_available_npr(relief_received)
    received_cr = npr_to_crore(available_npr)
    recovery_cr = _rdna_recovery_cr(damage)
    if received_cr is None or recovery_cr is None:
        return None

    effects_cr = _rdna_effects_cr(damage)
    gap_cr = round(recovery_cr - received_cr, 2)
    stock_cr = npr_to_crore(stock_npr)
    includes_usd = (
        stock_npr is not None
        and available_npr is not None
        and abs(available_npr - stock_npr) > 1
    )
    received = relief_received or {}
    rdna = (damage or {}).get("rdna") or {}

    return {
        "unit": "npr_cr",
        "received_cr": received_cr,
        "npr_stock_cr": stock_cr,
        "includes_usd_accounts": includes_usd,
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
                "label_en": RECEIVED_LABEL_EN,
                "label_ne": RECEIVED_LABEL_NE,
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
