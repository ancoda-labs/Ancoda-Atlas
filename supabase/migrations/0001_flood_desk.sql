-- Community layer for the Rasuwa–Bhotekoshi flood desk.
--
-- Kept as one idempotent script rather than a numbered migration chain: there
-- are four tables, they are additive, and a disaster desk whose tables are
-- missing because a migration ledger drifted is worse than one that re-runs
-- CREATE TABLE IF NOT EXISTS.
--
-- Atlas reaches Supabase over PostgREST, which cannot execute DDL, so unlike
-- the previous drivers the app can no longer apply this lazily on first use.
-- Apply it once per project, either with the Supabase CLI
--
--   supabase db push
--
-- or by pasting this file into the SQL editor. `npm run db:migrate` does not
-- apply it; it checks whether it has been applied and prints what is missing.

-- Ground reports: photos the public sends in from the flood corridor.
CREATE TABLE IF NOT EXISTS public.flood_photos (
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
  ON public.flood_photos (status, created_at DESC);
CREATE INDEX IF NOT EXISTS flood_photos_geo_idx
  ON public.flood_photos (status, lat, lon);
CREATE INDEX IF NOT EXISTS flood_photos_ratelimit_idx
  ON public.flood_photos (ip_hash, created_at DESC);

-- One row per person who flags a photo. Separate from the counter on the photo
-- so the same sender cannot drive a takedown alone.
CREATE TABLE IF NOT EXISTS public.flood_photo_reports (
  id          uuid PRIMARY KEY,
  photo_id    uuid NOT NULL REFERENCES public.flood_photos(id) ON DELETE CASCADE,
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
CREATE TABLE IF NOT EXISTS public.rescue_corrections (
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
  ON public.rescue_corrections (status, created_at DESC);

-- Rolling ten-minute news digests, one row per (window, language).
CREATE TABLE IF NOT EXISTS public.news_digests (
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
  ON public.news_digests (topic, lang, bucket_start DESC);

-- Recount a photo's flags and retire it once enough separate people have
-- raised one.
--
-- This is a function rather than a statement in the app because PostgREST has
-- no way to express `SET report_count = (SELECT count(*) ...) RETURNING`, and
-- doing it as read-then-write from a serverless function would let two
-- concurrent flags each read the same stale count. The threshold is passed in
-- rather than hardcoded so it stays a single constant in lib/flood-photos.ts.
CREATE OR REPLACE FUNCTION public.flood_photo_recount(p_photo_id uuid, p_threshold integer)
RETURNS TABLE (report_count integer, status text, retired boolean)
LANGUAGE sql
AS $$
  WITH tally AS (
    SELECT count(*)::integer AS n
      FROM public.flood_photo_reports r
     WHERE r.photo_id = p_photo_id
  ),
  -- The row as it stood before this statement. Both CTEs and the UPDATE read
  -- the same snapshot, so this is the pre-image even though it selects from the
  -- table being written. It exists so `retired` can say whether THIS call
  -- crossed the threshold, rather than merely that the photo is gone -- the
  -- difference between one warning in the log and one per flag forever after.
  before AS (
    SELECT f.status FROM public.flood_photos f WHERE f.id = p_photo_id
  )
  UPDATE public.flood_photos p
     SET report_count = tally.n,
         status = CASE
                    WHEN p.status = 'published' AND tally.n >= p_threshold THEN 'removed'
                    ELSE p.status
                  END,
         removed_reason = CASE
                    WHEN p.status = 'published' AND tally.n >= p_threshold
                      THEN 'auto: report threshold'
                    ELSE p.removed_reason
                  END
    FROM tally, before
   WHERE p.id = p_photo_id
   RETURNING p.report_count, p.status, (before.status = 'published' AND p.status = 'removed');
$$;

-- Every one of these tables is written by the desk itself with the secret key,
-- which bypasses row-level security. Turning RLS on with no policies attached
-- means the publishable key -- the one shipped to browsers -- reads and writes
-- nothing here, so a leaked ground-report row or an unlisted rescue correction
-- cannot be pulled straight out of the API.
ALTER TABLE public.flood_photos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flood_photo_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rescue_corrections  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news_digests        ENABLE ROW LEVEL SECURITY;

REVOKE EXECUTE ON FUNCTION public.flood_photo_recount(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.flood_photo_recount(uuid, integer) TO service_role;
