"""Our World in Data CO₂ dataset — Nepal's share, not a flood attribution.

The CSV is public-domain / CC-BY (Global Carbon Project + Our World in Data).
Atlas computes five small framings for one country set and stores those. It
does not download the bulk dataset for redistribution.

This is background. Nothing here is a cause of any specific flood.

Runnable alone:  python -m app.domains.climate.sources.owid_co2
"""

from __future__ import annotations

import csv
import io
from typing import Any

from app.core.http import is_error, now_iso, safe_fetch
from app.core.logging import get_logger

log = get_logger(__name__)

CSV_URL = "https://owid-public.owid.io/data/co2/owid-co2-data.csv"
SOURCE = {
    "label": "Our World in Data — CO₂ dataset",
    "url": "https://github.com/owid/co2-data",
    "datasetUrl": CSV_URL,
    "attribution": (
        "Global Carbon Project; Our World in Data. Public domain / CC-BY. "
        "Territorial fossil CO₂ and cement; excludes land-use change."
    ),
}

UA = "AncodaAtlas/4.0 (Nepal hazard monitoring; +https://github.com/ancoda-labs/Ancoda-Atlas)"
HEADERS = {"Accept": "text/csv,text/plain,*/*", "User-Agent": UA}
TIMEOUT_S = 60.0

DEFAULT_METRIC = "annual_latest"
METRIC_IDS = (
    "cumulative_1750",
    "cumulative_1850",
    "annual_latest",
    "per_capita",
    "consumption",
)

# Same 10 throughout every framing. Nepal is always in and never dropped.
PRIMARY_IDS = (
    "unitedStates",
    "china",
    "europeanUnion",
    "russia",
    "india",
    "japan",
    "unitedKingdom",
    "brazil",
    "indonesia",
    "nepal",
)

# Fallback if the reviewed file has no peer list. Nepal is added at build time.
DEFAULT_PEERS = (
    "sriLanka",
    "kenya",
    "ghana",
    "cambodia",
    "laos",
    "senegal",
    "afghanistan",
    "uganda",
)

ENTITIES: dict[str, dict[str, set[str]]] = {
    "nepal": {"names": {"nepal"}, "iso": {"npl"}},
    "unitedStates": {"names": {"united states"}, "iso": {"usa"}},
    "europeanUnion": {
        "names": {
            "european union (27)",
            "european union (27 countries)",
            "eu-27",
        },
        "iso": {"owid_eu27"},
    },
    "china": {"names": {"china"}, "iso": {"chn"}},
    "india": {"names": {"india"}, "iso": {"ind"}},
    "russia": {"names": {"russia"}, "iso": {"rus"}},
    "japan": {"names": {"japan"}, "iso": {"jpn"}},
    "unitedKingdom": {
        "names": {"united kingdom", "uk"},
        "iso": {"gbr"},
    },
    "brazil": {"names": {"brazil"}, "iso": {"bra"}},
    "indonesia": {"names": {"indonesia"}, "iso": {"idn"}},
    "world": {"names": {"world"}, "iso": {"owid_wrl"}},
    "sriLanka": {"names": {"sri lanka"}, "iso": {"lka"}},
    "kenya": {"names": {"kenya"}, "iso": {"ken"}},
    "ghana": {"names": {"ghana"}, "iso": {"gha"}},
    "cambodia": {"names": {"cambodia"}, "iso": {"khm"}},
    "laos": {"names": {"laos", "lao pdr", "lao people's democratic republic"}, "iso": {"lao"}},
    "senegal": {"names": {"senegal"}, "iso": {"sen"}},
    "afghanistan": {"names": {"afghanistan"}, "iso": {"afg"}},
    "uganda": {"names": {"uganda"}, "iso": {"uga"}},
}

