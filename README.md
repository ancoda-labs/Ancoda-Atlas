<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/images/atlas-white.png">
  <source media="(prefers-color-scheme: light)" srcset="public/images/atlas-black.png">
  <img alt="Ancoda Atlas" src="public/images/atlas-black.png" width="420">
</picture>

# Ancoda Atlas

**Nepal emergency disaster intelligence. Natural hazards only. One command. Zero cloud.**

An open-source project by [Ancoda Labs](https://github.com/ancodalabs).

## [Visit Ancoda Labs](https://ancodalabs.com/)

[![Ancoda Labs](https://img.shields.io/badge/Ancoda%20Labs-website-00d4ff?style=for-the-badge)](https://ancodalabs.com/)

[![Node.js 22+](https://img.shields.io/badge/node-22%2B-brightgreen)](#quick-start)
[![License: AGPL v3](https://img.shields.io/badge/license-AGPLv3-blue.svg)](LICENSE)
[![Maintained by Ancoda Labs](https://img.shields.io/badge/maintained%20by-Ancoda%20Labs-7c5cff)](https://github.com/ancodalabs)
[![Hazard sources](https://img.shields.io/badge/hazard%20sources-5-cyan)](#data-sources)
[![Focus](https://img.shields.io/badge/focus-Nepal%20%F0%9F%87%B3%F0%9F%87%B5-dc143c)](#scope)
[![Docker](https://img.shields.io/badge/docker-ready-blue?logo=docker)](#docker)
[![CI](https://github.com/ancodalabs/atlas/actions/workflows/ci.yml/badge.svg)](https://github.com/ancodalabs/atlas/actions/workflows/ci.yml)

**Follow Ancoda Labs**

[![X](https://img.shields.io/badge/X-%40ancodalabs-111111?style=for-the-badge&logo=x&logoColor=white)](https://twitter.com/ancodalabs)
[![Instagram](https://img.shields.io/badge/Instagram-%40ancodalabs-E4405F?style=for-the-badge&logo=instagram&logoColor=white)](https://www.instagram.com/ancodalabs)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Ancoda%20Labs-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/company/ancodalab/)
[![Discord](https://img.shields.io/badge/Discord-Ancoda%20Labs-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/g9wZXVxTcx)

</div>

> [!IMPORTANT]
> **Atlas is a monitoring aid, not a warning system.** It reads satellite feeds and weather models directly and does not republish official warnings. Confirm every finding against Nepal's [DHM](https://www.dhm.gov.np/), [NDRRMA](https://bipadportal.gov.np/) or the [National Seismological Centre](https://seismonepal.gov.np/) before acting on it or issuing public guidance.

Atlas pulls earthquake activity, monsoon and flood forecasts, satellite fire detection, air quality and humanitarian response reporting from five open hazard feeds — all scoped to Nepal, in parallel, every 15 minutes — plus a disaster-filtered live news layer from Nepali dailies, and renders everything on a single self-contained dashboard.

Hook it up to an LLM and it becomes a **two-way emergency assistant** — pushing multi-tier alerts to Telegram and Discord when hazard conditions change, responding to `/brief` and `/sweep` from your phone, producing actionable reads grounded in real cross-layer hazard data, and carrying the flood desk's news brief into any of ~130 languages for families reading from outside Nepal.

No cloud. No telemetry. No subscriptions.

Live at **[atlas.ancodalabs.com](https://atlas.ancodalabs.com)**.

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

Every geographic boundary, province and city lives in [`src/apis/utils/nepal.mjs`](src/apis/utils/nepal.mjs). Edit that file to adjust coverage; nothing else hardcodes geography.

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

```bash
# 1. Clone the repo
git clone https://github.com/ancodalabs/atlas.git
cd atlas

# 2. Install dependencies
npm install

# 3. Copy env template and add your API keys (see below)
cp .env.example .env

# 4. Start the dashboard
npm run dev
```

The dashboard runs at `http://localhost:3117` and begins its first hazard sweep immediately. The sweep queries all five sources in parallel and typically completes in under 10 seconds. After that it auto-refreshes every 15 minutes and pushes updates over SSE — no manual page refresh needed.

Run `npm run diag` if something fails to start; it checks your Node version, imports every local module individually, and verifies port availability.

**Requirements:** Node.js 22+ (uses native `fetch`, top-level `await`, ESM)

### Docker

Docker is the recommended way to run the production build. Docker Compose
loads configuration from `.env` and persists sweep data in the local `runs/`
directory.

```bash
# From the repository root:
cp .env.example .env
# Edit .env and add optional API keys, if available.
docker compose up --build -d
```

The dashboard is available at `http://localhost:3117`. The container exposes
the port configured by `PORT` in `.env` and persists `runs/latest.json`,
`runs/dashboard.json`, and sweep memory through the `./runs:/app/runs` volume.

```bash
# Follow application logs
docker compose logs -f atlas

# Check container health and status
docker compose ps

# Stop the service (keeps ./runs/)
docker compose down
```

To use another host port, set `PORT` in `.env` before starting Compose. The
same value is used inside and outside the container.

The image build installs all platform-specific optional dependencies required by
Next.js and skips local Git hooks, which are only configured on developer
machines by `npm install`.

### Why not a serverless or edge runtime

Atlas needs a host that runs a long-lived Node process with a writable disk. It
is not deployable to Cloudflare Workers, or to any other edge-serverless
runtime, and adapters such as OpenNext cannot bridge the gap — the build fails
while bundling, and the parts that did bundle would not work:

- **A native binary.** Rescue-register OCR rasterizes official PDFs through
  `@napi-rs/canvas`, which ships a platform-specific `.node` Skia binary. Edge
  runtimes execute no native modules, and no bundler setting changes that.
- **A writable filesystem.** The sweeper and the flood desk persist each cycle
  to `runs/`, and the dashboard reads `runs/dashboard.json` when its in-memory
  copy is cold. Edge runtimes have no writable disk.
- **Background schedulers.** The hazard sweep and the flood refresh are
  `setInterval` loops owned by the server process. Edge runtimes keep no process
  alive between requests.

Any container or VM host works: Docker Compose as above, or the published image
on a container platform. Use the `runs/` volume so sweep state survives a
restart.

---

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
`content/bhotekoshi-flood/` with its own source and verification date.

### Multilingual news briefs

Rasuwa is a trekking corridor and a labour-migration source district, so a large
share of the people refreshing the flood desk are reading from outside Nepal —
relatives abroad, embassies, responding agencies. And the communities downstream
of the Bhotekoshi are disproportionately Tamang, Tharu and Maithili speakers. A
relief notice someone cannot read is a notice that did not reach them.

The **AI Insights** panel therefore offers its brief in ~130 languages, listed in
[`src/lib/nepal-languages.ts`](src/lib/nepal-languages.ts) in two groups: Nepal's
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

The news panels do not wait for the 15-minute sweep. They poll `/api/news` on
their own 5-minute cadence. The aggregator fans out across Nepali dailies and
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

### Telegram Bot (Two-Way)

| Command | What It Does |
|---------|-------------|
| `/status` | System health, last sweep time, source status, LLM status |
| `/sweep` | Trigger a manual sweep cycle |
| `/brief` | Compact text summary of the latest hazard picture |
| `/alerts` | Recent alert history with tiers |
| `/mute` / `/mute 2h` | Silence alerts for 1h (or custom duration) |
| `/unmute` | Resume alerts |
| `/help` | Show all available commands |

Requires `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in `.env`.

### Discord Bot (Two-Way)

Mirrors the Telegram bot with Discord-native slash commands (`/status`, `/sweep`, `/brief`, `/alerts`, `/mute`, `/unmute`) and rich embed alerts colour-coded by tier: red for FLASH, yellow for PRIORITY, blue for ROUTINE.

**Webhook fallback:** set `DISCORD_WEBHOOK_URL` instead of a bot token for one-way alerts with zero extra dependencies.

**Optional dependency:** the full bot uses `discord.js`, which is installed
automatically by `npm install` and in the Docker image. Without it Atlas falls
back to webhook-only mode.

### Optional community layer (Supabase + MinIO)

Two features on the flood desk need somewhere to put state: **crowdsourced
photos** sent in from the corridor, and the **stored ten-minute news digests**
that show how an event developed rather than a wall of near-duplicate headlines.

Both are optional and each hides itself when its backing service is absent, so
Atlas still runs as a pure monitoring dashboard with neither configured. Supabase
holds the records, MinIO holds the image objects. Run `npm run db:migrate` to
apply the schema in `supabase/migrations/`.

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
4. Trim `src/lib/nepal-languages.ts` to the languages you can actually serve.
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
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → API keys, for browser-side reads |
| `MINIO_ENDPOINT` / `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | Your MinIO or S3-compatible object store |
| `MINIO_BUCKET` | Bucket for uploaded photos (default `atlas`) |
| `ATLAS_IP_SALT` | Random string. Salts hashed uploader IPs for rate limiting — set it, or the hashes are not worth much |
| `ATLAS_MEDIA_SECRET` | Signs media proxy URLs |
| `FLOOD_ADMIN_TOKEN` | Bearer token for the photo moderation endpoints |
| `FLOOD_REFRESH_TOKEN` | Bearer token to trigger `/api/flood/refresh` externally |
| `YOUTUBE_API_KEY` | *(Optional)* Enriches the flood desk's video panel |

### Telegram Bot + Alerts (optional)

| Key | How to Get |
|-----|------------|
| `TELEGRAM_BOT_TOKEN` | Create via [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_CHAT_ID` | Get via [@userinfobot](https://t.me/userinfobot) |
| `TELEGRAM_CHANNELS` | *(Optional)* Comma-separated extra channel IDs to broadcast to |
| `TELEGRAM_POLL_INTERVAL` | *(Optional)* Bot command polling interval in ms (default: 5000) |

### Discord Bot + Alerts (optional)

| Key | How to Get |
|-----|------------|
| `DISCORD_BOT_TOKEN` | [Discord Developer Portal](https://discord.com/developers/applications) → Bot → Token |
| `DISCORD_CHANNEL_ID` | Right-click channel (Developer Mode on) → Copy Channel ID |
| `DISCORD_GUILD_ID` | *(Optional)* Right-click server → Copy Server ID. Enables instant slash command registration |
| `DISCORD_WEBHOOK_URL` | *(Optional)* Channel Settings → Integrations → Webhooks. Alert-only mode without a bot |

**Discord bot setup:**
1. Create an application at the [Discord Developer Portal](https://discord.com/developers/applications)
2. **Bot** → **Reset Token** → copy to `DISCORD_BOT_TOKEN`
3. Under **Privileged Gateway Intents**, enable **Message Content Intent**
4. **OAuth2** → **URL Generator** → scopes `bot` + `applications.commands`, permissions `Send Messages` + `Embed Links`
5. Open the generated URL to invite the bot
6. `discord.js` is installed with the project dependencies.

### Without Any Keys

Atlas works with zero API keys. Three of the five hazard sources need no authentication, including seismic and weather — the two highest-consequence layers. FIRMS reports `no_key` and the wildfire panel says so; ReliefWeb falls back to hazard-filtered HDX datasets. The community photo layer and the stored digests hide themselves. Briefs are available in Nepali and English. The rest of the sweep continues normally.

---

## Architecture

```
atlas/
├── src/
│   ├── app/                   # Next.js App Router — routes and the views they render
│   │   ├── page.tsx           # SSR entry — hydrates DashboardClient
│   │   ├── layout.tsx
│   │   ├── DashboardClient.tsx    # View switch + the full monitoring terminal
│   │   ├── _components/       # Pieces used only by the dashboard route
│   │   ├── bhotekoshi-flood/  # Public flood response page
│   │   │   ├── BhotekoshiFloodView.tsx
│   │   │   ├── _components/   # Shared across the flood desk's own routes
│   │   │   └── <route>/       # rescue, donate, report, media, situation, contacts
│   │   ├── events/route.ts    # SSE stream for live push updates
│   │   └── api/
│   │       ├── data/route.ts  # Current synthesized hazard data (JSON)
│   │       ├── news/route.ts  # Disaster-filtered news, 4-minute server cache
│   │       ├── bipad/route.ts # NDRRMA BIPAD Portal telemetry
│   │       └── flood/         # Flood content, gauges, photos, digests, insights
│   │
│   ├── components/            # Reusable across routes — nothing route-specific
│   │   ├── ui/                # shadcn/ui primitives (Button, Command, Popover, …)
│   │   ├── FloodShell.tsx     # Chrome shared by every flood desk page
│   │   ├── NepalSignalsMap.tsx    # D3 province map, canvas-rendered
│   │   └── FloodDistrictMap.tsx   # Affected-district map with the flood path
│   │
│   ├── hooks/                 # use-atlas-theme, use-flood-lang
│   ├── types/                 # Shared domain types + .mjs module declarations
│   ├── styles/globals.css     # Tailwind entry, shadcn token map, Atlas design system
│   │
│   ├── apis/
│   │   ├── briefing.mjs       # Master orchestrator — runs all 5 sources in parallel
│   │   ├── save-briefing.mjs  # CLI: save timestamped + latest.json
│   │   ├── BRIEFING_PROMPT.md # Disaster briefing protocol
│   │   ├── BRIEFING_TEMPLATE.md   # Briefing output structure
│   │   ├── utils/
│   │   │   ├── fetch.mjs      # safeFetch() — timeout, retries, abort, auto-JSON
│   │   │   ├── nepal.mjs      # Geography: bbox, provinces, cities, seismic box
│   │   │   ├── flood-scope.mjs
│   │   │   └── env.mjs        # .env loader (no dotenv dependency)
│   │   └── sources/
│   │       ├── seismic.mjs    # USGS — each exports briefing() → structured data
│   │       ├── weather.mjs    # Open-Meteo, monsoon-aware thresholds
│   │       ├── firms.mjs      # NASA FIRMS satellite fire detection
│   │       ├── airquality.mjs # PM2.5, PM10 and US AQI across 10 cities
│   │       ├── reliefweb.mjs  # UN OCHA, HDX fallback
│   │       ├── bipad.mjs      # NDRRMA BIPAD Portal river gauges
│   │       ├── ndrrma*.mjs    # NDRRMA bulletins and notices
│   │       ├── rescue-portal.mjs  # OPMCM rescue register
│   │       ├── youtube.mjs    # Flood desk video panel
│   │       └── nepal-news.mjs # Hazard news aggregator behind /api/news
│   │
│   └── lib/
│       ├── utils.ts           # cn() — the shadcn class merger
│       ├── sweeper.ts         # Background sweep loop, SSE broadcast, alert dispatch
│       ├── flood-cron.ts      # The flood desk's own faster refresh cycle
│       ├── news-digest.mjs    # Extractive briefs + the translation layer
│       ├── news-digest-store.ts   # Stored ten-minute digests (Supabase)
│       ├── nepal-languages.ts # The ~130 languages briefs are offered in
│       ├── db.ts / storage.ts / supabase/   # Optional community layer
│       ├── llm/               # LLM abstraction (11 providers, raw fetch, no SDKs)
│       │   ├── provider.mjs   # Base class
│       │   ├── ideas.mjs      # LLM-powered hazard reads
│       │   └── index.mjs      # Factory: createLLMProvider()
│       ├── delta/
│       │   ├── engine.mjs     # Hazard delta computation, configurable thresholds
│       │   ├── memory.mjs     # Hot memory (3 runs, atomic writes) + cold archives
│       │   └── index.mjs      # Re-exports
│       └── alerts/
│           ├── telegram.mjs   # Multi-tier alerts + two-way bot commands
│           └── discord.mjs    # Slash commands, rich embeds, webhook fallback
│
├── content/
│   └── bhotekoshi-flood/      # Reviewed relief funds, helplines, figures
│
├── locales/                   # en, ne, fr UI strings
├── supabase/migrations/       # Community layer schema
├── test/                      # node:test suites (npm test)
│
├── scripts/
│   ├── diag.mjs               # Runtime and module diagnostics
│   ├── migrate.mjs            # Apply Supabase migrations
│   ├── check-no-any.mjs       # Fails the build on implicit `any`
│   └── synthesize.mjs         # CLI wrapper for dashboard synthesis
│
├── public/
│   ├── qr/                    # Government relief-fund payment QR codes
│   └── data/                  # Boundary GeoJSON (see NOTICE for attribution)
│
└── runs/                      # Runtime data (gitignored)
    ├── latest.json            # Most recent raw sweep output
    ├── dashboard.json         # Most recent synthesized payload (what the UI renders)
    └── memory/                # Delta memory (hot.json + cold/YYYY-MM-DD.json)
```

### Design Principles

- **Hazard-only** — if a signal is not a natural hazard, its impact, or the response to it, it does not belong in this build
- **Minimal dependencies** — Next.js and React at runtime. `discord.js` is optional. LLM providers use raw `fetch()`, no SDKs.
- **Parallel execution** — `Promise.allSettled()` fires all five sources simultaneously, each with its own timeout
- **Graceful degradation** — missing keys produce structured errors, not crashes. A source running on a fallback feed reports as degraded rather than healthy.
- **Each source is standalone** — run `node src/apis/sources/seismic.mjs` to test any source independently
- **Seasonality is context, not noise** — thresholds move with the monsoon and fire calendars
- **Provenance over polish** — every panel says where its text came from and whether a model touched it. A summary that reads well is indistinguishable from a summary that is right, and the reader cannot tell them apart from the page.

---

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
bulletins, notices) and the **OPMCM rescue portal**.

### Live hazard news aggregator

Separate from the sweep, `src/apis/sources/nepal-news.mjs` powers the `/api/news`
route and every news panel.

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

## npm Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `npm run dev` | `next dev` | Start the dashboard with auto-refresh |
| `npm run build` | `next build` | Production build |
| `npm start` | `next start` | Serve the production build |
| `npm test` | `node --test test/*.test.mjs` | Run the test suite |
| `npm run verify` | — | No-any check + tests + build. **Run this before opening a PR.** |
| `npm run check:no-any` | `node scripts/check-no-any.mjs` | Fail on implicit `any` |
| `npm run sweep` | `node src/apis/briefing.mjs` | Run a single sweep, output JSON to stdout |
| `npm run synthesize` | `node scripts/synthesize.mjs` | Synthesize `runs/latest.json` into dashboard shape |
| `npm run brief:save` | `node src/apis/save-briefing.mjs` | Run sweep + save timestamped JSON |
| `npm run db:migrate` | `node scripts/migrate.mjs` | Apply Supabase migrations |
| `npm run diag` | `node scripts/diag.mjs` | Run diagnostics (Node version, imports, port check) |
| `npm run clean` | `node scripts/clean.mjs` | Clear runtime data in `runs/` |
| `npm run fresh-start` | — | Clean, build, and start |

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3117` | Dashboard server port |
| `PUBLIC_URL` | — | Public base URL, for absolute links in alerts |
| `REFRESH_INTERVAL_MINUTES` | `15` | Sweep interval |
| `FLOOD_REFRESH_INTERVAL_MINUTES` | `10` | Flood desk refresh interval (minimum 2) |
| `FLOOD_REFRESH_TOKEN` | — | Bearer token for `POST /api/flood/refresh` |
| `FIRMS_MAP_KEY` | disabled | NASA FIRMS satellite fire detection |
| `RELIEFWEB_APPNAME` | `atlas` | Approved ReliefWeb appname |
| `LLM_PROVIDER` | disabled | `anthropic`, `openai`, `gemini`, `codex`, `openrouter`, `minimax`, `mistral`, `ollama`, `grok`, `groq`, `tarka` |
| `LLM_API_KEY` | — | API key (not needed for codex or ollama) |
| `LLM_MODEL` | per-provider default | Override model selection |
| `LLM_REASONING_EFFORT` | provider default | `low` / `medium` / `high` for reasoning models |
| `LLM_BASE_URL` | `https://tarka.rest/v1` | Override the Tarka API base URL |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama host |
| `NEXT_PUBLIC_SUPABASE_URL` | disabled | Community layer database |
| `SUPABASE_SECRET_KEY` | — | Supabase secret key (**not** the publishable one) |
| `MINIO_ENDPOINT` | disabled | Object store for uploaded photos |
| `MINIO_BUCKET` | `atlas` | Bucket name |
| `MINIO_PRESIGNED_EXPIRY_SECONDS` | `3600` | Presigned URL lifetime |
| `ATLAS_IP_SALT` | — | Salt for hashed uploader IPs |
| `ATLAS_MEDIA_SECRET` | — | Signs media proxy URLs |
| `FLOOD_ADMIN_TOKEN` | — | Bearer token for photo moderation |
| `YOUTUBE_API_KEY` | disabled | Enriches the flood desk video panel |
| `TELEGRAM_BOT_TOKEN` | disabled | For Telegram alerts + bot commands |
| `TELEGRAM_CHAT_ID` | — | Your Telegram chat ID |
| `TELEGRAM_CHANNELS` | — | Extra channel IDs to broadcast to (comma-separated) |
| `TELEGRAM_POLL_INTERVAL` | `5000` | Bot command polling interval (ms) |
| `DISCORD_BOT_TOKEN` | disabled | For Discord alerts + slash commands |
| `DISCORD_CHANNEL_ID` | — | Discord channel for alerts |
| `DISCORD_GUILD_ID` | — | Server ID (instant slash command registration) |
| `DISCORD_WEBHOOK_URL` | — | Webhook URL (alert-only fallback, no bot needed) |

Delta engine thresholds live in `atlas.config.mjs` under `delta.thresholds`. They are tuned for Nepal: any new earthquake or flood alert clears the bar on its own, while fire detection counts need a swing of a couple hundred before they mean anything.

Geographic coverage lives in `src/apis/utils/nepal.mjs` — the national bounding box, the widened seismic box that catches ruptures just across the border, the seven provinces, the ten monitored cities, and the keyword set used to filter text feeds down to Nepal.

---

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Hazard dashboard — simple view by default, detailed view on toggle |
| `GET /bhotekoshi-flood` | Public flood response page |
| `GET /api/data` | Current synthesized hazard data (JSON) |
| `GET /api/news` | Disaster-filtered news (JSON). Params: `topic`, `window` (`1h\|6h\|24h\|48h\|7d\|all`), `limit`, `sourceCap` |
| `GET /api/bipad` | NDRRMA BIPAD Portal telemetry |
| `GET /api/flood` | Flood content plus live BIPAD river gauges (JSON, 2-minute cache) |
| `GET /api/flood/insights?lang=` | Live news brief in any of ~130 languages (10-minute cache) |
| `GET /api/flood/digest?lang=&limit=` | Stored ten-minute digest timeline (`en` / `ne`; needs Supabase) |
| `GET /api/flood/situation` | Situation report and river gauge detail |
| `GET /api/flood/persons` | Searchable rescue register |
| `GET /api/flood/contacts` | District contacts and helplines |
| `GET /api/flood/donations` | Human-verified relief funds and bank details |
| `GET /api/flood/photos` | Crowdsourced ground photos (needs Supabase + MinIO) |
| `GET /api/flood/gallery` · `/videos` · `/press` | Media panels |
| `GET /api/flood/station-photo?id=` | HTTPS proxy for DHM gauge-station photos |
| `POST /api/flood/refresh` | Trigger a flood desk refresh (`FLOOD_REFRESH_TOKEN`) |
| `GET /events` | SSE stream for live push updates |

---

## Troubleshooting

### Dashboard shows empty panels after first start

Normal. The first sweep takes a few seconds; the dashboard populates once it completes and pushes over SSE. Check the terminal for sweep progress logs.

### Wrong Node version

Atlas requires Node.js 22 or later. Download the latest LTS from [nodejs.org](https://nodejs.org/).

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

The stored ten-minute digests need Supabase. Without it, `/api/flood/digest`
returns `enabled: false` with `reason: "database_not_configured"` and the panel
hides itself. The digest route is bilingual by design — the ~130-language brief
is the AI Insights panel, not this one.

### Photo uploads fail

Both Supabase **and** MinIO must be configured. Check `ATLAS_MEDIA_SECRET` and
`ATLAS_IP_SALT` are set, and that `npm run db:migrate` has been run.

### Telegram bot not responding to commands

Make sure both `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are set. The bot only responds to the configured chat ID. Verify your token with `curl https://api.telegram.org/bot<YOUR_TOKEN>/getMe`.

### Discord bot not responding to slash commands

1. Confirm `DISCORD_BOT_TOKEN` and `DISCORD_CHANNEL_ID` are set
2. Verify `discord.js` is installed: `npm ls discord.js`
3. If commands don't appear, set `DISCORD_GUILD_ID` — global commands can take up to an hour to propagate
4. Confirm the bot was invited with `bot` + `applications.commands` scopes and has `Send Messages` + `Embed Links`
5. Check logs for `[Discord] Bot logged in as ...`
6. For alerts only, use `DISCORD_WEBHOOK_URL` instead — no `discord.js` needed

---

## Contributing

Found a bug? Want to add a hazard source? PRs welcome. Each source is a standalone module in `src/apis/sources/` — export a `briefing()` function returning structured data and add it to the orchestrator in `src/apis/briefing.mjs`.

Run `npm run verify` before opening a PR; CI runs the same thing.

Source additions must be natural-hazard sources. Political, market, conflict and general-news feeds are out of scope for this build by design.

**Where help is most useful right now:**

- **Nepali and other native-language review.** Much of the UI copy and the flood content is marked `pending_native_review`. This is the highest-value contribution to the project and needs no JavaScript at all.
- **Language coverage testing.** If you speak one of the languages in `src/lib/nepal-languages.ts`, checking whether the brief actually reads correctly in it — and opening an issue when it doesn't — directly improves whether that language stays offered.
- **Relief-fund and helpline verification.** Every record in `content/` carries a source and a verification date. Stale ones matter.

Contributions are licensed under the AGPL-3.0. See [CONTRIBUTING.md](CONTRIBUTING.md) for scope rules and review expectations, [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community standards, and [SECURITY.md](SECURITY.md) for security reports or corrections to a relief fund or helpline.

## Contact

Ancoda Atlas is built and maintained by **Ancoda Labs**.

For partnerships, integrations, security reports, or corrections to a relief fund
or helpline: `research@ancodalabs.com`.

For bugs and feature requests, please use [GitHub Issues](https://github.com/ancodalabs/atlas/issues).

---

## Star History

<a href="https://www.star-history.com/?repos=ancodalabs%2Fatlas&type=date&legend=top-left">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/image?repos=ancodalabs/atlas&type=date&theme=dark&legend=top-left" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/image?repos=ancodalabs/atlas&type=date&legend=top-left" />
    <img alt="Star History Chart" src="https://api.star-history.com/image?repos=ancodalabs/atlas&type=date&legend=top-left" />
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
third-party attributions.     dashboard this is the single highest-value addition to this file.
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

Every geographic boundary, province and city lives in [`src/apis/utils/nepal.mjs`](src/apis/utils/nepal.mjs). Edit that file to adjust coverage; nothing else hardcodes geography.

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

```bash
# 1. Clone the repo
git clone https://github.com/ancodalabs/atlas.git
cd atlas

# 2. Install dependencies
npm install

# 3. Copy env template and add your API keys (see below)
cp .env.example .env

# 4. Start the dashboard
npm run dev
```

The dashboard runs at `http://localhost:3117` and begins its first hazard sweep immediately. The sweep queries all five sources in parallel and typically completes in under 10 seconds. After that it auto-refreshes every 15 minutes and pushes updates over SSE — no manual page refresh needed.

Run `npm run diag` if something fails to start; it checks your Node version, imports every local module individually, and verifies port availability.

**Requirements:** Node.js 22+ (uses native `fetch`, top-level `await`, ESM)

### Docker

Docker is the recommended way to run the production build. Docker Compose
loads configuration from `.env` and persists sweep data in the local `runs/`
directory.

```bash
# From the repository root:
cp .env.example .env
# Edit .env and add optional API keys, if available.
docker compose up --build -d
```

The dashboard is available at `http://localhost:3117`. The container exposes
the port configured by `PORT` in `.env` and persists `runs/latest.json`,
`runs/dashboard.json`, and sweep memory through the `./runs:/app/runs` volume.

```bash
# Follow application logs
docker compose logs -f atlas

# Check container health and status
docker compose ps

# Stop the service (keeps ./runs/)
docker compose down
```

To use another host port, set `PORT` in `.env` before starting Compose. The
same value is used inside and outside the container.

The image build installs all platform-specific optional dependencies required by
Next.js and skips local Git hooks, which are only configured on developer
machines by `npm install`.

---

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
`content/bhotekoshi-flood/` with its own source and verification date.

### Multilingual news briefs

Rasuwa is a trekking corridor and a labour-migration source district, so a large
share of the people refreshing the flood desk are reading from outside Nepal —
relatives abroad, embassies, responding agencies. And the communities downstream
of the Bhotekoshi are disproportionately Tamang, Tharu and Maithili speakers. A
relief notice someone cannot read is a notice that did not reach them.

The **AI Insights** panel therefore offers its brief in ~130 languages, listed in
[`src/lib/nepal-languages.ts`](src/lib/nepal-languages.ts) in two groups: Nepal's
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

The news panels do not wait for the 15-minute sweep. They poll `/api/news` on
their own 5-minute cadence. The aggregator fans out across Nepali dailies and
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

### Telegram Bot (Two-Way)

| Command | What It Does |
|---------|-------------|
| `/status` | System health, last sweep time, source status, LLM status |
| `/sweep` | Trigger a manual sweep cycle |
| `/brief` | Compact text summary of the latest hazard picture |
| `/alerts` | Recent alert history with tiers |
| `/mute` / `/mute 2h` | Silence alerts for 1h (or custom duration) |
| `/unmute` | Resume alerts |
| `/help` | Show all available commands |

Requires `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in `.env`.

### Discord Bot (Two-Way)

Mirrors the Telegram bot with Discord-native slash commands (`/status`, `/sweep`, `/brief`, `/alerts`, `/mute`, `/unmute`) and rich embed alerts colour-coded by tier: red for FLASH, yellow for PRIORITY, blue for ROUTINE.

**Webhook fallback:** set `DISCORD_WEBHOOK_URL` instead of a bot token for one-way alerts with zero extra dependencies.

**Optional dependency:** the full bot uses `discord.js`, which is installed
automatically by `npm install` and in the Docker image. Without it Atlas falls
back to webhook-only mode.

### Optional community layer (Supabase + MinIO)

Two features on the flood desk need somewhere to put state: **crowdsourced
photos** sent in from the corridor, and the **stored ten-minute news digests**
that show how an event developed rather than a wall of near-duplicate headlines.

Both are optional and each hides itself when its backing service is absent, so
Atlas still runs as a pure monitoring dashboard with neither configured. Supabase
holds the records, MinIO holds the image objects. Run `npm run db:migrate` to
apply the schema in `supabase/migrations/`.

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
4. Trim `src/lib/nepal-languages.ts` to the languages you can actually serve.
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
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → API keys, for browser-side reads |
| `MINIO_ENDPOINT` / `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | Your MinIO or S3-compatible object store |
| `MINIO_BUCKET` | Bucket for uploaded photos (default `atlas`) |
| `ATLAS_IP_SALT` | Random string. Salts hashed uploader IPs for rate limiting — set it, or the hashes are not worth much |
| `ATLAS_MEDIA_SECRET` | Signs media proxy URLs |
| `FLOOD_ADMIN_TOKEN` | Bearer token for the photo moderation endpoints |
| `FLOOD_REFRESH_TOKEN` | Bearer token to trigger `/api/flood/refresh` externally |
| `YOUTUBE_API_KEY` | *(Optional)* Enriches the flood desk's video panel |

### Telegram Bot + Alerts (optional)

| Key | How to Get |
|-----|------------|
| `TELEGRAM_BOT_TOKEN` | Create via [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_CHAT_ID` | Get via [@userinfobot](https://t.me/userinfobot) |
| `TELEGRAM_CHANNELS` | *(Optional)* Comma-separated extra channel IDs to broadcast to |
| `TELEGRAM_POLL_INTERVAL` | *(Optional)* Bot command polling interval in ms (default: 5000) |

### Discord Bot + Alerts (optional)

| Key | How to Get |
|-----|------------|
| `DISCORD_BOT_TOKEN` | [Discord Developer Portal](https://discord.com/developers/applications) → Bot → Token |
| `DISCORD_CHANNEL_ID` | Right-click channel (Developer Mode on) → Copy Channel ID |
| `DISCORD_GUILD_ID` | *(Optional)* Right-click server → Copy Server ID. Enables instant slash command registration |
| `DISCORD_WEBHOOK_URL` | *(Optional)* Channel Settings → Integrations → Webhooks. Alert-only mode without a bot |

**Discord bot setup:**
1. Create an application at the [Discord Developer Portal](https://discord.com/developers/applications)
2. **Bot** → **Reset Token** → copy to `DISCORD_BOT_TOKEN`
3. Under **Privileged Gateway Intents**, enable **Message Content Intent**
4. **OAuth2** → **URL Generator** → scopes `bot` + `applications.commands`, permissions `Send Messages` + `Embed Links`
5. Open the generated URL to invite the bot
6. `discord.js` is installed with the project dependencies.

### Without Any Keys

Atlas works with zero API keys. Three of the five hazard sources need no authentication, including seismic and weather — the two highest-consequence layers. FIRMS reports `no_key` and the wildfire panel says so; ReliefWeb falls back to hazard-filtered HDX datasets. The community photo layer and the stored digests hide themselves. Briefs are available in Nepali and English. The rest of the sweep continues normally.

---

## Architecture

```
atlas/
├── src/
│   ├── app/                   # Next.js App Router — routes and the views they render
│   │   ├── page.tsx           # SSR entry — hydrates DashboardClient
│   │   ├── layout.tsx
│   │   ├── DashboardClient.tsx    # View switch + the full monitoring terminal
│   │   ├── _components/       # Pieces used only by the dashboard route
│   │   ├── bhotekoshi-flood/  # Public flood response page
│   │   │   ├── BhotekoshiFloodView.tsx
│   │   │   ├── _components/   # Shared across the flood desk's own routes
│   │   │   └── <route>/       # rescue, donate, report, media, situation, contacts
│   │   ├── events/route.ts    # SSE stream for live push updates
│   │   └── api/
│   │       ├── data/route.ts  # Current synthesized hazard data (JSON)
│   │       ├── news/route.ts  # Disaster-filtered news, 4-minute server cache
│   │       ├── bipad/route.ts # NDRRMA BIPAD Portal telemetry
│   │       └── flood/         # Flood content, gauges, photos, digests, insights
│   │
│   ├── components/            # Reusable across routes — nothing route-specific
│   │   ├── ui/                # shadcn/ui primitives (Button, Command, Popover, …)
│   │   ├── FloodShell.tsx     # Chrome shared by every flood desk page
│   │   ├── NepalSignalsMap.tsx    # D3 province map, canvas-rendered
│   │   └── FloodDistrictMap.tsx   # Affected-district map with the flood path
│   │
│   ├── hooks/                 # use-atlas-theme, use-flood-lang
│   ├── types/                 # Shared domain types + .mjs module declarations
│   ├── styles/globals.css     # Tailwind entry, shadcn token map, Atlas design system
│   │
│   ├── apis/
│   │   ├── briefing.mjs       # Master orchestrator — runs all 5 sources in parallel
│   │   ├── save-briefing.mjs  # CLI: save timestamped + latest.json
│   │   ├── BRIEFING_PROMPT.md # Disaster briefing protocol
│   │   ├── BRIEFING_TEMPLATE.md   # Briefing output structure
│   │   ├── utils/
│   │   │   ├── fetch.mjs      # safeFetch() — timeout, retries, abort, auto-JSON
│   │   │   ├── nepal.mjs      # Geography: bbox, provinces, cities, seismic box
│   │   │   ├── flood-scope.mjs
│   │   │   └── env.mjs        # .env loader (no dotenv dependency)
│   │   └── sources/
│   │       ├── seismic.mjs    # USGS — each exports briefing() → structured data
│   │       ├── weather.mjs    # Open-Meteo, monsoon-aware thresholds
│   │       ├── firms.mjs      # NASA FIRMS satellite fire detection
│   │       ├── airquality.mjs # PM2.5, PM10 and US AQI across 10 cities
│   │       ├── reliefweb.mjs  # UN OCHA, HDX fallback
│   │       ├── bipad.mjs      # NDRRMA BIPAD Portal river gauges
│   │       ├── ndrrma*.mjs    # NDRRMA bulletins and notices
│   │       ├── rescue-portal.mjs  # OPMCM rescue register
│   │       ├── youtube.mjs    # Flood desk video panel
│   │       └── nepal-news.mjs # Hazard news aggregator behind /api/news
│   │
│   └── lib/
│       ├── utils.ts           # cn() — the shadcn class merger
│       ├── sweeper.ts         # Background sweep loop, SSE broadcast, alert dispatch
│       ├── flood-cron.ts      # The flood desk's own faster refresh cycle
│       ├── news-digest.mjs    # Extractive briefs + the translation layer
│       ├── news-digest-store.ts   # Stored ten-minute digests (Supabase)
│       ├── nepal-languages.ts # The ~130 languages briefs are offered in
│       ├── db.ts / storage.ts / supabase/   # Optional community layer
│       ├── llm/               # LLM abstraction (11 providers, raw fetch, no SDKs)
│       │   ├── provider.mjs   # Base class
│       │   ├── ideas.mjs      # LLM-powered hazard reads
│       │   └── index.mjs      # Factory: createLLMProvider()
│       ├── delta/
│       │   ├── engine.mjs     # Hazard delta computation, configurable thresholds
│       │   ├── memory.mjs     # Hot memory (3 runs, atomic writes) + cold archives
│       │   └── index.mjs      # Re-exports
│       └── alerts/
│           ├── telegram.mjs   # Multi-tier alerts + two-way bot commands
│           └── discord.mjs    # Slash commands, rich embeds, webhook fallback
│
├── content/
│   └── bhotekoshi-flood/      # Reviewed relief funds, helplines, figures
│
├── locales/                   # en, ne, fr UI strings
├── supabase/migrations/       # Community layer schema
├── test/                      # node:test suites (npm test)
│
├── scripts/
│   ├── diag.mjs               # Runtime and module diagnostics
│   ├── migrate.mjs            # Apply Supabase migrations
│   ├── check-no-any.mjs       # Fails the build on implicit `any`
│   └── synthesize.mjs         # CLI wrapper for dashboard synthesis
│
├── public/
│   ├── qr/                    # Government relief-fund payment QR codes
│   └── data/                  # Boundary GeoJSON (see NOTICE for attribution)
│
└── runs/                      # Runtime data (gitignored)
    ├── latest.json            # Most recent raw sweep output
    ├── dashboard.json         # Most recent synthesized payload (what the UI renders)
    └── memory/                # Delta memory (hot.json + cold/YYYY-MM-DD.json)
```

### Design Principles

- **Hazard-only** — if a signal is not a natural hazard, its impact, or the response to it, it does not belong in this build
- **Minimal dependencies** — Next.js and React at runtime. `discord.js` is optional. LLM providers use raw `fetch()`, no SDKs.
- **Parallel execution** — `Promise.allSettled()` fires all five sources simultaneously, each with its own timeout
- **Graceful degradation** — missing keys produce structured errors, not crashes. A source running on a fallback feed reports as degraded rather than healthy.
- **Each source is standalone** — run `node src/apis/sources/seismic.mjs` to test any source independently
- **Seasonality is context, not noise** — thresholds move with the monsoon and fire calendars
- **Provenance over polish** — every panel says where its text came from and whether a model touched it. A summary that reads well is indistinguishable from a summary that is right, and the reader cannot tell them apart from the page.

---

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
bulletins, notices) and the **OPMCM rescue portal**.

### Live hazard news aggregator

Separate from the sweep, `src/apis/sources/nepal-news.mjs` powers the `/api/news`
route and every news panel.

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

## npm Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `npm run dev` | `next dev` | Start the dashboard with auto-refresh |
| `npm run build` | `next build` | Production build |
| `npm start` | `next start` | Serve the production build |
| `npm test` | `node --test test/*.test.mjs` | Run the test suite |
| `npm run verify` | — | No-any check + tests + build. **Run this before opening a PR.** |
| `npm run check:no-any` | `node scripts/check-no-any.mjs` | Fail on implicit `any` |
| `npm run sweep` | `node src/apis/briefing.mjs` | Run a single sweep, output JSON to stdout |
| `npm run synthesize` | `node scripts/synthesize.mjs` | Synthesize `runs/latest.json` into dashboard shape |
| `npm run brief:save` | `node src/apis/save-briefing.mjs` | Run sweep + save timestamped JSON |
| `npm run db:migrate` | `node scripts/migrate.mjs` | Apply Supabase migrations |
| `npm run diag` | `node scripts/diag.mjs` | Run diagnostics (Node version, imports, port check) |
| `npm run clean` | `node scripts/clean.mjs` | Clear runtime data in `runs/` |
| `npm run fresh-start` | — | Clean, build, and start |

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3117` | Dashboard server port |
| `PUBLIC_URL` | — | Public base URL, for absolute links in alerts |
| `REFRESH_INTERVAL_MINUTES` | `15` | Sweep interval |
| `FLOOD_REFRESH_INTERVAL_MINUTES` | `10` | Flood desk refresh interval (minimum 2) |
| `FLOOD_REFRESH_TOKEN` | — | Bearer token for `POST /api/flood/refresh` |
| `FIRMS_MAP_KEY` | disabled | NASA FIRMS satellite fire detection |
| `RELIEFWEB_APPNAME` | `atlas` | Approved ReliefWeb appname |
| `LLM_PROVIDER` | disabled | `anthropic`, `openai`, `gemini`, `codex`, `openrouter`, `minimax`, `mistral`, `ollama`, `grok`, `groq`, `tarka` |
| `LLM_API_KEY` | — | API key (not needed for codex or ollama) |
| `LLM_MODEL` | per-provider default | Override model selection |
| `LLM_REASONING_EFFORT` | provider default | `low` / `medium` / `high` for reasoning models |
| `LLM_BASE_URL` | `https://tarka.rest/v1` | Override the Tarka API base URL |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama host |
| `NEXT_PUBLIC_SUPABASE_URL` | disabled | Community layer database |
| `SUPABASE_SECRET_KEY` | — | Supabase secret key (**not** the publishable one) |
| `MINIO_ENDPOINT` | disabled | Object store for uploaded photos |
| `MINIO_BUCKET` | `atlas` | Bucket name |
| `MINIO_PRESIGNED_EXPIRY_SECONDS` | `3600` | Presigned URL lifetime |
| `ATLAS_IP_SALT` | — | Salt for hashed uploader IPs |
| `ATLAS_MEDIA_SECRET` | — | Signs media proxy URLs |
| `FLOOD_ADMIN_TOKEN` | — | Bearer token for photo moderation |
| `YOUTUBE_API_KEY` | disabled | Enriches the flood desk video panel |
| `TELEGRAM_BOT_TOKEN` | disabled | For Telegram alerts + bot commands |
| `TELEGRAM_CHAT_ID` | — | Your Telegram chat ID |
| `TELEGRAM_CHANNELS` | — | Extra channel IDs to broadcast to (comma-separated) |
| `TELEGRAM_POLL_INTERVAL` | `5000` | Bot command polling interval (ms) |
| `DISCORD_BOT_TOKEN` | disabled | For Discord alerts + slash commands |
| `DISCORD_CHANNEL_ID` | — | Discord channel for alerts |
| `DISCORD_GUILD_ID` | — | Server ID (instant slash command registration) |
| `DISCORD_WEBHOOK_URL` | — | Webhook URL (alert-only fallback, no bot needed) |

Delta engine thresholds live in `atlas.config.mjs` under `delta.thresholds`. They are tuned for Nepal: any new earthquake or flood alert clears the bar on its own, while fire detection counts need a swing of a couple hundred before they mean anything.

Geographic coverage lives in `src/apis/utils/nepal.mjs` — the national bounding box, the widened seismic box that catches ruptures just across the border, the seven provinces, the ten monitored cities, and the keyword set used to filter text feeds down to Nepal.

---

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Hazard dashboard — simple view by default, detailed view on toggle |
| `GET /bhotekoshi-flood` | Public flood response page |
| `GET /api/data` | Current synthesized hazard data (JSON) |
| `GET /api/news` | Disaster-filtered news (JSON). Params: `topic`, `window` (`1h\|6h\|24h\|48h\|7d\|all`), `limit`, `sourceCap` |
| `GET /api/bipad` | NDRRMA BIPAD Portal telemetry |
| `GET /api/flood` | Flood content plus live BIPAD river gauges (JSON, 2-minute cache) |
| `GET /api/flood/insights?lang=` | Live news brief in any of ~130 languages (10-minute cache) |
| `GET /api/flood/digest?lang=&limit=` | Stored ten-minute digest timeline (`en` / `ne`; needs Supabase) |
| `GET /api/flood/situation` | Situation report and river gauge detail |
| `GET /api/flood/persons` | Searchable rescue register |
| `GET /api/flood/contacts` | District contacts and helplines |
| `GET /api/flood/donations` | Human-verified relief funds and bank details |
| `GET /api/flood/photos` | Crowdsourced ground photos (needs Supabase + MinIO) |
| `GET /api/flood/gallery` · `/videos` · `/press` | Media panels |
| `GET /api/flood/station-photo?id=` | HTTPS proxy for DHM gauge-station photos |
| `POST /api/flood/refresh` | Trigger a flood desk refresh (`FLOOD_REFRESH_TOKEN`) |
| `GET /events` | SSE stream for live push updates |

---

## Troubleshooting

### Dashboard shows empty panels after first start

Normal. The first sweep takes a few seconds; the dashboard populates once it completes and pushes over SSE. Check the terminal for sweep progress logs.

### Wrong Node version

Atlas requires Node.js 22 or later. Download the latest LTS from [nodejs.org](https://nodejs.org/).

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

The stored ten-minute digests need Supabase. Without it, `/api/flood/digest`
returns `enabled: false` with `reason: "database_not_configured"` and the panel
hides itself. The digest route is bilingual by design — the ~130-language brief
is the AI Insights panel, not this one.

### Photo uploads fail

Both Supabase **and** MinIO must be configured. Check `ATLAS_MEDIA_SECRET` and
`ATLAS_IP_SALT` are set, and that `npm run db:migrate` has been run.

### Telegram bot not responding to commands

Make sure both `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are set. The bot only responds to the configured chat ID. Verify your token with `curl https://api.telegram.org/bot<YOUR_TOKEN>/getMe`.

### Discord bot not responding to slash commands

1. Confirm `DISCORD_BOT_TOKEN` and `DISCORD_CHANNEL_ID` are set
2. Verify `discord.js` is installed: `npm ls discord.js`
3. If commands don't appear, set `DISCORD_GUILD_ID` — global commands can take up to an hour to propagate
4. Confirm the bot was invited with `bot` + `applications.commands` scopes and has `Send Messages` + `Embed Links`
5. Check logs for `[Discord] Bot logged in as ...`
6. For alerts only, use `DISCORD_WEBHOOK_URL` instead — no `discord.js` needed

---

## Contributing

Found a bug? Want to add a hazard source? PRs welcome. Each source is a standalone module in `src/apis/sources/` — export a `briefing()` function returning structured data and add it to the orchestrator in `src/apis/briefing.mjs`.

Run `npm run verify` before opening a PR; CI runs the same thing.

Source additions must be natural-hazard sources. Political, market, conflict and general-news feeds are out of scope for this build by design.

**Where help is most useful right now:**

- **Nepali and other native-language review.** Much of the UI copy and the flood content is marked `pending_native_review`. This is the highest-value contribution to the project and needs no JavaScript at all.
- **Language coverage testing.** If you speak one of the languages in `src/lib/nepal-languages.ts`, checking whether the brief actually reads correctly in it — and opening an issue when it doesn't — directly improves whether that language stays offered.
- **Relief-fund and helpline verification.** Every record in `content/` carries a source and a verification date. Stale ones matter.

Contributions are licensed under the AGPL-3.0. See [CONTRIBUTING.md](CONTRIBUTING.md) for scope rules and review expectations, [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community standards, and [SECURITY.md](SECURITY.md) for security reports or corrections to a relief fund or helpline.

## Contact

Ancoda Atlas is built and maintained by **Ancoda Labs**.

For partnerships, integrations, security reports, or corrections to a relief fund
or helpline: `research@ancodalabs.com`.

For bugs and feature requests, please use [GitHub Issues](https://github.com/ancodalabs/atlas/issues).

---

## Star History

<a href="https://www.star-history.com/?repos=ancodalabs%2Fatlas&type=date&legend=top-left">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/image?repos=ancodalabs/atlas&type=date&theme=dark&legend=top-left" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/image?repos=ancodalabs/atlas&type=date&legend=top-left" />
    <img alt="Star History Chart" src="https://api.star-history.com/image?repos=ancodalabs/atlas&type=date&legend=top-left" />
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
