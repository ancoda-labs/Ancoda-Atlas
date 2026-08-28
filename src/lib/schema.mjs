// Postgres schema for the community layer of the Rasuwa–Bhotekoshi flood desk.
//
// Kept as one idempotent script rather than a numbered migration chain: there
// are three tables, they are additive, and a disaster desk that fails to boot
// because a migration ledger drifted is worse than one that re-runs CREATE
// TABLE IF NOT EXISTS on every start. Applied by scripts/migrate.mjs and,
// lazily and once per process, by lib/db.ts.

export const SCHEMA_SQL = `
-- Ground reports: photos the public sends in from the flood corridor.
CREATE TABLE IF NOT EXISTS flood_photos (
  id             uuid PRIMARY KEY,
  object_key     text NOT NULL,
  content_type   text NOT NULL,
  bytes          integer NOT NULL,
  width          integer,
  height         integer,
  -- EXIF orientation is read before the metadata is stripped and kept here, so
  -- a portrait phone photo does not render on its side once the tags are gone.
  orientation    smallint NOT NULL DEFAULT 1,

  -- Where the photo is of. lat/lon may come from the file's own EXIF tags, from
  -- the browser's geolocation, or from the district the sender picked; which of
  -- those it was is recorded so the map can say how precise a pin really is.
  lat            double precision,
  lon            double precision,
  geo_source     text NOT NULL DEFAULT 'none',
  district       text,
  place_label    text,

  caption        text,
  contributor    text,

  -- Published on arrival (no pre-moderation), retired by report threshold or
  -- by an operator with the admin token.
  status         text NOT NULL DEFAULT 'published',
  removed_reason text,
  report_count   integer NOT NULL DEFAULT 0,

  -- Salted hash, never a raw address: enough to rate-limit a flood of uploads
  -- from one source without keeping a log of who sent what from where.
  ip_hash        text,
  taken_at       timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS flood_photos_feed_idx
  ON flood_photos (status, created_at DESC);
CREATE INDEX IF NOT EXISTS flood_photos_geo_idx
  ON flood_photos (status, lat, lon);
CREATE INDEX IF NOT EXISTS flood_photos_ratelimit_idx
  ON flood_photos (ip_hash, created_at DESC);

-- One row per person who flags a photo. Separate from the counter on the photo
-- so the same sender cannot drive a takedown alone.
CREATE TABLE IF NOT EXISTS flood_photo_reports (
  id          uuid PRIMARY KEY,
  photo_id    uuid NOT NULL REFERENCES flood_photos(id) ON DELETE CASCADE,
  reason      text,
  ip_hash     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (photo_id, ip_hash)
);

-- Corrections raised against the NDRRMA rescue register.
--
-- Atlas republishes that register verbatim and cannot edit the government's
-- copy. What it can do is record that someone says a row is wrong -- a
-- misspelled name, a person listed who is not safe, a person safe who is not
-- listed -- so the desk has something to take back to NDRRMA, and so a reader
-- who spots an error has somewhere to put it other than nowhere.
CREATE TABLE IF NOT EXISTS rescue_corrections (
  id          uuid PRIMARY KEY,
  person_id   integer,
  person_name text,
  kind        text NOT NULL,
  message     text NOT NULL,
  contact     text,
  ip_hash     text,
  status      text NOT NULL DEFAULT 'open',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rescue_corrections_open_idx
  ON rescue_corrections (status, created_at DESC);

-- Rolling ten-minute news digests, one row per (window, language).
CREATE TABLE IF NOT EXISTS news_digests (
  id            uuid PRIMARY KEY,
  topic         text NOT NULL DEFAULT 'flood',
  bucket_start  timestamptz NOT NULL,
  bucket_end    timestamptz NOT NULL,
  lang          text NOT NULL,
  headline      text NOT NULL,
  summary       text NOT NULL,
  bullets       jsonb NOT NULL DEFAULT '[]'::jsonb,
  sources       jsonb NOT NULL DEFAULT '[]'::jsonb,
  item_count    integer NOT NULL DEFAULT 0,
  -- 'llm' when a model wrote it, 'extractive' when Atlas fell back to ranking
  -- headlines itself. Shown in the UI: a reader should know which they have.
  generator     text NOT NULL DEFAULT 'extractive',
  model         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (topic, bucket_start, lang)
);

CREATE INDEX IF NOT EXISTS news_digests_recent_idx
  ON news_digests (topic, lang, bucket_start DESC);
`;
