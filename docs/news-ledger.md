# The news ledger

> Issue [#37](https://github.com/ancoda-labs/Ancoda-Atlas/issues/37) — a table of every news update Atlas shows, so sentiment can be scored against it.

The panels are a moving window. A story sits on the dashboard for a day and
then falls off the end of a feed, and until now nothing wrote down that it had
been there. The ledger is that record: **one row per item, the first time Atlas
shows it, appended and never rewritten.**

## What it holds

| Column | |
|---|---|
| `id` | Stable 12-character handle, derived from the link. **Score against this.** |
| `title` | As filed. Nothing is translated, trimmed or rewritten |
| `source` | The outlet, or the publishing ministry |
| `feed` | `wire` (an outlet reported it) or `government` (a ministry posted it) |
| `topic` | `flood`, `earthquake`, `weather`, `wildfire`, `airquality`, `climate`, `relief` |
| `publishedAt` | When the outlet or ministry published it |
| `firstSeenAt` | When Atlas first put the item on a page |
| `link` | The original |
| `language` | `ne` or `en`, from the script the title is written in |
| `district` | The corridor district, for government posts about the Bhotekoshi |

`wire` and `government` rows are deliberately distinguishable. An outlet's
report and a ministry's own statement are different kinds of claim, and a
sentiment score over the two mixed together would not mean anything.

## Where it lives

A growing CSV on disk: `runs/news-ledger.csv`. The **worker** appends a row
the first time a headline is put on a page — at the end of every flood refresh
(10 minutes) and every national sweep (15 minutes). The API never writes it;
it only serves the file.

Download it from the site (Live hazard feed, or Coverage) or over HTTP:

```
GET /api/v1/news/ledger.csv
```

Locally that is `http://localhost:8000/api/v1/news/ledger.csv`. Each new
headline is appended, never rewritten. Nothing prunes the file — that is the
point of a record. Roughly 200 bytes a row and a few hundred rows a day.

## Optional: pull it into Google Sheets

The sheet is [News Data](https://docs.google.com/spreadsheets/d/1vjfxH1iCnaWxynNE25cR3cPw-TSo5-ygkVldvr6YKgE/edit).
Atlas does **not** push to it. In cell **A1**:

```
=IMPORTDATA("https://atlas-api.ancodalabs.com/api/v1/news/ledger.csv")
```

Google fetches that URL about hourly. The first time, click **Allow access**
on the yellow banner. A `localhost` URL will not work from Google's servers.

`IMPORTDATA` owns every cell in its range, so **do not add a sentiment column
to that tab.** Score on a second tab, keyed by `id`:

| A (`id`) | B (`sentiment`) | C (`title`, looked up) |
|---|---|---|
| `49c07f7ebbb9` | `-2` | `=IFERROR(VLOOKUP($A2, Sheet1!$A:$J, 2, FALSE), "")` |

## What it is not

It records **that** Atlas showed an item and what the item said. It does not
score, rank, or interpret anything, and it holds no figure that is not in the
title as published. Sentiment is a human judgement made in the sheet, against
`id` — Atlas does not compute one.
