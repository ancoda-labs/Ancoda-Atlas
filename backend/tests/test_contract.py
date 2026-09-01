"""The frontend's TypeScript types are the contract. This checks we meet it.

Why this exists rather than Pydantic response models:

The dashboard payload is a deep nested shape defined in
frontend/src/types/index.ts, and that file is not changing — the UI is being
kept as it is. Re-declaring those forty-odd interfaces as Pydantic models would
put the contract in a *third* place that has to be kept in sync with the other
two, and Pydantic's default behaviour of dropping unknown keys would do it
silently: a field the synthesizer stopped emitting would vanish from the
response with nothing raised anywhere.

So the contract is asserted directly against the TypeScript source. This tests
the real payload rather than a schema derived from a model, which is the thing
the browser actually receives.
"""

import re
from pathlib import Path

from app.domains.hazards.service import empty_snapshot


def _locate_types() -> Path:
    """Find frontend/src/types/index.ts from wherever the suite is running.

    On the host the repository root is two levels above backend/tests. In the
    container only backend/ is the working tree, so infra/dev mounts the
    frontend's types read-only at /frontend for exactly this check.
    """
    candidates = [
        Path(__file__).resolve().parents[2] / "frontend" / "src" / "types" / "index.ts",
        Path("/frontend/src/types/index.ts"),
    ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    return candidates[0]


TYPES_FILE = _locate_types()


def _interface_fields(source: str, name: str) -> dict[str, bool]:
    """Field name -> whether it is optional, for one TS interface."""
    match = re.search(rf"export interface {name} \{{(.*?)\n\}}", source, re.S)
    assert match, f"{name} not found in {TYPES_FILE}"
    fields: dict[str, bool] = {}
    for line in match.group(1).splitlines():
        line = line.strip()
        if not line or line.startswith("//") or line.startswith("/*") or line.startswith("*"):
            continue
        field = re.match(r"(\w+)(\??):", line)
        if field:
            fields[field.group(1)] = field.group(2) == "?"
    return fields


def test_the_types_file_is_where_we_think_it_is():
    """A moved contract must fail loudly, not silently skip every check below.

    If this fails in the container, infra/dev/docker-compose.yml has stopped
    mounting the frontend's types at /frontend.
    """
    assert TYPES_FILE.is_file(), (
        f"contract file not found. Looked at {TYPES_FILE}. In the container it "
        "is mounted at /frontend by infra/dev/docker-compose.yml."
    )


def test_the_empty_snapshot_carries_every_required_field():
    """The pre-sweep skeleton must satisfy HazardSnapshot too.

    It is what a reader gets on a cold box, and a view destructuring a missing
    key crashes exactly as hard then as it would with real data.
    """
    source = TYPES_FILE.read_text(encoding="utf-8")
    contract = _interface_fields(source, "HazardSnapshot")
    required = {name for name, optional in contract.items() if not optional}

    payload = empty_snapshot()
    missing = required - set(payload)
    assert not missing, f"empty snapshot is missing required fields: {sorted(missing)}"


def test_the_snapshot_emits_no_field_the_contract_does_not_declare():
    """An undeclared key is dead weight the UI will never read."""
    source = TYPES_FILE.read_text(encoding="utf-8")
    contract = _interface_fields(source, "HazardSnapshot")

    extra = set(empty_snapshot()) - set(contract)
    assert not extra, f"snapshot emits undeclared fields: {sorted(extra)}"


def test_every_key_is_camel_case():
    """A snake_case slip breaks a panel at runtime with no error to catch it.

    This is the single most likely way the port goes wrong, because it is what
    Python naming conventions push you toward on every new field.
    """
    offenders = [key for key in _walk_keys(empty_snapshot()) if "_" in key]
    assert not offenders, f"snake_case keys in the payload: {sorted(set(offenders))}"


def _walk_keys(value, depth: int = 0):
    if depth > 8:
        return
    if isinstance(value, dict):
        for key, child in value.items():
            yield key
            yield from _walk_keys(child, depth + 1)
    elif isinstance(value, list):
        for item in value[:3]:
            yield from _walk_keys(item, depth + 1)
