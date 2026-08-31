# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

# Ancoda Atlas — agent notes

Keep this Next.js marker block at the top. The rest of the file is project truth derived from this repo, not from training data.

## What this is

**Ancoda Atlas** is an open-source natural-hazard and disaster intelligence platform for Nepal, stewarded by **Ancoda Labs**. Live site: [atlas.ancodalabs.com](https://atlas.ancodalabs.com).

It aggregates Nepal-scoped hazard feeds onto a dashboard, with a public flood-response desk at `/bhotekoshi-flood`. It is a **monitoring aid, not a warning system**. Confirm findings against DHM, NDRRMA/BIPAD, or the National Seismological Centre before anyone acts.

**Scope is natural hazards and humanitarian response only:** earthquakes, floods, landslides, GLOF, wildfire, hazardous air, extreme heat/cold, avalanches, drought, and declared relief. Out of scope: politics, elections, conflict, markets, finance, diplomacy, aviation tracking, general news. India and China appear only via cross-boundary hazards.

Version **4.0.0**. Contact: `research@ancodalabs.com`.

## Architecture: two services, one repo

Atlas is a **Python/FastAPI backend** and a **Next.js frontend**. All fetching, scraping, scheduling and persistence is Python. The frontend renders and nothing else — it has no server-side data code and no database or storage clients.

```
backend/     FastAPI + Celery. Every source, every route, every schedule.
frontend/    Next.js. Pages, views, components. Talks to the API over axios.
infra/       dev/ and prod/ Compose stacks.
runs/        Gitignored. The worker writes it; the API reads it.
supabase/    The SQL schema, applied out of band.
```

| Piece | What is actually used |
|---|---|
| Backend | **Python 3.12**, FastAPI, Celery + Redis, `httpx`, `structlog` |
| Frontend | **Node 22**, Next.js 16 (App Router), React 19, Tailwind v4, shadcn/ui |
| Transport | **axios** (`frontend/src/config/axios.ts`) |
| Server state | **TanStack Query** (`frontend/src/hooks/use*.ts`) |
| Client state | **Redux Toolkit** (`frontend/src/store/`) — theme, language, display prefs |
| Database | **Hosted Supabase over PostgREST** (`supabase-py`). Optional. |
| Object store | **MinIO**. Optional, behind a Compose profile. |
| LLM | Raw `httpx` in `backend/app/domains/ai/providers/` — no vendor SDKs |
| Backend checks | `ruff`, `mypy`, `pytest` — run in the container |
| Frontend checks | `npm run verify` (no-any + node:test + `next build`) |

## The three backend processes

| Service | Does | Constraint |
|---|---|---|
| `api` | Serves HTTP. **Reads** `runs/`, never writes it. | Never fetches from a government portal on the request path. |
| `worker` | Runs every sweep and refresh. The **only** writer of `runs/`. | **Do not scale past one replica.** |
| `beat` | The clock. 15-min hazard sweep, 10-min flood refresh. | Separate so restarting a worker mid-sweep does not lose the schedule. |

Redis is Celery's broker **and** the channel the worker uses to tell the API a sweep landed. It carries the signal, never the state — the payloads are the JSON files under `runs/`, which both services mount.

Every write to `runs/` is atomic (temp file + rename, fsync before rename, `.bak` kept). Reads never raise; a missing or corrupt file answers `None` and the page renders its empty state.

## How to run locally

```bash
cp .env.example .env   # every key is optional
make up                # redis, api, worker, beat, frontend
```

| | |
|---|---|
| Dashboard | http://localhost:3117 |
| Flood desk | http://localhost:3117/bhotekoshi-flood |
| API docs | http://localhost:8000/docs |

`make storage` adds MinIO if you want photo uploads locally. `make diag` reports which optional services are configured. See `make help` for the rest.

A cold start shows the empty skeleton for one cycle — the worker sweeps on start (with a staleness guard so a code-change restart does not re-pull sixteen thousand register rows).

### Environment

One `.env` at the repository root, read by both services. Copy `.env.example`. **Do not put comments on the same line as values** — Docker `env_file` treats them as part of the value.

Two API base URLs exist deliberately: `NEXT_PUBLIC_API_BASE_URL` is baked into the browser bundle at **build** time and must be publicly reachable; `ATLAS_API_BASE_URL` is read at **runtime** by the server renderer and points at the API container.

Everything degrades. No Supabase → photos, digests and rescue corrections hide themselves. No MinIO → photos hide. No LLM key → rule-based reads, briefs in Nepali and English only. No FIRMS key → empty wildfire panel. The hazard dashboard works with none of them.

## Directory map

| Path | Purpose |
|---|---|
| `backend/app/core/` | config, logging, errors, http, nepal, supabase, storage, celery, `runs_store` |
| `backend/app/api/v1/router.py` | Where domain routers mount |
| `backend/app/domains/hazards/` | 5 sources, synthesize, delta, sweep task |
| `backend/app/domains/flood/` | gauges, BIPAD, NDRRMA, bulletins, rescue portal, desk store, 10-min task |
| `backend/app/domains/news/` | wire, YouTube, digests, topic cache |
| `backend/app/domains/media/` | the signed image proxy |
| `backend/app/domains/photos/` | ground reports: EXIF walker, upload rails |
| `backend/app/domains/ai/` | 11 LLM providers, reads, insights, ask sandbox |
| `backend/app/domains/alerts/` | Telegram and Discord |
| `backend/app/domains/stream/` | SSE over Redis pub/sub |
| `backend/content/` | **Reviewed** funds, helplines, sitrep. Higher bar than code. |
| `backend/scripts/` | diag, sweep, flood_refresh, migrate_check, clean |
| `frontend/src/config/axios.ts` | The one HTTP client |
| `frontend/src/services/` | One thin file per domain |
| `frontend/src/hooks/use*.ts` | TanStack Query over the services |
| `frontend/src/store/` | Redux slices: theme, language, desk prefs |
| `frontend/src/types/index.ts` | **The API contract.** Backend responses must satisfy it. |

Geography is centralized in `backend/app/core/nepal.py` and `backend/app/domains/flood/scope.py`. The frontend has a small read-only subset in `src/lib/nepal-geo.ts` and `src/lib/flood-scope.ts` for map rendering; both say so at the top. Do not scatter bounding boxes.

## Conventions

- **Backend:** domain folders with `sources/`, `service.py`, `routers.py`, `tasks.py`. No explicit `Any` where a real type exists. `ruff` (E, F, I, N) and `mypy` both clean.
- **Responses are camelCase.** `frontend/src/types/index.ts` is the contract, and `backend/tests/test_contract.py` fails the build on a snake_case key or a missing field. This is the most likely way a change breaks a panel, because Python naming conventions push the other way.
- **Sources** answer a dict, are runnable alone (`python -m app.domains.hazards.sources.seismic`), and never raise: a failure returns an error shape so `asyncio.gather` cannot lose the other sources.
- **`safe_fetch` never raises.** Check `is_error()` before using a result.
- **Frontend:** no component calls `fetch` directly. Services → hooks → views.
- **Commits:** `feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert(scope): subject`, ≤72 chars after the type.
- **PRs:** default branch is `main`. Do not commit on `main`. CODEOWNERS `@ancoda-labs`; `backend/content/`, `LICENSE`, `NOTICE`, `CONTRIBUTING.md`, `SECURITY.md` need maintainer review.

## Constraints (non-negotiable)

1. **Live public-safety tool.** Never fabricate, placeholder, or mock hazard readings, alerts, helpline numbers, casualty figures, or donation links. Empty or degraded with an honest timestamp is correct; invented numbers are not. An LLM may **translate** listed headlines, never compose a disaster brief. Do not invent funds.
2. **Do not weaken the upload rails** in `backend/app/domains/photos/`: size cap, `safetyAcknowledged`, magic-byte sniff, EXIF strip, Nepal bounds, rate limit, report threshold. Photos publish on arrival by design — those rails *are* the review, and each has a test naming what it prevents.
3. **Do not weaken the media proxy.** It only fetches URLs Atlas signed itself. The SSRF guard (loopback, RFC1918, `169.254.169.254`) is why an open text field cannot reach the cloud metadata endpoint.
4. **Zero is a claim.** BIPAD stores unfilled loss records as zeros, so every total travels with how many records actually carried figures. An absent counter is `None`, never `0`.
5. **No secrets.** `.env` and `.env.*` are gitignored at every depth; `.env.example` is the tracked template.
6. **No commits on `main`.** Branch and open a PR. Run `npm run verify` and the backend checks first (the pre-commit hook does both).
7. **New sources** go through `app/domains/hazards/sweep.py` or the flood cycle, plus delta metrics if they affect the dashboard.
8. **`backend/content/` is a higher bar than code.** Every fund, helpline and figure needs a primary source on the record. Donation routes are curated, never scraped.
9. **New dependencies must be licence-compatible** (MIT/BSD/Apache/ISC/AGPL-compatible). Add vendored data or code to `NOTICE` in the same PR.

## Known gaps (blunt)

- **The worker cannot be scaled.** It is the sole writer of `runs/`, which is a host-local bind mount. Moving that state into Postgres or Redis is the prerequisite for horizontal scaling, and should happen before `infra/prod` becomes a Swarm stack.
- **The news topic cache and the ask-sandbox rate limit are per process.** Behind more than one API replica each holds its own, which multiplies the sandbox's hourly ceiling. Acceptable for a sandbox; note it before relying on it.
- **`make migrate` does not migrate.** PostgREST cannot run DDL. Apply `supabase/migrations/0001_flood_desk.sql` with `supabase db push`; `make migrate` only checks the tables and the `flood_photo_recount` RPC are reachable.
- **The interactive bots are not implemented.** The Node build carried ~400 lines of Telegram polling and a discord.js gateway client that nothing ever started. Alerts are one-way: Telegram messages and a Discord webhook. A two-way bot needs its own long-lived process.
- **Compose is single-host by design**, not by omission. See the note at the top of `infra/prod/docker-compose.yml`.
- **Production foot-guns:** unset `ATLAS_MEDIA_SECRET` breaks every image link on restart and across replicas; unset `ATLAS_IP_SALT` resets rate limits on restart; unset `FLOOD_ADMIN_TOKEN` means photo takedown answers 404 and there is no path except the database.
- **The frontend duplicates a little geography** (`src/lib/nepal-geo.ts`, `src/lib/flood-scope.ts`) because the map needs it client-side. The backend owns the authoritative copies; edit both.
