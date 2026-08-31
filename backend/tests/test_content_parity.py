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
