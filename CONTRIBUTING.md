# Contributing to Ancoda Atlas

Thank you. Atlas is a public site people use in real emergencies in Nepal. You do not need to be a senior engineer. Careful, small help is more useful than a large rewrite.

Live site: [atlas.ancodalabs.com](https://atlas.ancodalabs.com). Licence: AGPL-3.0 (see below).

## If Atlas is wrong during an event — start here

This matters more than a typical bug. Use the path that matches the harm:

**Money, phone numbers, or “who to call”** — email **research@ancodalabs.com** with subject `[Atlas Funds]` or `[Atlas Helpline]`. Do **not** open a public issue (scammers watch those). Include the page URL, what is shown, and a link to the official source. Same-day when we can verify. Details: [SECURITY.md](SECURITY.md).

**Hazard picture is wrong** (river levels, earthquake list, fire map, news that is not a disaster, sitrep figures, map pins, a language brief that does not match the headlines) — open a GitHub issue with the **Data accuracy** template. Say which page, the time you looked (Nepal time if you know it), what you saw, and what it should have been. Screenshots help.

**Security hole** (XSS, open proxy, leaked keys) — email **research@ancodalabs.com** with `[Atlas Security]`. Do not file it in public.

## What you can do without much code

Highest value right now:

1. Native-language review (Nepali and others). Look for `pending_native_review` in `backend/content/`.
2. Check that a brief in *your* language still matches the listed headlines.
3. Re-check a relief fund or helpline against the organisation’s own page, and send a correction as above if it has gone stale.

## Run it on your machine

You need **Node.js 22** (see `.nvmrc`) and npm 10+.

```bash
git clone https://github.com/ancoda-labs/Ancoda-Atlas.git
cd Ancoda-Atlas
cp .env.example .env
npm install
make up
```

Open [http://localhost:3117](http://localhost:3117). Empty panels for a minute is normal — the first sweep is still running across five upstreams. If it never fills, `make diag` reports what is configured and `make logs` shows the worker.

You do **not** need API keys, Supabase, or MinIO for the main dashboard. NASA FIRMS and ReliefWeb are better with free keys; without them those panels degrade instead of crashing.

**GitHub Codespaces:** open the repo in Codespaces, then `make up` and use port 3117. Hosted Supabase stays optional; photo uploads need the Supabase secret key in Codespaces secrets and `make storage` for MinIO.

**Docker Compose** on your laptop is the production-shaped path (`docker compose up --build`). You must set `MINIO_ROOT_PASSWORD` in `.env` or Compose will refuse to start.

## Branch, commits, pull requests

Default branch is **`main`**. Do not commit on `main`.

Branch names (pick one prefix):

- `fix/short-description` — a bug
- `feat/short-description` — a new, in-scope capability
- `docs/short-description` — README, this file, comments
- `chore/short-description` — tooling, deps, chores

Commit subject format (git will reject others):

`type(scope): short description`

Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. Example: `fix(flood): handle missing gauge data`.

Before you push, both halves must pass. The pre-commit hook runs them: `ruff`, `mypy` and `pytest` against the backend in its container, then `npm run verify` (no `any` types, tests, production build) against the frontend. Then open a pull request against `main`. Keep the PR to **one** bug or **one** feature. Fill in the PR template. If you change `backend/content/` (funds, banks, helplines, figures), cite the primary source for every value.

Open an **issue first** if you want to add a paid API, a new dashboard surface, a new dependency, or anything that widens scope.

## Scope

Natural hazards in Nepal and the response to them. Political, market, conflict, and general-news feeds will not be merged.

Never invent or placeholder hazard numbers, alerts, helplines, or donation links. Never weaken photo-upload checks. Never commit `.env` or secrets.

## What AGPL means if you contribute

By opening a pull request you license your work under the **GNU Affero GPL v3.0** (`LICENSE`).

- Atlas stays AGPL. So do modifications.
- If you run a **changed** Atlas on the public internet, you must offer users the **source of that changed version**. That is the point of AGPL for a public-good disaster tool.

Do not paste code or data whose licence you have not checked. Third-party material must be listed in `NOTICE`. The map files under `public/data/` are MIT (openknowledgenp/localboundaries) — keep that credit.

More engineering detail — how to add a hazard source, the layout of `backend/app/` and `frontend/src/`, and the constraints that are not negotiable: see [AGENTS.md](AGENTS.md), which is the current architectural truth for this repository.

## Conduct

[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Maintainer: Ancoda Labs — `research@ancodalabs.com`.