LABELS: dict[str, dict[str, str]] = {
    "nepal": {"en": "Nepal", "ne": "नेपाल"},
    "unitedStates": {"en": "United States", "ne": "संयुक्त राज्य अमेरिका"},
    "europeanUnion": {"en": "EU-27", "ne": "युरोपेली संघ-२७"},
    "china": {"en": "China", "ne": "चीन"},
    "india": {"en": "India", "ne": "भारत"},
    "russia": {"en": "Russia", "ne": "रुस"},
    "japan": {"en": "Japan", "ne": "जापान"},
    "unitedKingdom": {"en": "United Kingdom", "ne": "संयुक्त अधिराज्य"},
    "brazil": {"en": "Brazil", "ne": "ब्राजिल"},
    "indonesia": {"en": "Indonesia", "ne": "इन्डोनेसिया"},
    "world": {"en": "World", "ne": "विश्व"},
    "sriLanka": {"en": "Sri Lanka", "ne": "श्रीलंका"},
    "kenya": {"en": "Kenya", "ne": "केन्या"},
    "ghana": {"en": "Ghana", "ne": "घाना"},
    "cambodia": {"en": "Cambodia", "ne": "कम्बोडिया"},
    "laos": {"en": "Laos", "ne": "लाओस"},
    "senegal": {"en": "Senegal", "ne": "सेनेगल"},
    "afghanistan": {"en": "Afghanistan", "ne": "अफगानिस्तान"},
    "uganda": {"en": "Uganda", "ne": "युगान्डा"},
}


def _number(value: Any) -> float | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text or text.lower() in {"nan", "na", "null", "."}:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _year(value: Any) -> int | None:
    number = _number(value)
    if number is None:
        return None
    year = int(number)
    return year if 1750 <= year <= 2100 else None


def entity_id(country: str | None, iso_code: str | None) -> str | None:
    name = (country or "").strip().lower()
    iso = (iso_code or "").strip().lower()
    for key, aliases in ENTITIES.items():
        if name in aliases["names"] or iso in aliases["iso"]:
            return key
    return None


def _wanted(peer_ids: list[str]) -> set[str]:
    return {"world", "nepal", *PRIMARY_IDS, *peer_ids}


def compact_row(row: dict[str, str], wanted: set[str]) -> dict[str, Any] | None:
    """One country-year for a tracked entity. Missing figures stay None."""
    key = entity_id(row.get("country"), row.get("iso_code"))
    year = _year(row.get("year"))
    if key is None or key not in wanted or year is None:
        return None
    return {
        "id": key,
        "year": year,
        "co2": _number(row.get("co2")),
        "co2PerCapita": _number(row.get("co2_per_capita")),
        "shareGlobalCo2": _number(row.get("share_global_co2")),
        "shareGlobalCumulativeCo2": _number(row.get("share_global_cumulative_co2")),
        "cumulativeCo2": _number(row.get("cumulative_co2")),
        "consumptionCo2": _number(row.get("consumption_co2")),
    }


def _by_entity(rows: list[dict[str, Any]]) -> dict[str, dict[int, dict[str, Any]]]:
    out: dict[str, dict[int, dict[str, Any]]] = {}
    for row in rows:
        out.setdefault(row["id"], {})[row["year"]] = row
    return out


def latest_year(
    index: dict[str, dict[int, dict[str, Any]]],
    field: str,
    required: tuple[str, ...] = ("nepal", "world"),
) -> int | None:
    """Newest year in which every `required` entity has `field` set."""
    sets = []
    for key in required:
        years = {year for year, rec in index.get(key, {}).items() if rec.get(field) is not None}
        sets.append(years)
    if not sets:
        return None
    common = sets[0].intersection(*sets[1:]) if len(sets) > 1 else sets[0]
    return max(common) if common else None


def _cum_since_1850(years: dict[int, dict[str, Any]], end: int) -> float | None:
    rec = years.get(end)
    if rec is None or rec.get("cumulativeCo2") is None:
        return None
    prior = [year for year in years if year < 1850 and years[year].get("cumulativeCo2") is not None]
    baseline = years[max(prior)]["cumulativeCo2"] if prior else 0.0
    return rec["cumulativeCo2"] - baseline


def _row(entity: str, value: float) -> dict[str, Any]:
    labels = LABELS[entity]
    return {
        "id": entity,
        "labelEn": labels["en"],
        "labelNe": labels["ne"],
        "value": value,
    }


