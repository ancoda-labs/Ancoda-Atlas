# Climate context — reviewed source facts

Glacier, GLOF and ND-GAIN figures come from PDF reports Atlas cannot parse.
They live in `source-facts.json` and reach the page only from that file.

**Do not let a model rewrite these into stronger claims.** Edit the file.
Each fact is the statement as the source published it, plus who published it,
when, and a URL a reader can open.

## How to update

1. Open `source-facts.json`.
2. Change only a fact whose source still supports the wording. If the source
   does not say it, delete the fact rather than softening it in Atlas's voice.
3. Every fact must have:
   - `id` — stable slug
   - `statement_en` / `statement_ne` — the claim, no extra adjectives
   - `organisation` — the publisher, as they name themselves
   - `published` — ISO date (`YYYY-MM-DD`) or a year if that is all they give
   - `url` — a page or PDF a reader can open; the UI links it next to the line
4. `disclaimer_*` is the one-line guard so the section cannot be read as
   attributing a specific flood to climate change or to any country's
   emissions. Do not drop it.
5. `metrics` holds the English and Nepali **name** and **caption** for each
   framing (`cumulative_1750`, `cumulative_1850`, `annual_latest`,
   `per_capita`, `consumption`). `{year}` is filled from the fetch. The
   caption must describe that framing only — a stale caption under a switched
   chart is a factual error. `nepalScalePeers` is the fixed country list for
   "Compare at Nepal's scale"; `scale_caption_*` is announced when that
   control is on.
6. `statementNeedles` select ministry posts already ingested from
   nepal.gov.np (climate justice / Mountain Agenda; climate finance; Himalayan
   warming). They match on the post's own words. Atlas does not paraphrase
   those posts. Optional `title_en` / `body_en` on a needle are a reviewed
   translation used only when the government published no English — they are
   marked as Atlas translations on the page. Add a needle only when a new post
   should be picked up; never paste the government's wording into a fact.
7. `section` holds the dedicated `/climate` page headlines and captions
   (≤20 / ≤30 English words). `headline_ne` / `caption_ne` stay `TODO` until
   a human writes them. `ice.percent` and `lakes` counts must match the
   reviewed fact they point at via `factId`.
8. `panels.heat|water|air|fire` stay `"enabled": false` until a reviewed
   machine-readable source is wired. An empty panel is correct; a placeholder
   number is not.

Emissions figures are **not** in this file. They are fetched weekly from the
Our World in Data CO₂ dataset and stored under `runs/climate-context.json`.
BIPAD yearly totals live under `runs/climate-arrived.json`. If a fetch fails,
the last good file is served with its timestamp. Never type those numbers into
this JSON.

After editing, `POST /api/v1/flood/content/reload` (with `FLOOD_ADMIN_TOKEN`)
clears the in-process cache, or wait thirty seconds for the mtime watcher.
