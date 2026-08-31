"""ReliefWeb (UN OCHA), with an HDX fallback.

Nepal is a standing ReliefWeb country: monsoon floods, landslides, earthquakes
and the post-2015 recovery all report through here.

ReliefWeb has required an approved appname since Nov 2025 and answers 403
without one. When that happens this degrades to the Humanitarian Data Exchange
rather than failing — HDX still answers, but with dataset listings instead of
live situation reports, so the result is marked `stale: True` and the desk says
so rather than presenting the two as equivalent.

Runnable alone:  python -m app.domains.hazards.sources.reliefweb
"""

import asyncio
from typing import Any

from app.core.config import settings
from app.core.http import is_error, now_iso, post_json, safe_fetch
from app.core.nepal import NEPAL_ISO

# v1 was decommissioned and now answers every call with HTTP 410.
BASE = "https://api.reliefweb.int/v2"
HDX_BASE = "https://data.humdata.org/api/3/action"


def _appname() -> str:
    return settings.RELIEFWEB_APPNAME or "atlas"


async def _rw_post(endpoint: str, body: dict[str, Any]) -> Any:
    return await post_json(f"{BASE}/{endpoint}?appname={_appname()}", body, timeout=15.0)


async def search_reports(limit: int = 25, query: str = "") -> Any:
    body: dict[str, Any] = {
        "limit": limit,
        "filter": {"field": "country.iso3", "value": NEPAL_ISO.alpha3.lower()},
        "fields": {
            "include": [
                "title",
                "date.created",
                "country.name",
                "disaster_type.name",
                "url_alias",
                "source.name",
            ]
        },
        "sort": ["date.created:desc"],
    }
    if query:
        body["query"] = {"value": query}
    return await _rw_post("reports", body)


async def get_disasters(limit: int = 25) -> Any:
    body = {
        "limit": limit,
        "fields": {"include": ["name", "date.created", "country.name", "type.name", "status"]},
        "filter": {
            "operator": "AND",
            "conditions": [
                {"field": "status", "value": "ongoing"},
                {"field": "country.iso3", "value": NEPAL_ISO.alpha3.lower()},
            ],
        },
        "sort": ["date.created:desc"],
    }
    return await _rw_post("disasters", body)


# HDX's Nepal group carries everything from trade statistics to refugee
# surveys, so results are filtered down to natural hazards here. Deliberately
# narrow: broader words like "humanitarian", "emergency" and "risk" pull in
# nutrition, COVID and refugee datasets that are not natural hazards.
HDX_HAZARD_TERMS = [
    "earthquake", "seismic", "aftershock",
    "flood", "inundation", "landslide", "avalanche", "glof", "glacial", "glacier",
    "monsoon", "rainfall", "precipitation", "cyclone", "storm", "drought",
    "heat wave", "heatwave", "cold wave", "wildfire", "forest fire",
    "natural hazard", "natural disaster", "disaster risk", "hazard exposure",
    "damage assessment", "disaster response", "disaster management",
]


def _is_hazard_dataset(pkg: dict[str, Any]) -> bool:
    tags = " ".join((t.get("name") or "") for t in (pkg.get("tags") or []))
    text = f"{pkg.get('title') or ''} {pkg.get('notes') or ''} {tags}".lower()
    return any(term in text for term in HDX_HAZARD_TERMS)


def _mentions_nepal_dataset(pkg: dict[str, Any]) -> bool:
    groups = [
        (g.get("name") or g.get("display_name") or "").lower() for g in (pkg.get("groups") or [])
    ]
    if any(g == "npl" or "nepal" in g for g in groups):
        return True
    return "nepal" in (pkg.get("title") or "").lower()


async def hdx_fallback(limit: int = 15) -> list[dict[str, Any]]:
    data = await safe_fetch(
        f"{HDX_BASE}/package_search",
        params={"q": "groups:npl", "rows": limit * 4, "sort": "metadata_modified desc"},
    )
    if is_error(data) or not isinstance(data, dict):
        return []
    results = ((data.get("result") or {}).get("results")) or []
    matched = [p for p in results if _mentions_nepal_dataset(p) and _is_hazard_dataset(p)]
    return [
        {
            "title": pkg.get("title"),
            "date": pkg.get("metadata_modified"),
            "source": pkg.get("dataset_source") or (pkg.get("organization") or {}).get("title"),
            "countries": [g.get("display_name") for g in (pkg.get("groups") or [])],
            "url": f"https://data.humdata.org/dataset/{pkg.get('name')}",
        }
        for pkg in matched[:limit]
    ]


def _error_of(result: Any) -> str | None:
    if is_error(result):
        return result.error
    if isinstance(result, dict) and result.get("error"):
        return str(result["error"])
    return None


async def briefing() -> dict[str, Any]:
    reports, disasters = await asyncio.gather(
        search_reports(limit=15), get_disasters(limit=15)
    )

    rw_error = _error_of(reports) or _error_of(disasters)
    rw_failed = rw_error is not None

    if not rw_failed:
        latest_reports = [
            {
                "title": (r.get("fields") or {}).get("title"),
                "date": ((r.get("fields") or {}).get("date") or {}).get("created"),
                "countries": [
                    c.get("name") for c in ((r.get("fields") or {}).get("country") or [])
                ],
                "disasterType": [
                    d.get("name")
                    for d in ((r.get("fields") or {}).get("disaster_type") or [])
                ],
                "source": [
                    s.get("name") for s in ((r.get("fields") or {}).get("source") or [])
                ],
                "url": (
                    f"https://reliefweb.int{(r.get('fields') or {}).get('url_alias')}"
                    if (r.get("fields") or {}).get("url_alias")
                    else None
                ),
            }
            for r in (reports.get("data") or [])
        ]
        active_disasters = [
            {
                "name": (d.get("fields") or {}).get("name"),
                "date": ((d.get("fields") or {}).get("date") or {}).get("created"),
                "countries": [
                    c.get("name") for c in ((d.get("fields") or {}).get("country") or [])
                ],
                "type": [t.get("name") for t in ((d.get("fields") or {}).get("type") or [])],
                "status": (d.get("fields") or {}).get("status"),
            }
            for d in (disasters.get("data") or [])
        ]
        return {
            "source": "ReliefWeb (UN OCHA)",
            "timestamp": now_iso(),
            "stale": False,
            "latestReports": latest_reports,
            "activeDisasters": active_disasters,
        }

    hdx_datasets = await hdx_fallback(15)
    return {
        "source": "HDX (Humanitarian Data Exchange) — ReliefWeb fallback",
        "timestamp": now_iso(),
        # Degraded rather than failed: HDX still answers, but with dataset
        # listings instead of live situation reports and declared disasters.
        "stale": True,
        "rwError": rw_error,
        "rwNote": (
            "ReliefWeb API requires an approved appname since Nov 2025. Set "
            "RELIEFWEB_APPNAME after registering at "
            "https://apidoc.reliefweb.int/parameters#appname"
        ),
        "activeDisasters": [],
        "latestReports": hdx_datasets,
        "hdxDatasets": hdx_datasets,
    }


if __name__ == "__main__":
    import json

    print(json.dumps(asyncio.run(briefing()), indent=2, ensure_ascii=False))
