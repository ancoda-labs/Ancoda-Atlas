"""The reviewed content exists in two places during the migration. Keep them equal.

backend/content/ is canonical — the API serves it and it ships in the backend
image. frontend/content/ is a temporary copy that only exists because
src/lib/flood.ts still static-imports it and Next.js will not import from
outside its own project root.

Both are deleted from the frontend in the commit that retires flood.ts. Until
then this test is the guard: a reviewed helpline or donation figure edited in
one copy and not the other is exactly the kind of drift that puts a wrong phone
number in front of someone during a disaster.
"""

import hashlib
import json
from pathlib import Path

import pytest

BACKEND_CONTENT = Path(__file__).resolve().parents[1] / "content" / "bhotekoshi-flood"
FRONTEND_CANDIDATES = [
    Path(__file__).resolve().parents[2] / "frontend" / "content" / "bhotekoshi-flood",
    Path("/frontend/content/bhotekoshi-flood"),
]


def _frontend_content() -> Path | None:
    return next((p for p in FRONTEND_CANDIDATES if p.is_dir()), None)


def _digest(path: Path) -> str:
    """Compare parsed JSON, not bytes — formatting is not a discrepancy."""
    return hashlib.sha256(
        json.dumps(json.loads(path.read_text(encoding="utf-8")), sort_keys=True).encode()
    ).hexdigest()


def test_backend_content_is_present():
    assert BACKEND_CONTENT.is_dir(), "the canonical reviewed content is missing"


def test_the_two_copies_have_not_drifted():
    frontend = _frontend_content()
    if frontend is None:
        pytest.skip("frontend copy already retired — nothing left to drift")

    backend_files = {p.relative_to(BACKEND_CONTENT): p for p in BACKEND_CONTENT.rglob("*.json")}
    frontend_files = {p.relative_to(frontend): p for p in frontend.rglob("*.json")}

    assert set(backend_files) == set(frontend_files), (
        f"file sets differ: only in backend {sorted(set(backend_files) - set(frontend_files))}, "
        f"only in frontend {sorted(set(frontend_files) - set(backend_files))}"
    )

    drifted = [
        str(name)
        for name in backend_files
        if _digest(backend_files[name]) != _digest(frontend_files[name])
    ]
    assert not drifted, f"reviewed content differs between the copies: {drifted}"
