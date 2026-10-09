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

## Continuous delivery (`infra/coolify`)

A push to `main` runs the suite, publishes two images, and tells Coolify to
pull them. The deployment host does not build anything.

```
push to main
  │
  ├─ test              ruff · mypy · pytest · npm run verify
  │                    everything below is gated on this
  ├─ build-and-push    two images -> ghcr.io, tagged `latest` and `<sha>`
  │                    linux/amd64 + linux/arm64
  └─ deploy            GET /api/v1/deploy on Coolify; it pulls and restarts
```

Three properties are deliberate.

**The suite gates the image.** Before this, a green tick meant "Docker built",
which is a different claim from "the code works" — the workflow had one job and
it never ran a test. The pre-commit hook did, but it is local, `--no-verify`
skips it, and it silently skips the entire backend when the developer's Docker
daemon is not running.

**Production runs the artifact CI tested.** One build, in one place. When the
host rebuilt the same Dockerfiles itself, the bytes in production were never
the bytes anything had executed, and the two could drift on a base-image
refresh alone.

**The CI token can deploy and nothing else.** It cannot change which image
production runs, read the stack's environment, or edit configuration — so a
leaked workflow secret cannot repoint the site at an attacker's image. That is
why CI does not pass a tag: Coolify decides what `latest` means, and pinning is
a human action in the UI. The cost is that rollback is manual, which is the
right trade for a public-safety page.

Removing the server-side build also closed a latent one. Coolify passed every
variable to `docker compose build` as `--build-arg`, including `LLM_API_KEY`,
`SUPABASE_SECRET_KEY`, `MINIO_ROOT_PASSWORD`, `ATLAS_MEDIA_SECRET` and
`FLOOD_ADMIN_TOKEN`. Nothing leaked, because neither Dockerfile declares a
matching `ARG` and an undeclared build arg is discarded — but adding one line
would have baked a live key into a published layer. There is now no build on
the host to pass them to.

### One-time setup

**1 · GitHub → Settings → Secrets and variables → Actions**

| Kind | Name | Value |
|---|---|---|
| Secret | `COOLIFY_BASE_URL` | e.g. `https://coolify.example.com` — no trailing path |
| Secret | `COOLIFY_TOKEN` | Coolify → Keys & Tokens → API tokens. Scope it to **deploy** only |
| Secret | `COOLIFY_RESOURCE_UUID` | the resource UUID, visible in its Coolify URL |
| Variable | `NEXT_PUBLIC_API_BASE_URL` | `https://atlas-api.ancodalabs.com` — baked into the browser bundle |
| Variable | `DEPLOY_ENABLED` | `true` — the switch. Leave it unset until step 3 has passed once |

`NEXT_PUBLIC_API_BASE_URL` is a *variable*, not a secret: it is a public URL
that ships inside the JavaScript every visitor downloads, and masking it in
logs would only make a wrong value harder to spot. Unset, the Dockerfile's own
fallback applies.

The `deploy` job targets a `production` environment. Adding a required reviewer
to it under Settings → Environments turns every deploy into an approval, which
is worth doing before a monsoon.

**2 · Coolify → Keys & Tokens → Registry credentials**

The packages are private, so add one for `ghcr.io`:

| Field | Value |
|---|---|
| URL | `ghcr.io` |
| Username | your GitHub username |
| Password | a GitHub token with **`read:packages` and nothing else** |

Read-only is the whole point: this credential lives on the deployment host, and
it must not be able to publish an image or read the repository.

**3 · Coolify → the Atlas resource**

The compose file no longer has a `build:` section, so Coolify will pull. Deploy
once by hand and confirm it authenticates to GHCR and comes up healthy. Only
then set `DEPLOY_ENABLED` to `true`, so the first automated deploy is not also
the first time the credential is exercised.

Until that variable is set, pushes to `main` still run the suite and publish
images; the deploy job shows as skipped rather than passing over nothing.

To pin a version — a rollback, or holding a release still — set
`ATLAS_IMAGE_TAG` in the resource's environment to a commit SHA. CI publishes
one immutable tag per commit beside `latest`. Clear it to track `main` again.

### Checking the host

Slimming the images cut what a deploy unpacks from 1.38 GB to 1.03 GB, and
pulling rather than building removes the build cache entirely. If a deploy
still dies during unpack, the host is out of room:

```bash
df -h /
docker system df
docker builder prune -af      # stale build cache, usually the largest win
docker image prune -af        # per-commit images from earlier deploys
```

Never `docker system prune --volumes` here: it would take `atlas-runs` and
`redis-data` with it.
