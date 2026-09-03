"""The reviewed content lives in backend/content/ and nowhere else.

This file used to compare two copies. During the migration the frontend kept
its own, because src/lib/flood.ts static-imported the JSON and Next.js will not
import from outside its project root — so the guard existed to stop a helpline
being edited in one copy and not the other.

That copy is gone with the Node backend. What remains is the assertion that the
canonical content is present and parseable, because a malformed reviewed file
is a deploy error rather than a runtime condition, and the page would otherwise
render an empty section rather than saying anything.
"""

import json
from pathlib import Path

import pytest

CONTENT = Path(__file__).resolve().parents[1] / "content" / "bhotekoshi-flood"
CLIMATE = Path(__file__).resolve().parents[1] / "content" / "climate"

REQUIRED = [
    "site.json",
    "what-happened.json",
    "alerts.json",
    "flood-path.json",
    "helplines.json",
    "bank-accounts.json",
    "district-contacts.json",
    "sitrep.json",
    "relief-received.json",
    "relief-needed.json",
    "damage.json",
]


def test_the_content_directory_is_present():
    assert CONTENT.is_dir(), "the canonical reviewed content is missing"


def test_climate_source_facts_parse_and_every_fact_has_a_url():
    """Glacier/GLOF figures are not machine-readable; the reviewed file is the source."""
    path = CLIMATE / "source-facts.json"
    assert path.is_file(), "climate source-facts.json is missing"
    data = json.loads(path.read_text(encoding="utf-8"))
    facts = data.get("facts") or []
    assert facts, "no climate facts are shipped"
    for fact in facts:
        assert fact.get("statement_en"), f"{fact.get('id')} has no English statement"
        assert fact.get("organisation"), f"{fact.get('id')} has no organisation"
        assert fact.get("published"), f"{fact.get('id')} has no publication date"
        assert str(fact.get("url") or "").startswith("http"), f"{fact.get('id')} has no source URL"
        image_url = fact.get("image_url")
        if image_url:
            assert str(image_url).startswith("https://"), f"{fact.get('id')} image_url must be https"
            assert fact.get("image_alt_en"), f"{fact.get('id')} image needs image_alt_en"
            assert fact.get("image_credit_en"), f"{fact.get('id')} image needs image_credit_en"
            assert fact.get("image_alt_ne") == "TODO", (
                f"{fact.get('id')} Nepali image alt must stay TODO until a human writes it"
            )
            assert fact.get("image_credit_ne") == "TODO", (
                f"{fact.get('id')} Nepali image credit must stay TODO until a human writes it"
            )
    metrics = data.get("metrics") or {}
    assert "cumulative_1750" in metrics
    for key, meta in metrics.items():
        assert meta.get("name_en"), f"{key} has no English name"
        assert meta.get("caption_en"), f"{key} has no English caption"
        assert meta.get("name_ne"), f"{key} has no Nepali name"
        assert meta.get("caption_ne"), f"{key} has no Nepali caption"
    assert data.get("nepalScalePeers"), "nepal-scale peer list is missing"
    section = data.get("section") or {}
    for key in ("ice", "lakes", "arrived", "cause", "news"):
        block = section.get(key) or {}
        headline = block.get("headline_en") or ""
        assert 0 < len(headline.split()) <= 20, f"{key} headline exceeds 20 words"
        assert block.get("headline_ne") == "TODO", f"{key} Nepali headline must stay TODO until a human writes it"
        caption = block.get("caption_en")
        if caption:
            extra = block.get("truncated_en") or ""
            assert len((caption + " " + extra).split()) <= 30, f"{key} caption exceeds 30 words"
            assert block.get("caption_ne") == "TODO", f"{key} Nepali caption must stay TODO until a human writes it"
    assert section["ice"]["percent"] == 12
    assert section["lakes"]["china"] == 25
    assert section["lakes"]["nepal"] == 21
    assert section["lakes"]["india"] == 1
    panels = data.get("panels") or {}
    for key in ("heat", "water", "air", "fire"):
        assert panels[key]["enabled"] is False, f"{key} is flagged off until a reviewed source exists"
        assert panels[key].get("todo"), f"{key} needs a TODO naming the missing source"


@pytest.mark.parametrize("name", REQUIRED)
def test_every_required_file_parses(name):
    path = CONTENT / name
    assert path.is_file(), f"{name} is missing"
    json.loads(path.read_text(encoding="utf-8"))


def test_every_relief_fund_parses_and_declares_a_tier():
    """Tier decides whether a donation route reaches the page at all."""
    funds = sorted((CONTENT / "relief-funds").glob("*.json"))
    assert funds, "no relief funds are shipped"
    for path in funds:
        fund = json.loads(path.read_text(encoding="utf-8"))
        assert isinstance(fund.get("tier"), int), f"{path.name} has no tier"


def test_no_frontend_copy_remains():
    """If one comes back, the drift guard has to come back with it."""
    frontend_copy = Path(__file__).resolve().parents[2] / "frontend" / "content"
    assert not frontend_copy.exists(), (
        "a second copy of the reviewed content has reappeared in the frontend; "
        "restore the drift guard or remove the copy"
    )
