"""The channel the worker uses to tell the API a sweep landed.

Atlas keeps its state in files under runs/, and a file cannot notify anyone it
changed. The dashboard's live update depends on knowing, so the worker
publishes a few bytes here and the API re-reads the file and pushes to its SSE
clients.

Redis carries the signal, never the state. The messages are deliberately tiny —
a type and a timestamp — because the payload is already on disk where every API
replica can read it, and putting a multi-megabyte sweep through pub/sub would
buy nothing but memory pressure.
"""

import json
from typing import Any, AsyncIterator

import redis.asyncio as aioredis

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger(__name__)

CHANNEL = "atlas:events"

# Message types, matching what the Node /events route emitted — the dashboard
# already parses these.
SWEEP_START = "sweep_start"
UPDATE = "update"


def publish_sync(message: dict[str, Any]) -> None:
    """Publish from the Celery worker, which is synchronous.

    Never raises. Redis being down means the dashboard falls back to its
    polling cycle, which is a degradation the frontend already handles — it is
    not a reason to fail a sweep that produced good data.
    """
    import redis

    try:
        client = redis.from_url(settings.REDIS_URL)
        receivers = client.publish(CHANNEL, json.dumps(message))
        client.close()
        # The receiver count is worth logging. Zero is normal — nobody has the
        # dashboard open — but a permanent zero while a page is plainly open is
        # the signature of the API and the worker pointing at different Redis
        # databases, which is otherwise invisible.
        log.debug("event_published", type=message.get("type"), receivers=receivers)
    except Exception as exc:  # noqa: BLE001
        log.warning("event_publish_failed", error=str(exc), type=message.get("type"))


async def subscribe() -> AsyncIterator[dict[str, Any]]:
    """Yield messages published on the channel, for one SSE connection."""
    client = aioredis.from_url(settings.REDIS_URL)
    pubsub = client.pubsub()
    try:
        await pubsub.subscribe(CHANNEL)
        async for raw in pubsub.listen():
            if raw.get("type") != "message":
                continue
            try:
                data = raw["data"]
                yield json.loads(data.decode() if isinstance(data, bytes) else data)
            except (ValueError, AttributeError):
                continue
    finally:
        try:
            await pubsub.unsubscribe(CHANNEL)
            await pubsub.aclose()
            await client.aclose()
        except Exception:  # noqa: BLE001 - teardown must not raise into the stream
            pass
