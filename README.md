<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="frontend/public/images/atlas-white.png">
  <source media="(prefers-color-scheme: light)" srcset="frontend/public/images/atlas-black.png">
  <img alt="Ancoda Atlas" src="frontend/public/images/atlas-black.png" width="420">
</picture>

# Ancoda Atlas

**Nepal emergency disaster intelligence. Natural hazards only. One command. Zero cloud.**

An open-source project by [Ancoda Labs](https://github.com/ancoda-labs).

## [Visit Ancoda Labs](https://ancodalabs.com/)

[![Ancoda Labs](https://img.shields.io/badge/Ancoda%20Labs-website-00d4ff?style=for-the-badge)](https://ancodalabs.com/)

[![Python 3.12](https://img.shields.io/badge/python-3.12-3776ab?logo=python&logoColor=white)](#quick-start)
[![Node.js 22+](https://img.shields.io/badge/node-22%2B-brightgreen)](#quick-start)
[![License: AGPL v3](https://img.shields.io/badge/license-AGPLv3-blue.svg)](LICENSE)
[![Maintained by Ancoda Labs](https://img.shields.io/badge/maintained%20by-Ancoda%20Labs-7c5cff)](https://github.com/ancoda-labs)
[![Hazard sources](https://img.shields.io/badge/hazard%20sources-5-cyan)](#data-sources)
[![Focus](https://img.shields.io/badge/focus-Nepal%20%F0%9F%87%B3%F0%9F%87%B5-dc143c)](#scope)
[![Docker](https://img.shields.io/badge/docker-ready-blue?logo=docker)](#docker)

**Follow Ancoda Labs**

[![X](https://img.shields.io/badge/X-%40ancodalabs-111111?style=for-the-badge&logo=x&logoColor=white)](https://twitter.com/ancodalabs)
[![Instagram](https://img.shields.io/badge/Instagram-%40ancodalabs-E4405F?style=for-the-badge&logo=instagram&logoColor=white)](https://www.instagram.com/ancodalabs)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Ancoda%20Labs-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/company/ancodalab/)
[![Discord](https://img.shields.io/badge/Discord-Ancoda%20Labs-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/g9wZXVxTcx)

</div>

> [!IMPORTANT]
> **Atlas is a monitoring aid, not a warning system.** It reads satellite feeds and weather models directly and does not republish official warnings. Confirm every finding against Nepal's [DHM](https://www.dhm.gov.np/), [NDRRMA](https://bipadportal.gov.np/) or the [National Seismological Centre](https://seismonepal.gov.np/) before acting on it or issuing public guidance.

Atlas pulls earthquake activity, monsoon and flood forecasts, satellite fire detection, air quality and humanitarian response reporting from five open hazard feeds — all scoped to Nepal, in parallel, every 15 minutes — plus a disaster-filtered live news layer from Nepali dailies, and renders everything on a single self-contained dashboard.

Hook it up to an LLM and it gains a **reading layer** — multi-tier alerts pushed to Telegram and Discord when hazard conditions change, actionable reads grounded in real cross-layer hazard data, and the flood desk's news brief carried into any of ~130 languages for families reading from outside Nepal.

No cloud. No telemetry. No subscriptions.

Live at **[atlas.ancodalabs.com](https://atlas.ancodalabs.com)**.

**Docs:** [Quick start](docs/quickstart.md) · [Architecture](docs/architecture/architecture.md)

---

## Live now: Rasuwa–Bhotekoshi flood

**[atlas.ancodalabs.com/bhotekoshi-flood](https://atlas.ancodalabs.com/bhotekoshi-flood)**

During the Rasuwa–Bhotekoshi flood, critical updates were scattered across
social posts and press briefings. The flood desk is one unified portal for
keeping communities informed and tracking ground realities.

- **News briefs in your language** — the wire, carried into Nepal's languages and ~130 more, for families reading from outside the country
- **Send updates from the ground** — photos and reports from the corridor, moderated before they appear
- **Live affected-area map** — districts, the flood path, and river gauges from the NDRRMA BIPAD Portal
- **Verified donation routes** — including the PM Disaster Relief Fund, each one human-checked with its source recorded
- **Rescue register** — searchable records of rescued and missing people, Nepali and foreign nationals

**Contributions are wanted and do not require writing code.** Native-language
review, verifying a relief fund or helpline, and testing whether a brief reads
correctly in your language are the three most useful things anyone can do right
now. See [Contributing](#contributing).

<!-- TODO(maintainers): add three screenshots here before announcing —
     simple view, detailed dashboard, and the flood desk. For a visual
     dashboard this is the single highest-value addition to this file.
     docs/screenshots/{simple,detailed,flood-desk}.png -->

---

## Scope

Atlas covers **natural hazards in Nepal, and nothing else**:

- **Geophysical** — earthquakes on the Main Himalayan Thrust, aftershock sequences
- **Hydro-meteorological** — monsoon floods, landslides, extreme rainfall, storms, lightning, hail, heat waves, cold waves, drought
- **Cryospheric** — avalanches, glacial lake outburst floods (GLOF), snowmelt
- **Wildfire** — forest fire detection and the smoke that follows it
- **Environmental** — hazardous air quality, valley inversion, fire smoke
- **Humanitarian response** — declared operations, evacuations, relief and displacement

Out of scope, deliberately: politics, elections, conflict, markets, trade, finance, diplomacy, aviation tracking and general news. India and China appear only through cross-boundary hazards — upstream river discharge, transboundary smoke, and ruptures on shared fault segments.

Every geographic boundary, province and city lives in [`backend/app/core/nepal.py`](backend/app/core/nepal.py). Edit that file to adjust coverage; nothing else hardcodes geography. The frontend keeps a small read-only subset in `frontend/src/lib/nepal-geo.ts` because the map needs it client-side — it says so at the top.

---

## Token / Asset Warning

> [!WARNING]
> **Atlas has not launched any official token, coin, NFT, airdrop, presale, or other blockchain-based asset.**
> Any token or digital asset using the Atlas name, logo, or branding is not affiliated with or endorsed by Atlas.
> Do not buy it, promote it, connect a wallet to claim it, sign transactions, or send funds based on third-party posts, DMs, or websites.

---

## Why This Exists

Most of the data that describes Nepal's hazard exposure — seismic activity, rainfall and flood risk, satellite fire detection, air quality, humanitarian reporting — is publicly available. It is just scattered across USGS, Open-Meteo, NASA FIRMS, ReliefWeb and a dozen news feeds that nobody has time to check individually during an emergency.

Ancoda Atlas brings it into one place. Not behind a paywall, not locked in an enterprise platform. Just open hazard data, aggregated and cross-correlated on your own machine, updated every 15 minutes.

Nepal sits on the Main Himalayan Thrust, receives roughly 80% of its rainfall in four monsoon months, and loses hill slopes to landslides on ground that earthquakes have already loosened. Those exposures compound, and a dashboard that shows them together says more than any of them alone.

---

## Quick Start

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
| Climate | http://localhost:3117/climate |
| API docs | http://localhost:8000/docs |

**Requirements:** Docker and Docker Compose. Nothing else — Python 3.12 and
Node 22 live inside the images.

A cold start shows the empty skeleton for one cycle: the worker sweeps as soon
as it comes up, so the dashboard fills within seconds and the flood desk within
about a minute. Until then the pages say they are waiting rather than showing
figures they do not have.

Run `make diag` if something looks wrong — it reports which optional services
are configured and which keys are set. `make help` lists every target.

**→ [Full quick start, configuration and deployment](docs/quickstart.md)**

### Deploying

One machine, Traefik terminating TLS for both hostnames:

```bash
docker compose -f infra/prod/docker-compose.yml up -d
```

Two machines — the frontend holds no state, so it can live anywhere, Cloudflare
included. The backend cannot be split further, because `runs/` is a host-local
bind mount with exactly one writer:

```bash
make be    # API, worker, beat, Redis — the machine that owns the data
make fe    # the machine that serves readers
```

Set `ALLOWED_ORIGINS` to the frontend's origin before either half is useful.
See [docs/quickstart.md](docs/quickstart.md#deploying) for the rest.

### Where it can and cannot run

The **backend** needs a host that runs a long-lived process with a writable
disk. It is not deployable to an edge-serverless runtime, and no adapter bridges
the gap:

- **A writable filesystem.** The worker persists each cycle to `runs/` and the
  API reads those files. Edge runtimes have no writable disk.
- **A background scheduler.** Celery beat keeps the 15-minute sweep and the
  10-minute flood refresh. Edge runtimes keep no process alive between requests.
- **One writer.** The worker is the sole writer of `runs/`, so it cannot be
  spread across isolates that share nothing.

The **frontend** has none of those needs — it renders and calls the API, holds
no state, opens no database and reads no disk. It runs on Cloudflare, on a
second VPS, or beside the backend. That split is the point: an earlier build put
the schedulers and the store inside the Next.js server, which is exactly why it
could not be hosted at the edge.

## What You Get

### Two views of the same data

The homepage opens in a **simple view** written for anyone: a plain-language
answer to "is Nepal safe right now", the numbers given as sentences, and named
sources rather than acronyms. A **detailed view** toggle switches to the full
monitoring terminal below. The choice is remembered per browser.

### Active-event pages

When a disaster is under way it gets its own public page — currently
`/bhotekoshi-flood` for the Rasuwa–Bhotekoshi flood. These are built for
affected families, volunteers and donors rather than analysts: emergency numbers
as tap-to-call buttons, plain safety guidance, an affected-district map, live
river gauges from the NDRRMA BIPAD Portal, a searchable rescue register,
crowdsourced ground photos, and **human-verified** donation routes. Bilingual
English / नेपाली throughout, with the news brief available in ~130 languages.

Donation links are curated, never scraped. Disaster fundraising scams peak in the
first 48–72 hours, so an aggregator that auto-surfaces unverified fundraisers is
worse than none at all. Every fund is a reviewed JSON record under
`backend/content/bhotekoshi-flood/` with its own source and verification date.

### Multilingual news briefs

Rasuwa is a trekking corridor and a labour-migration source district, so a large
share of the people refreshing the flood desk are reading from outside Nepal —
relatives abroad, embassies, responding agencies. And the communities downstream
of the Bhotekoshi are disproportionately Tamang, Tharu and Maithili speakers. A
relief notice someone cannot read is a notice that did not reach them.

The **AI Insights** panel therefore offers its brief in ~130 languages, listed in
[`backend/app/domains/ai/languages.py`](backend/app/domains/ai/languages.py) in two groups: Nepal's
own languages first, then the rest of the world.

Two things about how this works are deliberate and worth stating plainly:

**No model writes the brief.** Atlas lists what the outlets actually filed —
headline, outlet, no synthesis. On a page people use to decide whether to move,
prose a model composed about a disaster reads exactly as confidently when it is
wrong as when it is right, and nothing on the page can tell the reader which it
got. Listing headlines is weaker writing and a stronger claim.

**A model is used only to translate that list**, which is the one job where its
mistakes are catchable. The translation is validated against the original —
bullets are counted, and a response that lost or gained one is discarded — and a
brief that has been through a model is labelled as translated, because a headline
is no longer verbatim afterwards. When a translation cannot be delivered, the
panel says so and shows Nepali rather than substituting silently.

> [!NOTE]
> **Language coverage depends entirely on which LLM provider you configure.**
> Frontier models handle most of the list. Open-weight models are faster and
> cheaper but are materially weaker on low-resource languages — including
> several of Nepal's own. See [Multilingual briefs](#multilingual-briefs-1) under
> API Keys Setup for how to check what your provider actually delivers.

Without any LLM key, briefs are available in Nepali and English only — the two
languages the wire itself arrives in.

### Detailed dashboard

- **Nepal map** — flat D3 map fitted to the national bounding box, with hazard stories placed by province and classified as seismic, flood, landslide, wildfire, weather, glacier, air quality or response
- **Seismic watch** — recent earthquakes with magnitude, depth and province, the highest-consequence panel in the build
- **Rain & flood watch** — active severe weather alerts plus the wettest stations by cumulative five-day rainfall, the measure that actually drives slope failure
- **Wildfire detection** — FIRMS detection counts by province, with overnight burning called out separately
- **Air quality** — US AQI and PM2.5 across 10 Nepali cities, colour-banded by severity
- **Active response** — disasters listed as ongoing for Nepal by UN OCHA, with the latest situation reports
- **Hazard reads** — LLM or rule-based actionable reads across every layer
- **Hazard core** and **source health** — live metrics and per-source status, including degraded fallbacks
- **Eight hazard news panels** — live feed, seismic, flood and landslide, weather warnings, wildfire, air quality, glacier and climate, relief and response
- **Window selector** (6h / 24h / 48h / 7d) applied across every news panel

### Disaster-filtered news, independent of the sweep

The news panels do not wait for the 15-minute sweep. They poll `/api/v1/news` on
their own cadence. The aggregator fans out across Nepali dailies and
hazard-scoped Google News queries, then applies two gates before anything
reaches a panel: a **hazard gate** (the item must name a natural hazard, its
impact, or the response to it) and a **Nepal gate** (it must carry a Nepal
marker or come from a Nepali outlet). Keyword matching respects word boundaries
in Latin script, so `rain` does not match "training" and `fire` does not match
"firefighter", while Devanagari matches on substring because Nepali attaches
case suffixes directly to the noun.

Nepali-language headlines are first-class. Most first-hand district reporting is
published in Nepali before it reaches English, so the geo-tagger resolves
Devanagari district and river-basin names and places those stories on the map by
district rather than dropping them.

### Performance Modes

The `VISUALS FULL` / `VISUALS LITE` button in the top bar only changes rendering behaviour — it does **not** remove data sources or reduce sweep coverage. LITE disables decorative background effects, blur, non-essential animations, and converts animated marquees into static scrollable lists. The preference is saved in browser local storage.

### Auto-Refresh

The server runs a sweep cycle every 15 minutes (configurable). Each cycle:

1. Queries all five hazard sources in parallel
2. Synthesizes raw data into dashboard format and fetches disaster-filtered RSS
3. Computes the delta from the previous run (what changed, escalated, de-escalated)
4. Generates actionable reads — LLM if configured, rule-based hazard engine otherwise
5. Evaluates alerts — multi-tier (FLASH / PRIORITY / ROUTINE) with semantic dedup, sent to Telegram and/or Discord if configured
6. Pushes the update to all connected browsers via SSE

The flood desk runs its own faster cycle (10 minutes by default) so a government
portal falling over degrades to slightly older figures rather than an empty page.

### Alerts (one-way)

When hazard conditions change, Atlas pushes multi-tier alerts — FLASH,
PRIORITY, ROUTINE — with semantic deduplication so the same event does not
arrive five times.

| Channel | Setup |
|---------|-------|
| Telegram | `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` |
| Discord | `DISCORD_WEBHOOK_URL` — rich embeds colour-coded by tier |

> [!NOTE]
> **Alerts are one-way. There are no bot commands.** An earlier build carried
> Telegram long-polling and a discord.js gateway client, but nothing ever
> started either of them, so `/status`, `/sweep` and `/brief` never worked. That
> dead code was removed rather than documented. A two-way bot needs its own
> long-lived process, and is not implemented.

### Optional community layer (Supabase + MinIO)

Two features on the flood desk need somewhere to put state: **crowdsourced
photos** sent in from the corridor, and the **stored ten-minute news digests**
that show how an event developed rather than a wall of near-duplicate headlines.

Both are optional and each hides itself when its backing service is absent, so
Atlas still runs as a pure monitoring dashboard with neither configured. Supabase
holds the records, MinIO holds the image objects.

Apply the schema out of band — PostgREST cannot run DDL — with
`supabase db push`, then `make migrate` to check the tables and the
`flood_photo_recount` RPC are reachable. `make migrate` only verifies; it
does not migrate.

### Optional LLM Layer

Connect any of **11 providers** for enhanced analysis:

- **Hazard reads** — an emergency management analyst producing 5-8 reads citing specific data, aware of monsoon and fire seasonality, typed `PREPARE` / `RESPOND` / `WATCH` / `STAND-DOWN`
- **Smarter alert evaluation** — LLM classifies signals into FLASH/PRIORITY/ROUTINE with cross-layer correlation and confidence scoring
- **Multilingual briefs** — carries the flood desk's news brief into the reader's language (see above)
- Providers: Anthropic Claude, OpenAI, Google Gemini, OpenRouter, OpenAI Codex, MiniMax, Mistral, Ollama, Grok (xAI), Groq, Tarka
- Graceful fallback — when the LLM is unavailable a rule-based hazard engine takes over. LLM failures never crash the sweep.

---

## API Keys Setup

```bash
cp .env.example .env
```

### Recommended (both free)

| Key | Source | How to Get |
|-----|--------|------------|
| `FIRMS_MAP_KEY` | NASA FIRMS satellite fire detection over Nepal | [firms.modaps.eosdis.nasa.gov](https://firms.modaps.eosdis.nasa.gov/api/area/) — instant, free |
| `RELIEFWEB_APPNAME` | UN OCHA humanitarian reporting | [apidoc.reliefweb.int](https://apidoc.reliefweb.int/parameters#appname) — free, approval required |

Nepal's highest-consequence feeds — USGS seismic, Open-Meteo weather and Open-Meteo air quality — need no key at all.

### LLM Provider (optional)

Set `LLM_PROVIDER` to one of: `anthropic`, `openai`, `gemini`, `codex`,
`openrouter`, `minimax`, `mistral`, `ollama`, `grok`, `groq`, `tarka`

> [!WARNING]
> `grok` is **xAI's model**. `groq` is the **inference host** at api.groq.com.
> They are one letter apart, take different keys, and the mix-up costs an
> afternoon. Groq keys begin `gsk_`; xAI keys begin `xai-`.

| Provider | Key Required | Default Model |
|----------|-------------|---------------|
| `anthropic` | `LLM_API_KEY` | claude-sonnet-4-6 |
| `openai` | `LLM_API_KEY` | gpt-5.4 |
| `gemini` | `LLM_API_KEY` | gemini-3.1-pro |
| `openrouter` | `LLM_API_KEY` | openrouter/auto |
| `codex` | None (uses `~/.codex/auth.json`) | gpt-5.3-codex |
| `minimax` | `LLM_API_KEY` | MiniMax-M2.5 |
| `mistral` | `LLM_API_KEY` | mistral-large-latest |
| `ollama` | None (local) — `OLLAMA_BASE_URL` to move the host | llama3.1:8b |
| `grok` | `LLM_API_KEY` | grok-4-latest |
| `groq` | `LLM_API_KEY` | openai/gpt-oss-120b |
| `tarka` | `LLM_API_KEY` | himalaya-gemma-4-bf16 *(recommended; set explicitly)* |

For Codex, run `npx @openai/codex login` to authenticate via your ChatGPT subscription.

**Reasoning models.** Some models spend part of their token budget on hidden
reasoning before emitting anything, so a budget sized for the answer alone comes
back empty. `LLM_REASONING_EFFORT` (`low` | `medium` | `high`) controls this.
Leave it unset to let the provider choose; Groq defaults the gpt-oss family to
`low`. If briefs come back blank rather than wrong, this is the first setting to
change.

#### Multilingual briefs

**Which provider you pick determines how many of the ~130 languages actually
work.** Frontier models (Anthropic, Gemini, OpenAI) handle most of the list.
Open-weight models served on Groq are fast and cheap but are materially weaker on
low-resource languages — including nine of the ten Nepal languages the picker
exists to serve: Maithili, Bhojpuri, Tharu, Tamang, Newar, Bajjika, Magar Dhut,
Awadhi and Doteli.

When a translation fails validation, Atlas keeps the Nepali original and the
panel says so. That is the correct behaviour — a confident-sounding malformed
brief on a page people use to decide whether to move is worse than Nepali they
can partly read — but to a user it looks like translation is broken.

To find out what your provider actually delivers, watch the logs:

```
[Digest] Keeping the original; Maithili could not be delivered
```

Each line names a language your model could not write. If that list is long, the
provider is the cause, not the code. Options, in order of effort:

1. Use a frontier provider for the flood desk.
2. On Groq, try a larger or more multilingual model. Check what your key can
   reach with `GET https://api.groq.com/openai/v1/models`.
3. Raise `LLM_REASONING_EFFORT` if briefs come back *empty* rather than wrong.
4. Trim `backend/app/domains/ai/languages.py` to the languages you can actually serve.
   Offering 130 and delivering 40 is exactly what that file's design note was
   written to prevent.

Groq's free tier is metered per minute. Atlas retries a `429` honouring
`Retry-After`, but a burst of language switches on a busy page can still exhaust
it — a paid tier is worth it if the multilingual panel matters to you.

### Community layer (optional)

| Key | How to Get |
|-----|------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project → Settings → API |
| `SUPABASE_SECRET_KEY` | Supabase → API keys. **The secret key, never the publishable one** — these tables have row-level security on with no policies, so the browser-facing key reads nothing |
| `MINIO_ENDPOINT` / `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | Your MinIO or S3-compatible object store |
| `MINIO_BUCKET` | Bucket for uploaded photos (default `atlas`) |
| `ATLAS_IP_SALT` | Random string. Salts hashed uploader IPs for rate limiting — set it, or the hashes are not worth much |
| `ATLAS_MEDIA_SECRET` | Signs media proxy URLs. **Required in production and identical on every instance** — unset, a random key is minted per process and image links die on restart |
| `FLOOD_ADMIN_TOKEN` | Bearer token for photo moderation and content reload endpoints |
| `FLOOD_REFRESH_TOKEN` | Bearer token to trigger `POST /api/v1/flood/refresh` externally |
| `YOUTUBE_API_KEY` | *(Optional)* Enriches the flood desk's video panel |

### Alerts (optional)

| Key | How to Get |
|-----|------------|
| `TELEGRAM_BOT_TOKEN` | Create via [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_CHAT_ID` | Get via [@userinfobot](https://t.me/userinfobot) |
| `DISCORD_WEBHOOK_URL` | Channel Settings → Integrations → Webhooks |

Alerts are one-way. There is no bot token to set, because there is no bot.

### Without Any Keys

Atlas works with zero API keys. Three of the five hazard sources need no authentication, including seismic and weather — the two highest-consequence layers. FIRMS reports `no_key` and the wildfire panel says so; ReliefWeb falls back to hazard-filtered HDX datasets. The community photo layer and the stored digests hide themselves. Briefs are available in Nepali and English. The rest of the sweep continues normally.

---

## Architecture

Atlas is a **Python/FastAPI backend** and a **Next.js frontend**. All fetching,
scraping, scheduling and persistence is Python. The frontend renders and nothing
else.

```
backend/     FastAPI + Celery. Every source, every route, every schedule.
frontend/    Next.js. Pages, views, components. Talks to the API over axios.
infra/       dev/, prod/ and split/ Compose stacks.
docs/        Quick start and architecture.
runs/        Gitignored. The worker writes it; the API reads it.
supabase/    The SQL schema, applied out of band.
```

Three backend processes, and the constraint on each:

| Service | Does | Constraint |
|---|---|---|
| `api` | Serves HTTP. **Reads** `runs/`, never writes it. | Never fetches from a government portal on the request path. |
| `worker` | Runs every sweep and refresh. The **only** writer of `runs/`. | **Do not scale past one replica.** |
| `beat` | The clock. 15-min hazard sweep, 10-min flood refresh. | Separate, so restarting a worker mid-sweep does not lose the schedule. |

Redis is Celery's broker **and** the channel the worker uses to tell the API a
sweep landed. It carries the signal, never the state — the payloads are JSON
files under `runs/`, written atomically and read by both services.

**→ [Full architecture, with a diagram](docs/architecture/architecture.md)**

### Design Principles

- **Hazard-only** — if a signal is not a natural hazard, its impact, or the response to it, it does not belong in this build
- **The API never fetches on the request path** — a reader's page load must not depend on a government portal being up
- **Parallel execution** — `asyncio.gather` fires all five sources simultaneously, each with its own timeout
- **Graceful degradation** — missing keys produce structured errors, not crashes. A source running on a fallback feed reports as degraded rather than healthy.
- **Each source is standalone** — run `python -m app.domains.hazards.sources.seismic` to test any source independently
- **Zero is a claim** — BIPAD stores unfilled loss records as zeros, so every total travels with how many records actually carried figures. An absent counter is `None`, never `0`.
- **Seasonality is context, not noise** — thresholds move with the monsoon and fire calendars
- **Provenance over polish** — every panel says where its text came from and whether a model touched it. A summary that reads well is indistinguishable from a summary that is right, and the reader cannot tell them apart from the page.

## Data Sources

Five hazard sources in the sweep. Three need no key.

| Source | What It Tracks | Auth |
|--------|---------------|------|
| **USGS Seismic** | Earthquakes across Nepal and the Main Himalayan Thrust, bucketed by province, with depth and nearest city | None |
| **Open-Meteo Weather** | Forecasts for 10 cities with monsoon-aware flood and landslide thresholds, extreme heat, and five-day cumulative rainfall | None |
| **Open-Meteo Air Quality** | PM2.5, PM10 and US AQI across 10 Nepali cities | None |
| **NASA FIRMS** | Satellite fire detection across all seven provinces, with fire-season and overnight-burn awareness | Free key |
| **ReliefWeb** | UN OCHA declared disasters and situation reports for Nepal, hazard-filtered HDX fallback | Appname |

The flood desk additionally reads the **NDRRMA BIPAD Portal** (river gauges,
bulletins, notices), the **OPMCM rescue portal**, and the **Government of Nepal
updates portal** at [nepal.gov.np](https://nepal.gov.np/updates), where
ministries post operational updates directly. That feed carries the whole
government, so every post passes the news wire's hazard gate before it reaches
the desk, and nothing in it is parsed into a figure.

**Climate** lives at `/climate` (and `/ne/climate`), linked from the site footer — not nested in any event. A weekly task reads the [Our World in Data CO₂ dataset](https://github.com/owid/co2-data) (Global Carbon Project + OWID, public domain / CC-BY) into `runs/climate-context.json`, and a national BIPAD yearly reduce into `runs/climate-arrived.json`. Glacier and GLOF figures cannot be parsed from those PDFs — they live in the reviewed file [`backend/content/climate/source-facts.json`](backend/content/climate/source-facts.json). Heat, water, air and fire panels stay off until a reviewed series is wired. How to update the reviewed file is in [`backend/content/climate/README.md`](backend/content/climate/README.md). The section does not attribute any specific flood to climate change or to any country's emissions.

### Live hazard news aggregator

Separate from the sweep, `backend/app/domains/news/sources/nepal_news.py` powers
the `/api/v1/news` route and every news panel.

Every headline that actually reaches a panel is also appended, once, to
`runs/news-ledger.csv` and served at `GET /api/v1/news/ledger.csv`. That is the
collected-news table behind [issue #37](https://github.com/ancoda-labs/Ancoda-Atlas/issues/37):
title, outlet, time, topic, and a stable `id` to score sentiment against. The
[News Data](https://docs.google.com/spreadsheets/d/1vjfxH1iCnaWxynNE25cR3cPw-TSo5-ygkVldvr6YKgE/edit) sheet
pulls it with `IMPORTDATA`. See `docs/news-ledger.md`.

| Topic | Panel |
|-------|-------|
| `all` | Live Hazard Feed |
| `earthquake` | Seismic Reporting |
| `flood` | Flood & Landslide |
| `weather` | Weather Warnings |
| `wildfire` | Wildfire |
| `airquality` | Air Quality |
| `climate` | Glacier & Climate Hazard |
| `relief` | Relief & Response |
| `disaster` | Broad disaster feed — the fallback every other topic widens into |

### Known limitations

- **ReliefWeb requires an approved appname** since November 2025, and API v1 was decommissioned (Atlas uses v2). Without `RELIEFWEB_APPNAME` the source reports as degraded and falls back to hazard-filtered HDX datasets — dataset listings, not live situation reports.
- **Weather alerts are model output, not warnings.** Open-Meteo forecasts drive the flood and landslide thresholds. They are a reason to check DHM, never a substitute for it.
- **FIRMS needs a free key.** Without `FIRMS_MAP_KEY` the wildfire layer reports `no_key` and stays empty.
- **Hazard news panels go quiet out of season.** An empty wildfire panel in August is correct behaviour, not a failure — Nepal's fire season runs March to May.
- **Language coverage is provider-dependent.** The picker offers ~130 languages; how many arrive translated depends on the model you configure, and low-resource languages fail most often. Atlas falls back to Nepali and says so rather than substituting silently.
- **The stored ten-minute digests are English and Nepali only.** The ~130-language brief is the live AI Insights panel; the digest timeline and the page-level toggle are bilingual.
- **The insights cache is in-process.** Fine on a single container. Behind multiple replicas each instance translates independently, which multiplies rate-limit pressure.

---

## Commands

Everything runs through the Makefile; the backend checks run inside the API
container, so there is no local Python to install.

| Command | Description |
|---------|-------------|
| `make up` / `make down` | Start / stop the dev stack |
| `make logs` · `make ps` · `make shell` | Tail logs, container status, shell in the API |
| `make restart` | Restart the API, worker and scheduler |
| `make sweep` | Run one national hazard sweep by hand |
| `make flood` | Run one flood desk refresh by hand |
| `make climate` | Run one climate refresh (OWID CO₂ + BIPAD yearly) by hand |
| `make diag` | Python, imports, ports, and which keys are set |
| `make migrate` | Check the Supabase schema is reachable (it does not migrate) |
| `make clean` | Delete the runtime sweep and desk files in `runs/` |
| `make test` · `make lint` · `make typecheck` | pytest, ruff, mypy |
| `make fe-build` | Type-check and build the frontend |
| `make storage` | Start the optional local MinIO sidecar |
| `make be` / `make fe` | Run one half alone, for a two-machine deploy |
| `make hooks` | Enable the versioned git hooks in `.githooks` |

Before opening a PR run `make test`, `make lint`, `make typecheck`, and
`cd frontend && npm run verify`. The pre-commit hook does both halves.

Each hazard source is standalone:

```bash
docker compose -f infra/dev/docker-compose.yml exec api \
  python -m app.domains.hazards.sources.seismic
```

## Configuration

One `.env` at the repository root, read by both services. **Do not put a comment
on the same line as a value** — Docker's `env_file` treats it as part of the
value. `.env.example` is the tracked template and lists every variable.

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3117` | Frontend port |
| `API_HOST_PORT` | `8000` | API port on the host |
| `NEXT_PUBLIC_API_BASE_URL` | — | Baked into the browser bundle at **build** time |
| `ATLAS_API_BASE_URL` | `http://localhost:8000` | Read at **runtime** by the server renderer |
| `ALLOWED_ORIGINS` | `http://localhost:3117` | Origins the API answers. Load-bearing on a split deploy |
| `ATLAS_RUNS_DIR` | `./runs` | Where the sweep snapshot and desk store live |
| `REFRESH_INTERVAL_MINUTES` | `15` | Hazard sweep interval |
| `FLOOD_REFRESH_INTERVAL_MINUTES` | `10` | Flood desk interval (minimum 2) |
| `FLOOD_REFRESH_TOKEN` | — | Bearer token for `POST /api/v1/flood/refresh` |
| `FIRMS_MAP_KEY` | disabled | NASA FIRMS satellite fire detection |
| `RELIEFWEB_APPNAME` | — | Approved ReliefWeb appname |
| `LLM_PROVIDER` | disabled | `anthropic`, `openai`, `gemini`, `codex`, `openrouter`, `minimax`, `mistral`, `ollama`, `grok`, `groq`, `tarka` |
| `LLM_API_KEY` | — | Not needed for codex or ollama |
| `LLM_MODEL` | per-provider default | Override model selection |
| `LLM_REASONING_EFFORT` | provider default | `low` / `medium` / `high` for reasoning models |
| `LLM_BASE_URL` · `OLLAMA_BASE_URL` | — | Override a provider's base URL |
| `NEXT_PUBLIC_SUPABASE_URL` | disabled | Community layer database |
| `SUPABASE_SECRET_KEY` | — | Service-role key (**not** the publishable one) |
| `MINIO_ENDPOINT` · `MINIO_BUCKET` | disabled · `atlas` | Object store for uploaded photos |
| `ATLAS_IP_SALT` | — | Salt for hashed uploader IPs |
| `ATLAS_MEDIA_SECRET` | — | Signs media proxy URLs. Required in production |
| `FLOOD_ADMIN_TOKEN` | — | Bearer token for photo takedown and content reload |
| `YOUTUBE_API_KEY` | disabled | Enriches the flood desk video panel |
| `TELEGRAM_BOT_TOKEN` · `TELEGRAM_CHAT_ID` | disabled | One-way Telegram alerts |
| `DISCORD_WEBHOOK_URL` | disabled | One-way Discord alerts |
| `DOMAIN_FRONTEND` · `DOMAIN_API` · `ACME_EMAIL` | — | Traefik routing and certificates |
| `ATLAS_RUNS_PATH` | `./runs` | Host path for `runs/`. Use an absolute path outside the repo |

Delta engine thresholds live in
[`backend/app/domains/hazards/delta/engine.py`](backend/app/domains/hazards/delta/engine.py).
They are tuned for Nepal: any new earthquake or flood alert clears the bar on
its own, while fire detection counts need a swing of a couple hundred before
they mean anything.

Geographic coverage lives in
[`backend/app/core/nepal.py`](backend/app/core/nepal.py) — the national bounding
box, the widened seismic box that catches ruptures just across the border, the
seven provinces, the ten monitored cities, and the keyword set used to filter
text feeds down to Nepal.

## API Endpoints

Everything is under `/api/v1`. Interactive docs at `http://localhost:8000/docs`.

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/data` | The synthesized hazard snapshot |
| `GET /api/v1/news` | Disaster-filtered news. Params: `topic`, `window`, `limit`, `sourceCap` |
| `GET /api/v1/news/ledger.csv` | Every headline Atlas has shown, as CSV — for [issue #37](https://github.com/ancoda-labs/Ancoda-Atlas/issues/37) and the News Data sheet |
| `GET /api/v1/flood` | The flood desk overview — reviewed content plus live gauges |
| `GET /api/v1/climate` | Climate page — OWID emissions, BIPAD yearly arrivals, reviewed glacier/GLOF facts |
| `GET /api/v1/flood/situation` | Incidents, alerts and live filings |
| `GET /api/v1/flood/insights?lang=` | The overview brief, in a chosen language |
| `GET /api/v1/flood/digest?lang=&limit=` | Stored ten-minute digests (needs Supabase) |
| `GET /api/v1/flood/persons` | The OPMCM missing-and-found register |
| `GET /api/v1/flood/rescue` | The NDRRMA rescued-persons register |
| `GET` · `POST /api/v1/flood/rescue/correction` | Corrections filed against the register |
| `GET /api/v1/flood/contacts` | District contacts and helplines |
| `GET /api/v1/flood/donations` | Published donation channels |
| `GET` · `POST /api/v1/flood/photos` | Ground reports (needs Supabase + MinIO) |
| `POST /api/v1/flood/photos/report` | Flag a ground report |
| `DELETE /api/v1/flood/photos/{id}` | Take one down (`FLOOD_ADMIN_TOKEN`) |
| `POST /api/v1/flood/content/reload` | Clear reviewed-content cache (`FLOOD_ADMIN_TOKEN`) |
| `GET /api/v1/flood/gallery` · `/videos` · `/press` | Media panels |
| `GET /api/v1/flood/media/image` | Signed proxy for one news photograph |
| `GET /api/v1/flood/station-photo?id=` | HTTPS proxy for a DHM gauge-station photo |
| `GET` · `POST /api/v1/flood/refresh` | Cycle health; trigger one out of band |
| `GET` · `POST /api/v1/sandbox/ask` | The unlisted desk sandbox |
| `GET /events` | SSE stream for live push updates |
| `GET /health` · `/health/ready` | Liveness and readiness probes |

## Troubleshooting

### Dashboard shows empty panels after first start

Normal. The first sweep takes a few seconds; the dashboard populates once it completes and pushes over SSE. Check the terminal for sweep progress logs.

### Something will not start

Run `make diag`. It reports the Python version, imports every module, checks
ports, and lists which optional services and keys are configured. Docker and
Docker Compose are the only host requirements — Python and Node live in the
images.

### Some sources show errors or degraded status

Expected. Sources needing keys return structured errors and the rest of the sweep continues. A **yellow** source dot means degraded — the source answered, but on a fallback feed (ReliefWeb without an approved appname is the usual cause). A **red** dot means it failed outright.

### A hazard news panel is empty

Check the season before assuming a bug. Wildfire is quiet outside March–May, air quality outside the winter inversion, and glacier hazard reporting is sparse year-round. The panels never relax the hazard or Nepal gates to fill themselves.

### The brief says "It could not be written in \<language\>"

That is the fallback working, not a crash. Atlas asked your model to translate,
the response failed validation, and it kept the Nepali original rather than
publishing something it could not vouch for. Check the logs for
`[Digest] Keeping the original; <language> could not be delivered`.

Common causes, in order:

1. **No LLM configured.** Without a key only Nepali and English are possible.
2. **The model cannot write that language.** Most likely with open-weight models
   on low-resource languages. See [Multilingual briefs](#multilingual-briefs-1).
3. **Rate limited.** Groq's free tier is metered per minute. Look for
   `[Groq] 429 on attempt …` in the logs.
4. **Empty responses on a reasoning model.** Look for `returned no content — the
   … budget went to reasoning`. Lower `LLM_REASONING_EFFORT`.

### The digest timeline is empty or always English

The stored ten-minute digests need Supabase. Without it, `/api/v1/flood/digest`
returns `enabled: false` with `reason: "database_not_configured"` and the panel
hides itself. The digest route is bilingual by design — the ~130-language brief
is the AI Insights panel, not this one.

### Photo uploads fail

Both Supabase **and** MinIO must be configured. Check `ATLAS_MEDIA_SECRET` and
`ATLAS_IP_SALT` are set, and that the schema has been applied
(`supabase db push`, then `make migrate` to verify). `make diag` says which
services are missing.

### The flood desk says it is awaiting figures

It has no completed cycle yet. On a fresh deploy that clears within a minute.
If it persists, check the worker and the API are pointed at the same
`ATLAS_RUNS_PATH` — a worker writing a store the API cannot see produces
exactly this.

### Alerts are not arriving

Telegram needs both `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`; verify the
token with `curl https://api.telegram.org/bot<YOUR_TOKEN>/getMe`. Discord needs
`DISCORD_WEBHOOK_URL`.

There are no bot commands to test — alerts are one-way.

---

## Contributing

Found a bug? Want to add a hazard source? PRs welcome. Each source is a standalone module in `backend/app/domains/hazards/sources/` — answer a dict, never raise, and register it in `backend/app/domains/hazards/sweep.py`. A source that affects the dashboard needs delta metrics too.

Before opening a PR run `make test`, `make lint`, `make typecheck` and `cd frontend && npm run verify`. The pre-commit hook runs both halves, and CI runs the same thing. Responses are camelCase: `frontend/src/types/index.ts` is the contract and `backend/tests/test_contract.py` fails the build on a snake_case key.

Source additions must be natural-hazard sources. Political, market, conflict and general-news feeds are out of scope for this build by design.

**Where help is most useful right now:**

- **Nepali and other native-language review.** Much of the UI copy and the flood content is marked `pending_native_review`. This is the highest-value contribution to the project and needs no JavaScript at all.
- **Language coverage testing.** If you speak one of the languages in `backend/app/domains/ai/languages.py`, checking whether the brief actually reads correctly in it — and opening an issue when it doesn't — directly improves whether that language stays offered.
- **Relief-fund and helpline verification.** Every record in `backend/content/` carries a source and a verification date. Stale ones matter.

Contributions are licensed under the AGPL-3.0. See [CONTRIBUTING.md](CONTRIBUTING.md) for scope rules and review expectations, and [SECURITY.md](SECURITY.md) for security reports or corrections to a relief fund or helpline.

## Contact

Ancoda Atlas is built and maintained by **Ancoda Labs**.

For partnerships, integrations, security reports, or corrections to a relief fund
or helpline: `research@ancodalabs.com`.

For bugs and feature requests, please use [GitHub Issues](https://github.com/ancoda-labs/Ancoda-Atlas/issues).

---

## Star History

<a href="https://www.star-history.com/?repos=ancoda-labs%2FAncoda-Atlas&type=date&legend=top-left">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/image?repos=ancoda-labs/Ancoda-Atlas&type=date&theme=dark&legend=top-left" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/image?repos=ancoda-labs/Ancoda-Atlas&type=date&legend=top-left" />
    <img alt="Star History Chart" src="https://api.star-history.com/image?repos=ancoda-labs/Ancoda-Atlas&type=date&legend=top-left" />
  </picture>
</a>

---

## Attribution

- Administrative boundary data for Nepal's provinces and districts is derived
  from [openknowledgenp/localboundaries](https://github.com/openknowledgenp/localboundaries)
  (**MIT**), reduced in coordinate precision.
- Relief-fund, bank and helpline content is compiled from primary Government of
  Nepal and news sources, each recorded in the record's own source field.
- Live hazard data comes from USGS, Open-Meteo, NASA FIRMS, ReliefWeb (UN OCHA),
  HDX and the NDRRMA BIPAD Portal. Atlas queries these at runtime and does not
  redistribute them in bulk.

Full details, including the provenance of the codebase itself, are in
[NOTICE](NOTICE).

## License

**AGPL-3.0-only.** Copyright (c) 2026 Ancoda Labs.

Atlas began as a derivative of an existing AGPL-3.0 project and has since been
substantially rewritten and re-scoped by Ancoda Labs. Because the AGPL is a
copyleft licence, that lineage carries forward: Atlas and every derivative of it
stay under the AGPL-3.0.

The practical consequence, and the reason this licence suits a public-good
project: **if you run a modified Atlas as a network service, you must offer your
users the source of your modified version.** Disaster tooling that the public
depends on should not be able to disappear behind a private fork.

See [LICENSE](LICENSE) for the full text and [NOTICE](NOTICE) for provenance and
third-party attributions.