def _series(
    ids: tuple[str, ...] | list[str],
    values: dict[str, float],
) -> list[dict[str, Any]]:
    """Present countries only, Nepal kept if it has a value. Never invent."""
    rows = [_row(key, values[key]) for key in ids if key in values]
    if "nepal" in values and all(row["id"] != "nepal" for row in rows):
        rows.append(_row("nepal", values["nepal"]))
    return rows


def _fill_caption(template: str | None, year: int | None) -> str | None:
    if not template:
        return None
    return template.replace("{year}", str(year) if year is not None else "")


def _metric(
    *,
    metric_id: str,
    year: int | None,
    unit: str,
    values: dict[str, float],
    peers: list[str],
    captions: dict[str, Any],
) -> dict[str, Any] | None:
    if year is None or "nepal" not in values:
        return None
    meta = captions.get(metric_id) or {}
    return {
        "id": metric_id,
        "year": year,
        "unit": unit,
        "nameEn": _fill_caption(meta.get("name_en") or metric_id, year) or metric_id,
        "nameNe": _fill_caption(meta.get("name_ne") or metric_id, year) or metric_id,
        "captionEn": _fill_caption(meta.get("caption_en"), year),
        "captionNe": _fill_caption(meta.get("caption_ne"), year),
        "scaleCaptionEn": _fill_caption(
            meta.get("scale_caption_en") or captions.get("scale_caption_en"), year
        ),
        "scaleCaptionNe": _fill_caption(
            meta.get("scale_caption_ne") or captions.get("scale_caption_ne"), year
        ),
        "rows": _series(PRIMARY_IDS, values),
        "scaleRows": _series(["nepal", *peers], values),
    }


def build_metrics(
    index: dict[str, dict[int, dict[str, Any]]],
    peers: list[str],
    captions: dict[str, Any],
) -> dict[str, dict[str, Any]]:
    territorial_year = latest_year(index, "co2")
    consumption_year = latest_year(index, "consumptionCo2", required=("nepal",))
    metrics: dict[str, dict[str, Any]] = {}

    if territorial_year is not None:
        share_1750: dict[str, float] = {}
        annual: dict[str, float] = {}
        per_capita: dict[str, float] = {}
        for key, years in index.items():
            rec = years.get(territorial_year)
            if rec is None:
                continue
            if rec.get("shareGlobalCumulativeCo2") is not None:
                share_1750[key] = rec["shareGlobalCumulativeCo2"]
            if rec.get("co2") is not None:
                annual[key] = rec["co2"]
            if rec.get("co2PerCapita") is not None:
                per_capita[key] = rec["co2PerCapita"]

        built = _metric(
            metric_id="cumulative_1750",
            year=territorial_year,
            unit="pct",
            values=share_1750,
            peers=peers,
            captions=captions,
        )
        if built:
            metrics["cumulative_1750"] = built
        built = _metric(
            metric_id="annual_latest",
            year=territorial_year,
            unit="mt",
            values=annual,
            peers=peers,
            captions=captions,
        )
        if built:
            metrics["annual_latest"] = built
        built = _metric(
            metric_id="per_capita",
            year=territorial_year,
            unit="t",
            values=per_capita,
            peers=peers,
            captions=captions,
        )
        if built:
            metrics["per_capita"] = built

        world_1850 = _cum_since_1850(index.get("world") or {}, territorial_year)
        if world_1850 and world_1850 > 0:
            share_1850: dict[str, float] = {}
            for key, years in index.items():
                amount = _cum_since_1850(years, territorial_year)
                if amount is None:
                    continue
                share_1850[key] = (amount / world_1850) * 100.0
            built = _metric(
                metric_id="cumulative_1850",
                year=territorial_year,
                unit="pct",
                values=share_1850,
                peers=peers,
                captions=captions,
            )
            if built:
                metrics["cumulative_1850"] = built

    if consumption_year is not None:
        consumption: dict[str, float] = {}
        for key, years in index.items():
            rec = years.get(consumption_year)
            if rec is None or rec.get("consumptionCo2") is None:
                continue
            consumption[key] = rec["consumptionCo2"]
        built = _metric(
            metric_id="consumption",
            year=consumption_year,
            unit="mt",
            values=consumption,
            peers=peers,
            captions=captions,
        )
        if built:
            metrics["consumption"] = built

    return metrics


