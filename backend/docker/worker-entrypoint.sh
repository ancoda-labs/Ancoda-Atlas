#!/bin/sh
# The worker runs every sweep and refresh, and is the ONLY writer of runs/.
#
# Do not scale this past one replica. Two workers would race on the same sweep
# and interleave their writes into the same files. See the note at the top of
# infra/prod/docker-compose.yml.
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

echo "==> Ensuring the runs directory exists..."
mkdir -p "${ATLAS_RUNS_DIR:-/app/runs}"

echo "==> Starting the Celery worker..."
exec celery -A app.core.celery_app.celery_app worker -Q sweeps,default -l info --concurrency=2
