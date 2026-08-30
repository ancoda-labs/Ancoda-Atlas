<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Ancoda Atlas — agent notes

Keep this Next.js marker block at the top. The rest of the file is project truth derived from this repo, not from training data.

## What this is

**Ancoda Atlas** is an open-source natural-hazard and disaster intelligence platform for Nepal, stewarded by **Ancoda Labs**. Live site: [atlas.ancodalabs.com](https://atlas.ancodalabs.com).

It aggregates Nepal-scoped hazard feeds onto a dashboard, with a public flood-response desk at `/bhotekoshi-flood`. It is a **monitoring aid, not a warning system**. Confirm findings against DHM, NDRRMA/BIPAD, or the National Seismological Centre before anyone acts.

**Scope is natural hazards and humanitarian response only:** earthquakes, floods, landslides, GLOF, wildfire, hazardous air, extreme heat/cold, avalanches, drought, and declared relief. Out of scope: politics, elections, conflict, markets, finance, diplomacy, aviation tracking, general news. India and China appear only via cross-boundary hazards.

Package: `ancoda-atlas` **4.0.0**. Contact: `research@ancodalabs.com`.

## License

**AGPL-3.0-only** (`LICENSE`, `package.json`). Copyright (c) 2026 Ancoda Labs.

There are **no SPDX or copyright headers** in source files. Provenance and third-party data live in `NOTICE`. Boundary GeoJSON under `public/data/` is derived from openknowledgenp/localboundaries (**MIT**) — keep that attribution. Payment QR codes under `public/qr/` are Government of Nepal artefacts, not Ancoda property.

Running a modified Atlas as a network service requires offering users the source of that modified version.

**New dependencies must be license-compatible** (MIT/BSD/Apache/ISC/AGPL-compatible). Do not add proprietary, source-available-but-not-OSI, or AGPL-incompatible packages. If you vendor data or code, add it to `NOTICE` in the same PR.

## Stack and versions

| Piece | What is actually used |
|---|---|
| Runtime | **Node.js >= 22**, npm >= 10 (`.nvmrc` is `22`) |
| App | **Next.js 16** (App Router only — no `pages/`), **React 19**, `next.config.mjs` |
| Language | TypeScript `strict` + `noImplicitAny` for `src/app`, `src/components`, `src/lib/*.ts`. Hazard sources and much of `src/lib` / `src/apis` are **ESM `.mjs`**. `allowJs` is false; `.mjs` is typed via `src/types/atlas-modules.d.ts`. |
| UI | Tailwind CSS **v4** (`@tailwindcss/postcss`), shadcn/ui + Radix, `geist`, `lucide-react`, `clsx` / `tailwind-merge` / CVA. Tokens in `src/styles/globals.css`. |
| Optional DB | **Hosted Supabase** over PostgREST (`@supabase/supabase-js`). Not a Compose service. |
| Optional object store | **MinIO** (`minio` npm client). Compose sidecar for local photos. |
| Optional LLM | Raw `fetch()` providers in `src/lib/llm/` — no vendor SDKs. |
| Optional Discord | `discord.js` is an **optionalDependency**. |
| Tests | Node’s built-in test runner: `node --experimental-strip-types --test test/*.test.mjs` |
| Lint/format | **None.** No ESLint, Prettier, or Biome. `npm run check:no-any` bans explicit `any`. `next build` is the typecheck. |
| Hooks | `npm install` sets `core.hooksPath` to `.githooks/`. `commit-msg` enforces `type(scope): subject`. `pre-commit` runs **`npm run verify`** (no-any + tests + production build). |

Default dashboard port is **3117** (`PORT`, `atlas.config.mjs`). `next.config.mjs` sets `reactStrictMode: true` and `serverExternalPackages: ['discord.js', 'pg', 'minio']` — `pg` is listed but **not a dependency**.

## Directory map

| Path | Purpose |
|---|---|
| `src/app/` | App Router: `/` dashboard, `/bhotekoshi-flood/*` desk, `/events` SSE, `/api/*` |
| `src/app/_components/` | Dashboard-route-only UI |
| `src/app/bhotekoshi-flood/_components/` | Flood-desk-shared UI |
| `src/components/` | Cross-route UI (`FloodShell`, maps). `ui/` = shadcn primitives |
| `src/hooks/` | `use-atlas-theme`, `use-flood-lang`, `use-desk-refresh` |
| `src/types/` | Shared domain types + `.mjs` declarations |
| `src/styles/` | Global CSS / design tokens |
| `src/apis/` | Sweep orchestrator + standalone hazard source modules |
| `src/apis/sources/` | One file per feed; each exports `briefing()` |
| `src/apis/utils/` | `safeFetch`, Nepal geography, flood scope, `.env` loader |
| `src/lib/` | Sweeper, flood cron, synthesize, photos, storage, LLM, alerts |
| `src/lib/supabase/` | Unused shadcn/Supabase client stubs (no `middleware.ts` at app root) |
| `src/instrumentation.ts` | Starts sweeper + flood cron on Node runtime |
| `content/bhotekoshi-flood/` | Human-reviewed funds, helplines, sitrep JSON |
| `locales/` | `en` / `ne` / `fr` UI strings (`src/lib/i18n.mjs`) |
| `supabase/migrations/` | Community-layer SQL (applied in Supabase, not by the app) |
| `scripts/` | diag, synthesize, clean, migrate-check, no-any, git hooks |
| `test/` | `node:test` suites (mostly LLM; plus image + news-media) |
| `public/data/` | Province/district GeoJSON |
| `public/qr/` | Government relief-fund QR images |
| `runs/` | **Gitignored** runtime: `latest.json`, `dashboard.json`, `memory/`, `flood-desk.json` |
| `atlas.config.mjs` | Env-backed config (port, intervals, LLM, telegram, discord) |
| `.githooks/` | commit-msg + pre-commit |
| `.github/` | PR template, issue templates, CODEOWNERS, docker-publish workflow |
| `.devcontainer/` | Codespaces / VS Code compose (Node 22 + MinIO) |

Geography is centralized in `src/apis/utils/nepal.mjs`. Do not scatter bounding boxes.

## How to run locally

```bash
cp .env.example .env   # keys optional; see below
npm install            # Node 22+, configures git hooks
npm run dev            # http://localhost:3117  (PORT from .env)
```

`npm run diag` checks Node, imports, and port. First paint may be an empty skeleton until the first sweep writes `runs/` and SSE pushes.

**Docker (production-shaped, not the edit loop):**

```bash
cp .env.example .env
# MINIO_ROOT_PASSWORD is required by docker-compose.yml (it uses :? interpolation)
docker compose up --build -d
```

Compose always starts **MinIO** and `atlas` `depends_on` it, even though the app itself can run without storage. Volume `./runs:/app/runs`. Image is `node:22-alpine`, `npm ci --ignore-scripts`, `next start -p ${PORT:-3117}`.

**Supabase is never local.** Same hosted project as production. Apply `supabase/migrations/0001_flood_desk.sql` with `supabase db push` or the SQL editor. `npm run db:migrate` **does not apply DDL** — it only checks that tables/RPCs are reachable.

### Environment

Copy `.env.example`. **Do not put comments on the same line as values** (Docker `env_file` treats them as part of the value). All keys are optional for a working hazard dashboard.

| Group | Vars | If absent |
|---|---|---|
| Always useful | `PORT=3117`, `REFRESH_INTERVAL_MINUTES`, `FLOOD_REFRESH_INTERVAL_MINUTES` (min 2) | Defaults in `atlas.config.mjs` |
| Hazard keys | `FIRMS_MAP_KEY`, `RELIEFWEB_APPNAME` | FIRMS `no_key` / empty wildfire; ReliefWeb degrades to HDX |
| Media proxy | `ATLAS_MEDIA_SECRET` | Random per process — **broken images after restart and across replicas** |
| Flood admin | `FLOOD_REFRESH_TOKEN`, `FLOOD_ADMIN_TOKEN`, `ATLAS_IP_SALT` | Refresh POST and photo DELETE return **404** if tokens empty; IP salt randomizes per process |
| YouTube | `YOUTUBE_API_KEY` | Known channel IDs still work |
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (alias `SUPABASE_SERVICE_ROLE_KEY`) | Photos, digest store, rescue corrections hide (`database_not_configured`) |
| MinIO | `MINIO_ENDPOINT`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `MINIO_PUBLIC_ENDPOINT`, `MINIO_SECURE`, `MINIO_BUCKET` | Photos hide (`storage_not_configured`). News images are **never** stored here |
| LLM | `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, … | Rule-based hazard engine; briefs only Nepali + English |
| Alerts | Telegram / Discord vars | Alerts off; Discord falls back to webhook if no `discord.js` |

Use the **secret** Supabase key server-side. Tables have RLS on with no policies; the publishable key cannot read them.

## `runs/` read and write

Created by the sweeper if the disk is writable.

| File | Writer | Readers |
|---|---|---|
| `runs/latest.json` | Sweeper after `fullBriefing()`; CLI `brief:save` | `scripts/synthesize.mjs`, LLM/CLI |
| `runs/dashboard.json` | Sweeper after synthesize + ideas | SSR `src/app/page.tsx`, sweeper cold start |
| `runs/memory/` | `src/lib/delta/memory.mjs` (hot + cold archives) | Delta engine |
| `runs/flood-desk.json` | `src/lib/flood-cron.ts` | Flood desk APIs (versioned store; mismatch is discarded, not migrated) |

`npm run clean` deletes these. Do not commit `runs/`.

## Supabase and MinIO when absent

`isDbConfigured()` needs URL + secret key. `isStorageConfigured()` needs endpoint + user + password.

Photo GET returns `{ enabled: false, photos: [], reason }`. Digest GET returns `{ enabled: false, reason: "database_not_configured" }`. POST upload returns 503. The rest of Atlas (sweeps, gauges, curated `content/`) continues.

Photos need **both** services. MinIO holds only public ground-report bytes (`flood-photos/{date}/{id}.{ext}`), short-lived presigned URLs. News/thumbs go through `src/lib/news-media.ts` at request time.

## Code conventions (from the tree)

- **App Router.** Route `page.tsx` is a thin server wrapper; views are `*View.tsx` / `DashboardClient.tsx`. Route-private components live in `_components/`. `'use client'` only where state/hooks need it.
- **Imports:** `@/` → `src/`, `@/atlas.config.mjs` for config.
- **Naming:** PascalCase React components; kebab-case hooks (`use-flood-lang.ts`); source files `seismic.mjs`, `flood-photos.ts`.
- **Data fetching:** Server Route Handlers under `src/app/api/`. Many are `force-dynamic` with `cacheFor` / `noStore` from `src/lib/http-cache.ts`. Dashboard live updates via SSE `/events`. News is independent of the 15-minute sweep (`/api/news`).
- **Sources:** `Promise.allSettled`, structured errors, `stale: true` on fallback feeds. Runnable alone: `node src/apis/sources/seismic.mjs`.
- **Quotes:** mixed. shadcn `ui/` uses double quotes; most app code uses single.
- **Types:** no explicit `any`. Prefer existing types in `src/types/index.ts`.
- **Commits:** `feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert(scope): subject` (subject ≤ 72 chars after type).
- **PRs:** default branch is **`main`**. Do not commit on `main`. CODEOWNERS: `@ancoda-labs`; `content/`, `LICENSE`, `NOTICE`, `CONTRIBUTING.md`, `SECURITY.md` need maintainer review.

## Constraints (non-negotiable)

1. **Live public-safety tool.** Never fabricate, placeholder, or mock hazard readings, alerts, helpline numbers, casualty figures, or donation links in UI or `content/`. Empty/degraded is correct; invented numbers are not. LLM may **translate** listed headlines, not compose a disaster brief. Do not invent funds.
2. **Do not weaken crowdsourced upload rails** in `src/app/api/flood/photos/route.ts` and `src/lib/flood-photos.ts` / `src/lib/image.ts`: size cap, `safetyAcknowledged`, magic-byte type sniff, EXIF strip, Nepal bounds, rate limit, report threshold. Photos **publish on arrival** by design — those rails are the review.
3. **No secrets.** Never commit `.env` or keys. `.gitignore` already excludes `.env` and `runs/`.
4. **No commits on `main`.** Branch and open a PR. Run `npm run verify` before the PR (`pre-commit` already does).
5. **Hazard-only sources.** New feeds go through `src/apis/briefing.mjs` and `src/lib/synthesize.mjs` plus delta metrics if they affect the dashboard.
6. **`content/` is higher bar than code.** Every fund/helpline/figure needs a primary source on the record. Donation routes are curated, never scraped.

## Known gaps (blunt)

- **`README.md` is duplicated** — the document restarts around the screenshots TODO (~line 845). Trust the first half, then stop.
- **CI badge points at `ci.yml`, which does not exist.** The only workflow is `.github/workflows/docker-publish.yml`, and it still triggers on **`master`**, while `origin/HEAD` is **`main`**. `CONTRIBUTING.md` previously claimed CI runs `verify`; it does not.
- **`npm run db:migrate` does not migrate.** Name vs behaviour will waste a deploy.
- **Compose is not optional-MinIO.** `MINIO_ROOT_PASSWORD` is mandatory interpolation; `atlas` waits on MinIO health even if you only wanted the dashboard.
- **Stale deploy story.** README still argues `@napi-rs/canvas` / Netlify / edge in places; `package.json` has no canvas. `src/lib/db.ts` talks about Netlify functions; `src/lib/http-cache.ts` talks about Cloudflare Workers. Architecture elsewhere says a long-lived Node process + writable `runs/` is required.
- **Metadata lie:** root layout title still says “19 Sources”.
- **`src/lib/supabase/{client,server,middleware}.ts` are unused** shadcn leftovers. Do not wire browser Supabase into flood tables (RLS would hide them anyway).
- **Test coverage is thin** outside LLM provider wrappers and `flood-image` / `news-media`. No sweep/API/UI tests. Integration LLM tests will fail without keys.
- **No formatter/linter**, so style is inconsistent by file.
- **Production secrets:** unset `ATLAS_MEDIA_SECRET` / `ATLAS_IP_SALT` / `FLOOD_ADMIN_TOKEN` are foot-guns (proxy signatures, rate-limit salt, no photo takedown except DB).
- **Photos are public on upload.** Three reports auto-unpublish; without `FLOOD_ADMIN_TOKEN` DELETE is 404.
- **Insights translation cache is in-process** — multi-replica multiplies LLM rate limits.
- **`.gitignore` still mentions dead paths** (`apis/.env`, `dashboard/public/vercel.json`) and used to ignore `AGENTS.md` (this file must stay tracked so `next dev` does not fight the working tree).
