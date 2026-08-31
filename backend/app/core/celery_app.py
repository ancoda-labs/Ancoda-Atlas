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
    include=["app.domains.hazards.tasks"],
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
            "options": {"queue": "sweeps", "expires": settings.REFRESH_INTERVAL_MINUTES * 60},
        },
    },
)
