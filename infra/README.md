# Infrastructure

`dev/` is a Compose stack for local development: Redis, the FastAPI API,
the Celery worker, the scheduler and the Next.js dev server, with the
backend and frontend both bind-mounted so both hot-reload.

The database is **not** in the stack. Atlas talks to a hosted Supabase
project over PostgREST, and it is the same project in development as in
production. Set `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` in
`.env` at the repository root — or leave them empty, and the features
that need to remember something between requests (ground-report photos,
rescue corrections, news digests) hide themselves while the rest of Atlas
runs normally.

Object storage is optional too, and sits behind a Compose profile.

```bash
cp .env.example .env      # from the repository root
make up
make storage              # only if you want photo uploads locally
```

| Service | URL |
|---|---|
| Dashboard | http://localhost:3117 |
| Flood desk | http://localhost:3117/bhotekoshi-flood |
| API | http://localhost:8000 |
| API docs | http://localhost:8000/docs |
| MinIO console | http://localhost:9001 *(profile `storage`)* |

Every host port is overridable in `.env`: `PORT`, `API_HOST_PORT`,
`REDIS_HOST_PORT`, `MINIO_API_PORT`, `MINIO_CONSOLE_PORT`.

## The three backend processes

| Service | Does |
|---|---|
| `api` | Serves the HTTP surface. Reads `runs/`, never writes it. |
| `worker` | Runs every sweep and refresh. The **only** writer of `runs/`. |
| `beat` | The clock. Triggers the 15-minute sweep and the 10-minute desk refresh. |

`beat` is kept separate from `worker` so that restarting a worker
mid-sweep does not also lose the schedule.

## Notes

**Redis carries the signal, not the state.** The sweep results are JSON
files under `runs/`, mounted into both `api` and `worker`. A file cannot
tell anyone it changed, and the dashboard's live update depends on
knowing — so the worker publishes a few bytes on a Redis channel and the
API re-reads the file and pushes to its SSE clients. Redis is also
Celery's broker, so it is not an extra dependency.

**One writer, atomic writes.** Two processes sharing a directory is a
read-modify-write race. It is contained rather than tolerated: the worker
is the sole writer, the API mounts `runs/` read-only in production, and
every write goes to a temp file and is renamed into place — so a reader
sees one complete version or the next, never a half-written one.

**Do not scale the worker.** Two of them would race on the same sweep.
The single-replica constraint is the price of keeping state on disk;
see the note at the top of `prod/docker-compose.yml`.

**The worker is not optional.** Without it nothing sweeps, and the
dashboard renders its empty skeleton forever. That skeleton is the
correct degraded state — Atlas shows nothing rather than something
invented — but it is not a working install.

**A cold start looks empty, briefly.** The first sweep takes tens of
seconds across five upstreams. Until it lands there are no figures to
show, and the page says so.

**Without `LLM_API_KEY` the dashboard still works.** The actionable reads
fall back to the rule-based engine, and briefs stay in Nepali and English
rather than gaining the other locales.

**`make migrate` does not migrate.** PostgREST cannot run DDL. The schema
lives in `supabase/migrations/` and is applied once per project with
`supabase db push` or the SQL editor; `make migrate` only checks that the
tables and RPCs are reachable.

## Production (`infra/prod`)

Traefik v3 terminating TLS with automatic Let's Encrypt, the Next.js
frontend, the API, one worker, one scheduler and Redis — all on a single
host. See `prod/README.md`.
