<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="frontend/public/images/atlas-white.png">
  <source media="(prefers-color-scheme: light)" srcset="frontend/public/images/atlas-black.png">
  <img alt="Ancoda Atlas" src="frontend/public/images/atlas-black.png" width="420">
</picture>

# Ancoda Atlas

**Nepal natural-hazard and disaster intelligence. One command.**

An open-source project by [Ancoda Labs](https://github.com/ancodalabs).

[![Ancoda Labs](https://img.shields.io/badge/Ancoda%20Labs-website-00d4ff?style=for-the-badge)](https://ancodalabs.com/)

[![Python 3.12+](https://img.shields.io/badge/python-3.12%2B-blue)](#quick-start)
[![Node.js 22+](https://img.shields.io/badge/node-22%2B-brightgreen)](#quick-start)
[![License: AGPL v3](https://img.shields.io/badge/license-AGPLv3-blue.svg)](LICENSE)
[![Focus](https://img.shields.io/badge/focus-Nepal%20%F0%9F%87%B3%F0%9F%87%B5-dc143c)](#scope)
[![Docker](https://img.shields.io/badge/docker-ready-blue?logo=docker)](#quick-start)

</div>

---

## What it is

Atlas watches Nepal's natural hazards and puts what it finds on one page.

Five national feeds — USGS seismic, Open-Meteo weather and air quality, NASA FIRMS, and ReliefWeb — refresh every fifteen minutes onto a dashboard. A public flood-response desk at `/bhotekoshi-flood` pulls twenty-one live sources every ten minutes: river gauges from the BIPAD Portal, NDRRMA's rescued-persons register, the Prime Minister's Office rescue portal, the Copernicus EMSR927 damage grading, and the Nepali news wire.

**It is a monitoring aid, not a warning system.** Confirm anything here against DHM, NDRRMA/BIPAD, or the National Seismological Centre before acting on it.

### Scope

Natural hazards and humanitarian response only: earthquakes, monsoon floods, landslides, glacial lake outburst floods, wildfire, hazardous air, extreme heat and cold, avalanches, drought, and declared relief.

Politics, elections, conflict, markets, finance and general news are out of scope. India and China appear only through cross-boundary hazards.

---

## Quick start

```bash
git clone https://github.com/ancoda-labs/Ancoda-Atlas.git
cd Ancoda-Atlas
cp .env.example .env      # every key is optional
make up
```

| | |
|---|---|
| Dashboard | http://localhost:3117 |
| Flood desk | http://localhost:3117/bhotekoshi-flood |
| API | http://localhost:8000 |
| API docs | http://localhost:8000/docs |

The first sweep runs as the worker starts and takes under a minute across five upstreams. Until it lands the dashboard renders its empty skeleton — that is the correct degraded state, not a failure: Atlas shows nothing rather than something invented.

`make help` lists everything. The ones you will want:

```bash
make logs      # tail every service
make sweep     # run one hazard sweep by hand
make flood     # run one flood desk refresh by hand
make diag      # what is configured, and what is not
make storage   # add MinIO, if you want photo uploads locally
```

---

## Architecture

Two services in one repository.

```
                    ┌──────────────┐
   reader  ───────► │   frontend   │  Next.js 16 · React 19
                    │   :3117      │  axios · TanStack Query · Redux
                    └──────┬───────┘
                           │  /api/v1
                    ┌──────▼───────┐
                    │     api      │  FastAPI · reads runs/, never writes
                    │    :8000     │
                    └──────┬───────┘
                           │  reads
        ┌──────────────────▼──────────────────┐
        │              runs/                   │  the sweep snapshot,
        │  dashboard.json  flood-desk.json     │  the desk store,
        │  latest.json     memory/             │  the delta memory
        └──────────────────▲──────────────────┘
                           │  writes  (sole writer)
   ┌──────────┐     ┌──────┴───────┐     ┌──────────────┐
   │   beat   ├────►│    worker    │◄────┤    redis     │
   │ the clock│     │ every sweep  │     │ broker + the │
   └──────────┘     └──────┬───────┘     │ "swept" signal│
                           │             └──────┬───────┘
                           ▼                    │ SSE
              government portals & feeds        ▼
                                            the reader's open page
```

**Everything that fetches is Python.** All twenty-six sources, every scraper, every schedule. The frontend renders and nothing else — it holds no database client, no object-store client, and no server-side data code.

**Redis carries the signal, not the state.** A file cannot tell anyone it changed, so the worker publishes a few bytes and the API re-reads the file and pushes to its SSE clients.

**The worker is the only writer of `runs/`**, and every write is atomic — temp file, fsync, rename — so a reader sees one complete version or the next, never a half-written one. That single-writer rule is also why the worker must not be scaled past one replica.

| | |
|---|---|
| **Backend** | Python 3.12 · FastAPI · Celery · Redis · httpx · structlog |
| **Frontend** | Node 22 · Next.js 16 (App Router) · React 19 · Tailwind v4 · shadcn/ui |
| **Transport** | axios, with one service file per domain |
| **Server state** | TanStack Query |
| **Client state** | Redux Toolkit — theme, language, display preferences |
| **Database** | Hosted Supabase over PostgREST · *optional* |
| **Object store** | MinIO · *optional* |
| **LLM** | Eleven providers on raw HTTP, no vendor SDKs · *optional* |

---

## Everything optional degrades

Atlas runs with nothing configured. Each feature that needs a service hides itself and says why, rather than failing the page around it.

| Absent | Effect |
|---|---|
| Supabase | Ground-report photos, news digests and rescue corrections hide themselves |
| MinIO | Photo uploads hide (they need Supabase **and** MinIO) |
| `LLM_API_KEY` | Rule-based hazard reads; briefs stay in Nepali and English |
| `FIRMS_MAP_KEY` | Wildfire panel empty, reported as `no_key` rather than zero fires |
| `RELIEFWEB_APPNAME` | Falls back to HDX, labelled `stale` |
| `YOUTUBE_API_KEY` | Known Nepali channels still work, cross-channel search does not |
| Telegram / Discord | Alerts off |

`make diag` prints exactly which of these apply to your `.env`.

### Production settings that fail quietly

Three are worth setting before a deploy, because nothing errors if you do not:

- **`ATLAS_MEDIA_SECRET`** — signs every image URL. Unset, a random key is generated per process, so links break on restart and fail across replicas.
- **`ATLAS_IP_SALT`** — salts the upload rate-limit hashes. Unset, everyone's allowance resets on restart.
- **`FLOOD_ADMIN_TOKEN`** — without it, photo takedown answers 404 and there is no path except the database.

---

## The flood desk

`/bhotekoshi-flood` is a live response desk for the Rasuwa–Bhotekoshi flood. Its rules are deliberate, and most of them are about refusing to overstate what is known.

**Reviewed content is a floor, not a ceiling.** Helplines, bank accounts, relief funds and the situation report live in `backend/content/` and every figure has a primary source on the record. Live scrapes are laid over them only when they pass: a panel whose parts do not add up to its stated total is refused, and the death toll never goes down — this disaster's toll is recovered bodies, and a compilation that has not caught up must not put an older figure back over a newer one.

**Zero is a claim.** BIPAD stores an unfilled loss record as a row of zeros, so "nobody died" and "nobody has typed the figures in yet" are the same bytes. Every total travels with how many incidents actually carried figures, and the page says "9 of 38" rather than a confident zero.

**Ground reports publish on arrival.** A photograph of a blocked road is worth most in the hour it is taken, and a review queue nobody staffs at 3am is not moderation. What stands in for pre-review is a set of narrow rails: the format is decided from magic bytes, every metadata tag — including the GPS coordinates of whoever pressed the shutter — is stripped before the bytes are stored, uploads per sender are capped, and any photo three separate people flag is pulled automatically.

**Nothing is copied.** News photographs and government images are streamed from their source at request time through a signed proxy that will only fetch a URL Atlas signed itself. The object store holds photographs the public sent us and nothing else.

---

## Development

```bash
make up          # the whole stack
make logs        # follow it
make shell       # a shell in the API container
```

### Checks

```bash
make test        # pytest, in the container
make lint        # ruff
make typecheck   # mypy
make fe-build    # type-check and build the frontend
```

`make hooks` enables the versioned git hooks. `pre-commit` runs both halves — ruff, mypy and pytest against the backend, then `npm run verify` against the frontend. `commit-msg` enforces `type(scope): subject`.

### Running a source on its own

Every hazard source is a module you can run directly, which is the fastest way to see what an upstream is actually returning:

```bash
make shell
python -m app.domains.hazards.sources.seismic | jq .signals
python -m app.domains.news.sources.nepal_news flood 7d
```

### The database

Supabase is never local — it is the same hosted project in development as in production, reached over PostgREST. Apply the schema once per project:

```bash
supabase db push        # or paste supabase/migrations/0001_flood_desk.sql
make migrate            # checks it landed; does NOT apply it
```

`make migrate` cannot apply anything: PostgREST executes queries and functions, not DDL. It checks the four tables and the `flood_photo_recount` function are reachable with the key you configured, which is what actually goes wrong on a new deploy.

---

## Deployment

`infra/prod` is Traefik v3 terminating TLS with automatic Let's Encrypt, the frontend, the API, one worker, one scheduler and Redis — on a single host.

```bash
cp .env.example .env    # fill in DOMAIN_*, ACME_EMAIL, ATLAS_RUNS_PATH
docker compose -f infra/prod/docker-compose.yml --env-file .env up -d --build
```

Single-host is a deliberate constraint, not an oversight. `runs/` is a host-local bind mount, so every service that touches it lives on the same machine; and the worker is pinned to one replica because it is the sole writer. Moving that state into Postgres or Redis is the prerequisite for scaling out, and should happen before this becomes a Swarm stack. See `infra/prod/README.md`.

---

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md) — the latter is the current architectural truth for this repository.

Two things to know before you open a PR:

**This is a live public-safety tool.** Never fabricate, placeholder or mock a hazard reading, an alert, a helpline number, a casualty figure or a donation link. Empty or degraded with an honest timestamp is correct; an invented number is not.

**`backend/content/` is a higher bar than code.** Every fund, helpline and figure in it needs a primary source on the record, and donation routes are curated rather than scraped — this is money reaching people during a disaster.

Branch off `main`; do not commit to it.

---

## Licence

**AGPL-3.0-only.** Copyright (c) 2026 Ancoda Labs. See [LICENSE](LICENSE).

Running a modified Atlas as a network service means offering users the source of that modified version.

Third-party data and provenance are recorded in [NOTICE](NOTICE). Administrative boundary data is derived from [openknowledgenp/localboundaries](https://github.com/openknowledgenp/localboundaries) (MIT). The payment QR codes under `frontend/public/qr/` are Government of Nepal artefacts and are not Ancoda property.

Security issues: see [SECURITY.md](SECURITY.md). Contact: `research@ancodalabs.com`.
