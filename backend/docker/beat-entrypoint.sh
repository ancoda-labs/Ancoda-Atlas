#!/bin/sh
# The clock. Triggers the national hazard sweep and the flood desk refresh on
# their own cadences.
#
# Separate from the worker so that restarting a worker mid-sweep does not also
# lose the schedule.
set -e

echo "==> Waiting for Redis to become reachable..."
python - <<'PY'
import os, socket, time
from urllib.parse import urlparse

url = os.getenv("REDIS_URL", "redis://redis:6379/0")
parsed = urlparse(url)
host, port = parsed.hostname or "redis", parsed.port or 6379
for _ in range(40):
    try:
        with socket.create_connection((host, port), timeout=2):
            break
    except OSError:
        time.sleep(1)
PY

echo "==> Starting Celery beat..."
# The schedule file goes in /tmp rather than the working directory: /app is a
# bind mount in development, and a beat state file written there shows up as an
# untracked change in the repository on every start.
exec celery -A app.core.celery_app.celery_app beat -l info --schedule /tmp/atlas-beat-schedule
