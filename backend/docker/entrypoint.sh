#!/bin/sh
# Brings the API container up to a working state before serving, so a fresh
# `make up` needs no follow-up commands.
#
# Every step is idempotent — this runs on every start, not just the first.
#
# Note what is NOT here: no migration step. Atlas reaches Supabase over
# PostgREST, which cannot run DDL. The schema lives in supabase/migrations/ and
# is applied once per project, out of band.
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
            print(f"Connected to {host}:{port}")
            break
    except OSError:
        time.sleep(1)
else:
    # Not fatal. Redis carries the sweep signal and the Celery broker, so
    # without it the dashboard stops updating live — but every request-driven
    # route still answers, and saying so beats refusing to start.
    print("WARNING: Redis unreachable; live updates will be unavailable.")
PY

echo "==> Ensuring the runs directory exists..."
mkdir -p "${ATLAS_RUNS_DIR:-/app/runs}" || \
  echo "WARNING: could not create ${ATLAS_RUNS_DIR:-/app/runs} (read-only mount?)"

echo "==> Starting the API..."
if [ "$APP_ENV" = "production" ]; then
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000
else
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
fi
