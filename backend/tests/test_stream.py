"""The event bus and the SSE frame shapes the dashboard parses."""

import json

from app.domains.stream import bus


def test_publish_never_raises_when_redis_is_down(monkeypatch):
    """A sweep that produced good data must not fail because Redis blinked.

    Losing the notification only costs a live update; the dashboard's polling
    fallback still picks the sweep up.
    """
    import redis

    def explode(*_a, **_k):
        raise ConnectionError("redis is gone")

    monkeypatch.setattr(redis, "from_url", explode)
    bus.publish_sync({"type": bus.UPDATE, "timestamp": "2026-08-31T12:00:00.000Z"})


def test_the_message_types_match_what_the_dashboard_parses():
    """DashboardClient switches on these exact strings."""
    assert bus.UPDATE == "update"
    assert bus.SWEEP_START == "sweep_start"


def test_published_messages_stay_small(monkeypatch):
    """Redis carries the signal, not the state.

    The payload is already on disk where every API replica can read it. Putting
    a multi-megabyte sweep through pub/sub would buy nothing but memory
    pressure, so the message must stay a type and a timestamp.
    """
    captured: dict = {}

    class FakeClient:
        def publish(self, _channel, payload):
            captured["payload"] = payload
            return 1

        def close(self):
            return None

    import redis

    monkeypatch.setattr(redis, "from_url", lambda *_a, **_k: FakeClient())
    bus.publish_sync({"type": bus.UPDATE, "timestamp": "2026-08-31T12:00:00.000Z"})

    assert len(captured["payload"]) < 200
    assert set(json.loads(captured["payload"])) == {"type", "timestamp"}


def test_the_sse_frame_is_shaped_the_way_eventsource_expects():
    from app.domains.stream.routers import _frame

    frame = _frame({"type": "connected"})
    assert frame.startswith(b"data: ")
    # Two newlines terminate an event. One, and the browser waits forever.
    assert frame.endswith(b"\n\n")


def test_frames_do_not_escape_devanagari():
    """A Nepali place name must survive the stream as itself."""
    from app.domains.stream.routers import _frame

    frame = _frame({"type": "update", "place": "स्याफ्रुबेंसी"})
    assert "स्याफ्रुबेंसी" in frame.decode()
