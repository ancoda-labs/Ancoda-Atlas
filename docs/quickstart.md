# Quick Start

Atlas is two services: a Python/FastAPI backend that does every fetch, scrape
and schedule, and a Next.js frontend that renders. Compose runs both.

```bash
git clone https://github.com/ancoda-labs/Ancoda-Atlas.git
cd Ancoda-Atlas
cp .env.example .env   # every key is optional
make up
```

| | |
|---|---|
| Dashboard | http://localhost:3117 |
| Flood desk | http://localhost:3117/bhotekoshi-flood |
| API docs | http://localhost:8000/docs |

**Requirements:** Docker and Docker Compose. Nothing else — Python 3.12 and
Node 22 live inside the images.

A cold start shows the empty skeleton for one cycle. The worker sweeps as soon
as it comes up, so the dashboard fills within seconds and the flood desk within
about a minute. Until then the pages say they are waiting rather than showing
figures they do not have.

`make diag` reports which optional services are configured and which keys are
set. Run it first when something looks wrong.

## The stack

| Service | Does | Constraint |
|---|---|---|
| `api` | Serves HTTP. Reads `runs/`, never writes it. | Never fetches from a government portal on the request path. |
| `worker` | Runs every sweep and refresh. The only writer of `runs/`. | Do not scale past one replica. |
| `beat` | The clock. 15-minute hazard sweep, 10-minute flood refresh. | Separate, so restarting a worker mid-sweep does not lose the schedule. |
| `redis` | Celery's broker, and the channel the worker uses to tell the API a sweep landed. | Carries the signal, never the state. |
| `frontend` | Renders. Talks to the API over axios. | No server-side data code, no database client. |

## Common commands

```bash
make up          # start the dev stack
make logs        # tail everything
make diag        # what is configured, what is missing
make sweep       # run one hazard sweep by hand
make flood       # run one flood desk refresh by hand
make test        # backend test suite
make down        # stop
```

`make help` lists the rest. `make storage` adds the optional MinIO sidecar if
you want photo uploads locally.

## Configuration

One `.env` at the repository root, read by both services. Copy `.env.example`.

**Do not put a comment on the same line as a value** — Docker's `env_file`
treats it as part of the value.

Everything degrades. No Supabase means photos, digests and rescue corrections
hide themselves. No MinIO means photos hide. No LLM key means rule-based reads
and briefs in Nepali and English only. No FIRMS key means an empty wildfire
panel. The hazard dashboard works with none of them.

### The two API base URLs

These exist separately because they are read at different times:

- `NEXT_PUBLIC_API_BASE_URL` is baked into the browser bundle at **build** time
  and must be an address a reader's browser can reach. Changing it means
  rebuilding, not restarting.
- `ATLAS_API_BASE_URL` is read at **runtime** by the server renderer. In Docker
  it names the `api` service directly, so a server render does not go back out
  through the proxy to reach a container sitting beside it.

## Deploying

### One machine

```bash
docker compose -f infra/prod/docker-compose.yml up -d
```

Traefik terminates TLS for both hostnames. Set `DOMAIN_FRONTEND`, `DOMAIN_API`
and `ACME_EMAIL`.

### Two machines

The frontend holds no state — it never writes `runs/`, opens no database and
reads no disk — so it can live anywhere, including Cloudflare. The backend
cannot: `runs/` is a host-local bind mount with exactly one writer, so the API,
worker and beat stay together.

```bash
make be    # on the machine that owns the data
make fe    # on the machine that serves readers
```

On Cloudflare the `fe` stack is unused — that host builds and runs the Next app
itself. Only `NEXT_PUBLIC_API_BASE_URL` and `ATLAS_API_BASE_URL` matter there.

Set these before either half is useful:

| Variable | Why |
|---|---|
| `ALLOWED_ORIGINS` | The frontend's origin. Cross-origin without it, every browser call fails preflight — the SSE stream included — and the site renders blank. |
| `ATLAS_RUNS_PATH` | Absolute host path on a disk that survives a redeploy. Left relative, Compose resolves it against the compose file's directory and live data lands inside the git checkout. |
| `ATLAS_MEDIA_SECRET` | Unset, a random key is minted per process: image links die on restart and fail across replicas. |
| `ATLAS_IP_SALT` | Unset, upload rate limits reset on every restart. |
| `FLOOD_ADMIN_TOKEN` | Unset, photo takedown answers 404 and there is no path except a database client. |

## The database

Apply the schema out of band once per project — PostgREST cannot run DDL:

```bash
supabase db push        # or paste supabase/migrations/0001_flood_desk.sql
make migrate            # checks the tables and the RPC are reachable
```

`make migrate` does not migrate. It only verifies.

## Troubleshooting

**Panels are empty after first start.** Normal for one cycle. `make logs` to
watch the first sweep land.

**A source shows degraded.** Expected without its key. Yellow means the source
answered on a fallback feed; red means it failed outright. The rest of the
sweep continues either way.

**A hazard news panel is empty.** Check the season before assuming a bug.
Wildfire is quiet outside March–May and glacier reporting is sparse year-round.
The panels never relax their hazard or Nepal gates to fill themselves.

**Photo uploads fail.** Both Supabase and MinIO must be configured, and
`ATLAS_MEDIA_SECRET` and `ATLAS_IP_SALT` set. `make diag` says which are
missing.

**The flood desk says it is awaiting figures.** It has no completed cycle. On a
fresh deploy that clears within a minute. If it persists, check that the worker
and the API are pointed at the same `ATLAS_RUNS_PATH` — a worker writing a store
the API cannot see produces exactly this.