def parse_owid_csv(
    text: str,
    *,
    peers: list[str] | None = None,
    captions: dict[str, Any] | None = None,
    scale_caption_en: str | None = None,
    scale_caption_ne: str | None = None,
) -> dict[str, Any]:
    """Five framings for the latest usable years, or an error shape.

    Never invents a number. A country missing from a framing is omitted
    rather than filled from another year, so a bar chart cannot mix years.
    """
    fetched_at = now_iso()
    peer_ids = [p for p in (peers or list(DEFAULT_PEERS)) if p in ENTITIES and p != "nepal"]
    caption_book = dict(captions) if isinstance(captions, dict) else {}
    if scale_caption_en:
        caption_book["scale_caption_en"] = scale_caption_en
    if scale_caption_ne:
        caption_book["scale_caption_ne"] = scale_caption_ne

    if not text or not text.strip():
        return _error("empty CSV", fetched_at)

    reader = csv.DictReader(io.StringIO(text.lstrip("\ufeff")))
    if not reader.fieldnames:
        return _error("CSV has no header", fetched_at)

    wanted = _wanted(peer_ids)
    rows: list[dict[str, Any]] = []
    for raw in reader:
        if not isinstance(raw, dict):
            continue
        compact = compact_row(raw, wanted)
        if compact:
            rows.append(compact)

    index = _by_entity(rows)
    if "nepal" not in index or "world" not in index:
        return _error("Nepal or World missing from the file", fetched_at)

    metrics = build_metrics(index, peer_ids, caption_book)
    default = metrics.get(DEFAULT_METRIC)
    if not default:
        return _error("no year with Nepal and World CO2 figures", fetched_at)

    return {
        "year": default["year"],
        "defaultMetric": DEFAULT_METRIC,
        "metrics": metrics,
        "error": None,
        "stale": False,
        "source": SOURCE,
        "fetchedAt": fetched_at,
        "lastAttemptAt": fetched_at,
    }


def _error(message: str, fetched_at: str) -> dict[str, Any]:
    return {
        "year": None,
        "defaultMetric": DEFAULT_METRIC,
        "metrics": {},
        "error": message,
        "stale": True,
        "source": SOURCE,
        "fetchedAt": fetched_at,
        "lastAttemptAt": fetched_at,
    }


def _load_reviewed() -> tuple[list[str], dict[str, Any], str | None, str | None]:
    from app.domains.climate.content import load_source_facts

    facts = load_source_facts()
    peers = [
        str(item)
        for item in (facts.get("nepalScalePeers") or DEFAULT_PEERS)
        if isinstance(item, str) and item in ENTITIES
    ]
    return (
        peers,
        facts.get("metrics") or {},
        facts.get("scale_caption_en") if isinstance(facts.get("scale_caption_en"), str) else None,
        facts.get("scale_caption_ne") if isinstance(facts.get("scale_caption_ne"), str) else None,
    )


async def fetch_owid_co2() -> dict[str, Any]:
    """Download and parse. Never raises — a failure is an error shape."""
    fetched_at = now_iso()
    body = await safe_fetch(
        CSV_URL,
        timeout=TIMEOUT_S,
        retries=1,
        headers=HEADERS,
        as_="text",
    )
    if is_error(body):
        log.warning("owid_co2_unavailable", error=body.error)
        return _error(body.error, fetched_at)
    if not isinstance(body, str):
        return _error("upstream answered with something other than CSV", fetched_at)
    peers, captions, scale_en, scale_ne = _load_reviewed()
    return parse_owid_csv(
        body,
        peers=peers,
        captions=captions,
        scale_caption_en=scale_en,
        scale_caption_ne=scale_ne,
    )


if __name__ == "__main__":
    import asyncio
    import json

    print(json.dumps(asyncio.run(fetch_owid_co2()), indent=2, ensure_ascii=False))
