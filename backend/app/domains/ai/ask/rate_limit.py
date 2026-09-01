"""Hourly budgets for the sandbox.

Two buckets, and the global one is the important one: this is an experimental
page on a public-safety site, and a single visitor should not be able to spend
the desk's whole model budget for the hour.

In-process, like the Node original. Behind more than one API replica each holds
its own, which multiplies the ceiling — acceptable for a sandbox, and noted
here rather than discovered later.
"""

import hashlib
import hmac
import os
import time
from typing import NamedTuple

HOUR_S = 3600.0


class Bucket:
    def __init__(self) -> None:
        self.turns = 0
        self.tokens = 0
        self.window_start = time.monotonic()

    def roll(self) -> None:
        if time.monotonic() - self.window_start >= HOUR_S:
            self.turns = 0
            self.tokens = 0
            self.window_start = time.monotonic()


class Remaining(NamedTuple):
    hour: int
    globalHour: int  # noqa: N815 - the key the frontend reads


_by_key: dict[str, Bucket] = {}
_global = Bucket()


def _limit(name: str, default: int, minimum: int = 1) -> int:
    raw = os.getenv(name)
    try:
        value = int(raw) if raw else default
    except ValueError:
        return default
    return value if value >= minimum else default


def max_turns() -> int:
    return _limit("ASK_SANDBOX_MAX_TURNS_PER_HOUR", 12)


def max_global() -> int:
    return _limit("ASK_SANDBOX_MAX_GLOBAL_TURNS_PER_HOUR", 80)


def max_output_tokens() -> int:
    return _limit("ASK_SANDBOX_MAX_OUTPUT_TOKENS", 500, minimum=64)


def hash_client(ip: str) -> str:
    from app.core.config import settings

    salt = settings.ATLAS_IP_SALT or "atlas-ask-sandbox"
    return hmac.new(salt.encode(), ip.encode(), hashlib.sha256).hexdigest()[:32]


def _bucket_for(key: str) -> Bucket:
    bucket = _by_key.setdefault(key, Bucket())
    bucket.roll()
    return bucket


def remaining_for(key: str) -> Remaining:
    local = _bucket_for(key)
    _global.roll()
    return Remaining(
        hour=max(0, max_turns() - local.turns),
        globalHour=max(0, max_global() - _global.turns),
    )


def can_spend(key: str) -> bool:
    left = remaining_for(key)
    return left.hour > 0 and left.globalHour > 0


def record_turn(key: str, output_tokens: int = 0) -> None:
    local = _bucket_for(key)
    local.turns += 1
    local.tokens += output_tokens
    _global.roll()
    _global.turns += 1
    _global.tokens += output_tokens
