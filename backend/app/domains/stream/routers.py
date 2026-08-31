"""Server-sent events.

Mounted at /events rather than under /api/v1, because that is the path the
dashboard already opens and this is a stream rather than a versioned resource.
"""

import asyncio
import json
from typing import AsyncIterator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.core.logging import get_logger
from app.domains.hazards import service
from app.domains.stream import bus

log = get_logger(__name__)

router = APIRouter(tags=["stream"])

# The dashboard's own reconnect is the backstop, but a proxy that sees no bytes
# for a minute will often close the connection first.
PING_INTERVAL_S = 15


def _frame(payload: dict) -> bytes:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n".encode()


async def _stream(request: Request) -> AsyncIterator[bytes]:
    # Tell the client the stream is live before anything else, so a page can
    # distinguish "connected, waiting" from "never connected".
    yield _frame({"type": "connected"})

    queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=32)

    async def pump() -> None:
        try:
            async for message in bus.subscribe():
                # Drop rather than block if a slow reader backs up: a stalled
                # browser must not hold the Redis subscription open behind it.
                if queue.full():
                    continue
                await queue.put(message)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            log.warning("sse_pump_failed", error=str(exc))

    pump_task = asyncio.create_task(pump())
    try:
        while True:
            if await request.is_disconnected():
                break
            try:
                message = await asyncio.wait_for(queue.get(), timeout=PING_INTERVAL_S)
            except asyncio.TimeoutError:
                # A comment frame. Keeps proxies from closing an idle stream,
                # and is ignored by EventSource.
                yield b":ping\n\n"
                continue

            if message.get("type") == bus.UPDATE:
                # The signal says a sweep landed; the payload comes off disk.
                # Redis carries the notification, not the megabytes.
                yield _frame({"type": "update", "data": service.get_dashboard()})
            else:
                yield _frame(message)
    finally:
        pump_task.cancel()
        try:
            await pump_task
        except (asyncio.CancelledError, Exception):  # noqa: BLE001
            pass


@router.get("/events", summary="Live sweep updates")
async def events(request: Request) -> StreamingResponse:
    return StreamingResponse(
        _stream(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            # nginx buffers event-streams by default, which turns a live
            # dashboard into one that updates in bursts minutes apart.
            "X-Accel-Buffering": "no",
        },
    )
