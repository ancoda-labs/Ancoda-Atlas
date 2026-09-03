"""The worker and the schedule.

Two queues. `sweeps` carries the long fan-outs across government portals and
hazard feeds; `default` carries everything short. They are separated so a
ten-minute flood refresh cannot sit behind a national sweep that is waiting on
a slow upstream.

Tasks register themselves as each domain lands — the include list grows with
the port rather than being written ahead of it.
"""

from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "atlas",
    broker=settings.broker_url,
    backend=settings.result_backend,
    include=[
        "app.domains.hazards.tasks",
        "app.domains.flood.tasks",
        "app.domains.climate.tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    # A sweep that dies mid-flight should be retried rather than lost, and one
    # worker should hold one sweep at a time — these are long fan-outs across
    # a dozen upstreams, not quick jobs to batch.
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_default_queue="default",
    # Longer than any single source's own timeout budget, so a slow upstream is
    # cut off by the source rather than by Celery killing the whole sweep.
    task_time_limit=900,
    task_soft_time_limit=840,
    beat_schedule={
        # The national hazard sweep. Fifteen minutes by default; the sources
        # behind it move on that timescale or slower.
        "hazard-sweep": {
            "task": "hazards.sweep",
            "schedule": settings.REFRESH_INTERVAL_MINUTES * 60.0,
            "options": {
                "queue": "sweeps",
                # A tick that could not be delivered is dropped rather than
                # queued behind the next one. Two sweeps back to back would
                # hit the same upstreams twice for one interval's worth of
                # new data.
                "expires": settings.REFRESH_INTERVAL_MINUTES * 60,
            },
        },
        # The flood desk. Ten minutes by default: river gauges, the rescue
        # registers and the wire all move on that timescale during a live
        # response, and the sweep's fifteen is too slow for it.
        "flood-refresh": {
            "task": "flood.refresh",
            "schedule": settings.flood_refresh_minutes * 60.0,
            "options": {
                "queue": "sweeps",
                "expires": settings.flood_refresh_minutes * 60,
            },
        },
        # Climate context. The CO₂ file is annual; a weekly retry is enough
        # to pick up a new year and to recover from a failed read.
        "climate-context": {
            "task": "climate.context",
            "schedule": 7 * 24 * 60 * 60.0,
            "options": {
                "queue": "sweeps",
                "expires": 6 * 24 * 60 * 60,
            },
        },
    },
)
