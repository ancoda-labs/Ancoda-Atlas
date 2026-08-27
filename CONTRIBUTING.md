# Contributing to Ancoda Atlas

Ancoda Atlas is an open-source emergency disaster intelligence platform for
Nepal, stewarded by **Ancoda Labs**. Contributions are welcome from anyone.

Atlas moves quickly, but review bandwidth is limited. The easiest way to get a
change merged is to keep it small, well-scoped, and aligned with the project's
direction.

## Licensing of Contributions

Atlas is distributed under the **GNU Affero General Public License v3.0**
(see [LICENSE](LICENSE)). By opening a pull request you agree that your
contribution is licensed under the AGPL-3.0.

Two consequences worth understanding before you contribute:

- **Derivatives stay AGPL.** Anyone who modifies Atlas must release their
  changes under the AGPL-3.0 as well.
- **Network use counts as distribution.** If you run a modified Atlas as a
  public service, the AGPL requires you to offer your users the source of your
  modified version. This is deliberate — it keeps public-good disaster tooling
  in the open.

Do not paste in code, content, or data from a source whose licence you have not
checked. If you bring in third-party material, say so in the PR and add it to
[NOTICE](NOTICE) with its licence. Attribution-required data (for example the
MIT-licensed boundary files already listed there) must keep its attribution.

## Scope

Atlas covers **natural hazards in Nepal and nothing else**: earthquakes, floods,
landslides, glacial lake outburst floods, wildfire, hazardous air, extreme heat
and cold, avalanches, drought, and the humanitarian response to them.

Political, market, conflict, trade and general-news sources are out of scope by
design and will not be merged, however good the feed is. If a change widens the
scope beyond natural hazards, open an issue first — that is a roadmap decision,
not a source addition.

## What Contributions Are Most Helpful

- Focused bug fixes with a clear reproduction and validation path
- Documentation improvements that reduce setup friction
- Dashboard usability improvements with a small review surface
- New **natural-hazard** sources that add clear signal, degrade gracefully, and
  fit the existing architecture
- Nepali-language review — much of the UI copy and the flood content is marked
  `pending_native_review` and needs a native speaker

## Changes That Should Start With an Issue First

Open an issue before writing code if your change would:

- add a new external provider or paid API
- add a new feature family or dashboard surface
- change the project scope or roadmap
- change licensing, distribution, or deployment model
- introduce new dependencies

## Development Baseline

- Node.js 22+
- Pure ESM for the `apis/`, `lib/` and `dashboard/` modules; TypeScript in `app/`
  and `components/`
- Keep the near-zero-dependency approach unless there is a strong reason not to
- Do not commit secrets, `.env` files, or generated runtime data under `runs/`
- `npm run verify` must pass before committing. It rejects explicit TypeScript
  `any` types and runs the production build with type-checking enabled.
- `npm run diag` should load every module
- Install hooks automatically with `npm install`, or run `npm run prepare`

### Repository layout and commits

Application routes belong in `app/`, reusable UI in `components/`, shared
TypeScript domain types and server logic in `lib/`, source integrations in
`apis/`, operational scripts in `scripts/`, and tests in `test/`. Runtime data
belongs in the gitignored `runs/` directory.

Commit subjects must use the conventional format
`type(scope): subject` (the scope is optional), for example
`fix(flood): handle missing gauge data`. Allowed types are `feat`, `fix`,
`docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, and
`revert`.

## Adding a New Source

Each source should be a standalone module in `apis/sources/` and integrate
cleanly with `apis/briefing.mjs`.

A source should:

- export a `briefing()` function returning structured data
- run standalone: `node apis/sources/yoursource.mjs`
- handle upstream errors and rate limits cleanly
- return a structured error rather than throwing, so one bad feed does not break
  the sweep
- avoid breaking the full sweep if the source fails
- report `stale: true` when it is answering from a fallback rather than its
  primary feed, so source health tells the truth

Your PR should:

- explain why the source improves hazard signal quality, not just source count
- state which hazard type it covers and how it degrades when its upstream is down
- note any API key, rate limit, or paid tier it introduces

If your source also affects the dashboard, wire it through `lib/synthesize.mjs`
into the synthesized shape, and add its metrics to `lib/delta/engine.mjs` so
changes between sweeps are tracked.

## Content Changes

Anything under `content/` — relief funds, bank details, helplines, casualty
figures — is held to a higher bar than code, because people act on it with money
and with their safety.

- Every value needs a primary source recorded in the record itself
- Donation links are **curated, never scraped**: disaster fundraising scams peak
  in the first 48–72 hours, and an aggregator that auto-surfaces unverified
  fundraisers is worse than none at all
- Never add a donation route that is not the organisation's own page
- If figures conflict between sources, record both with their sources rather than
  picking one

Frontend changes are reviewed carefully because the dashboard renders content
from feeds we do not control.

## Pull Request Scope

Good:

- fix one bug
- add one source and its minimal wiring
- improve one panel

Avoid:

- add a source, redesign the dashboard, and change config behavior in the same PR

## Review Priorities

Reviewers weigh, in order:

- correctness of anything a person could act on
- security of externally sourced content rendering
- graceful degradation when a feed is down
- scope and long-term maintenance cost

Not every technically correct change will be merged. Scope and long-term
maintenance cost matter.

## Reporting Security or Content Problems

Do not open a public issue for a security vulnerability, a wrong account number,
or a dead helpline. See [SECURITY.md](SECURITY.md) — those go to
`research@ancodalabs.com`.
