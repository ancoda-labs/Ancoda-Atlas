// Ground-report photos — the domain layer between the route handlers and the
// database.
//
// Photos publish on arrival. That is a deliberate choice about a live event: a
// picture of a blocked road is worth most in the hour it is taken, and a review
// queue that nobody is staffing at 3am is not moderation, it is just delay.
// What stands in for pre-review is a set of narrow rails — format decided from
// magic bytes, all metadata stripped, uploads per sender capped, and any photo
// three separate people flag pulled automatically pending an operator's look.

import { randomUUID, createHmac } from 'crypto';
import { query } from './db';
import { presignedGetUrl, photoKey, remove as removeObject, upload } from './storage';
import { EXTENSION, readImageFacts, sniffType, stripMetadata } from './image';
import type { FloodPhoto, PhotoGeoSource } from './types';
import { errorMessage } from './types';

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
export const MAX_CAPTION_CHARS = 280;
export const MAX_CONTRIBUTOR_CHARS = 60;

/** Uploads allowed from one sender per window, before the desk stops taking them. */
export const UPLOAD_LIMIT = 8;
export const UPLOAD_LIMIT_WINDOW_MINUTES = 15;

/** Distinct flags that retire a photo automatically. */
export const REPORT_THRESHOLD = 3;

// Nepal's bounding box, near enough. A photo pinned outside it is not of this
// flood, and an unbounded coordinate would drag the whole map off-screen.
const NEPAL_BOUNDS = { minLat: 26.3, maxLat: 30.5, minLon: 80.0, maxLon: 88.3 };

export function withinNepal(lat: number, lon: number): boolean {
  return (
    lat >= NEPAL_BOUNDS.minLat && lat <= NEPAL_BOUNDS.maxLat &&
    lon >= NEPAL_BOUNDS.minLon && lon <= NEPAL_BOUNDS.maxLon
  );
}

interface PhotoRow {
  id: string;
  object_key: string;
  width: number | null;
  height: number | null;
  orientation: number;
  lat: string | number | null;
  lon: string | number | null;
  geo_source: string;
  district: string | null;
  place_label: string | null;
  caption: string | null;
  contributor: string | null;
  taken_at: Date | null;
  created_at: Date;
  report_count: number;
}

const GEO_SOURCES: PhotoGeoSource[] = ['exif', 'device', 'district', 'none'];

function asGeoSource(value: string): PhotoGeoSource {
  return GEO_SOURCES.includes(value as PhotoGeoSource) ? (value as PhotoGeoSource) : 'none';
}

/** pg returns double precision as a string on some driver paths; normalise both. */
function asNumber(value: string | number | null): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

async function toPhoto(row: PhotoRow): Promise<FloodPhoto> {
  return {
    id: row.id,
    url: await presignedGetUrl(row.object_key),
    width: row.width,
    height: row.height,
    orientation: row.orientation,
    lat: asNumber(row.lat),
    lon: asNumber(row.lon),
    geoSource: asGeoSource(row.geo_source),
    district: row.district,
    placeLabel: row.place_label,
    caption: row.caption,
    contributor: row.contributor,
    takenAt: row.taken_at ? row.taken_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    reportCount: row.report_count,
  };
}

const SELECT_COLUMNS = `id, object_key, width, height, orientation, lat, lon, geo_source,
                        district, place_label, caption, contributor, taken_at, created_at, report_count`;

export async function listPhotos(limit = 60): Promise<FloodPhoto[]> {
  const rows = await query<PhotoRow>(
    `SELECT ${SELECT_COLUMNS} FROM flood_photos
      WHERE status = 'published'
      ORDER BY created_at DESC
      LIMIT $1`,
    [Math.min(Math.max(limit, 1), 200)],
  );
  // Signing is one HMAC per row, no round trip, so the fan-out is cheap.
  return Promise.all(rows.map(toPhoto));
}

/** Hash a caller's address. Salted, truncated, and never stored in the clear. */
export function hashIp(ip: string): string {
  const salt = process.env.ATLAS_IP_SALT || '';
  if (!salt) {
    // Without a configured salt a per-process value still rate-limits within
    // one server lifetime, and leaves nothing that outlives a restart.
    process.env.ATLAS_IP_SALT = randomUUID();
  }
  return createHmac('sha256', process.env.ATLAS_IP_SALT || 'atlas').update(ip).digest('hex').slice(0, 32);
}

/** How many photos this sender has uploaded inside the rate-limit window. */
export async function recentUploadCount(ipHash: string): Promise<number> {
  const rows = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM flood_photos
      WHERE ip_hash = $1 AND created_at > now() - ($2 || ' minutes')::interval`,
    [ipHash, String(UPLOAD_LIMIT_WINDOW_MINUTES)],
  );
  return Number(rows[0]?.count || 0);
}

export interface CreatePhotoInput {
  bytes: Buffer;
  caption: string | null;
  contributor: string | null;
  district: string | null;
  placeLabel: string | null;
  /** Coordinates the browser offered, used only when the file carries none. */
  deviceLat: number | null;
  deviceLon: number | null;
  ipHash: string;
}

export type CreatePhotoResult =
  | { ok: true; photo: FloodPhoto }
  | { ok: false; status: number; error: string };

export async function createPhoto(input: CreatePhotoInput): Promise<CreatePhotoResult> {
  if (input.bytes.length === 0) return { ok: false, status: 400, error: 'empty_file' };
  if (input.bytes.length > MAX_UPLOAD_BYTES) return { ok: false, status: 413, error: 'file_too_large' };

  const type = sniffType(input.bytes);
  if (!type) return { ok: false, status: 415, error: 'unsupported_format' };

  const facts = readImageFacts(input.bytes, type);
  const clean = stripMetadata(input.bytes, type);

  // The file's own coordinates beat the browser's: EXIF is where the photo was
  // taken, geolocation is where the sender happens to be standing now.
  let lat: number | null = null;
  let lon: number | null = null;
  let geoSource: PhotoGeoSource = 'none';
  if (facts.lat != null && facts.lon != null && withinNepal(facts.lat, facts.lon)) {
    lat = facts.lat;
    lon = facts.lon;
    geoSource = 'exif';
  } else if (input.deviceLat != null && input.deviceLon != null && withinNepal(input.deviceLat, input.deviceLon)) {
    lat = input.deviceLat;
    lon = input.deviceLon;
    geoSource = 'device';
  } else if (input.district) {
    const centre = DISTRICT_CENTRES[input.district];
    if (centre) {
      lat = centre.lat;
      lon = centre.lon;
      geoSource = 'district';
    }
  }

  const id = randomUUID();
  const key = photoKey(id, EXTENSION[type]);

  try {
    await upload(key, clean, type);
  } catch (err) {
    console.error('[Photos] Upload to storage failed:', errorMessage(err));
    return { ok: false, status: 502, error: 'storage_unavailable' };
  }

  try {
    const rows = await query<PhotoRow>(
      `INSERT INTO flood_photos
         (id, object_key, content_type, bytes, width, height, orientation,
          lat, lon, geo_source, district, place_label, caption, contributor, ip_hash, taken_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING ${SELECT_COLUMNS}`,
      [
        id, key, type, clean.length, facts.width, facts.height, facts.orientation,
        lat, lon, geoSource, input.district, input.placeLabel,
        input.caption, input.contributor, input.ipHash, facts.takenAt,
      ],
    );
    const row = rows[0];
    if (!row) throw new Error('insert returned no row');
    return { ok: true, photo: await toPhoto(row) };
  } catch (err) {
    // Don't leave the bytes orphaned in the bucket if the row never landed.
    await removeObject(key);
    console.error('[Photos] Insert failed:', errorMessage(err));
    return { ok: false, status: 500, error: 'save_failed' };
  }
}

export interface ReportResult {
  counted: boolean;
  reportCount: number;
  removed: boolean;
}

/**
 * Flag a photo. One flag per sender per photo — the unique constraint on
 * (photo_id, ip_hash) means a single person cannot reach the threshold alone.
 */
export async function reportPhoto(id: string, reason: string | null, ipHash: string): Promise<ReportResult | null> {
  const inserted = await query<{ id: string }>(
    `INSERT INTO flood_photo_reports (id, photo_id, reason, ip_hash)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (photo_id, ip_hash) DO NOTHING
     RETURNING id`,
    [randomUUID(), id, reason, ipHash],
  );

  const counts = await query<{ report_count: number; status: string }>(
    `UPDATE flood_photos
        SET report_count = (SELECT COUNT(*) FROM flood_photo_reports WHERE photo_id = $1)
      WHERE id = $1
      RETURNING report_count, status`,
    [id],
  );
  const row = counts[0];
  if (!row) return null;

  let removed = row.status === 'removed';
  if (!removed && row.report_count >= REPORT_THRESHOLD) {
    await query(
      `UPDATE flood_photos SET status = 'removed', removed_reason = 'auto: report threshold'
        WHERE id = $1 AND status = 'published'`,
      [id],
    );
    removed = true;
    console.warn(`[Photos] Auto-retired ${id} after ${row.report_count} reports`);
  }

  return { counted: inserted.length > 0, reportCount: row.report_count, removed };
}

/**
 * Operator takedown. The row is retired and the object deleted, so a photo
 * pulled for showing a body or a personal bank QR is actually gone, not merely
 * hidden behind a status column.
 */
export async function removePhoto(id: string, reason: string): Promise<boolean> {
  const rows = await query<{ object_key: string }>(
    `UPDATE flood_photos SET status = 'removed', removed_reason = $2
      WHERE id = $1 AND status = 'published'
      RETURNING object_key`,
    [id, reason.slice(0, 200)],
  );
  const row = rows[0];
  if (!row) return false;
  await removeObject(row.object_key);
  return true;
}

/**
 * District centres, for photos that arrive with no coordinates at all. A pin
 * placed from this table is marked `district` in the feed so the map can draw
 * it as an approximate area rather than a point someone stood at.
 */
export const DISTRICT_CENTRES: Record<string, { lat: number; lon: number; ne: string }> = {
  Rasuwa:   { lat: 28.1167, lon: 85.3000, ne: 'रसुवा' },
  Nuwakot:  { lat: 27.9167, lon: 85.1667, ne: 'नुवाकोट' },
  Dhading:  { lat: 27.8667, lon: 84.9000, ne: 'धादिङ' },
  Gorkha:   { lat: 28.0000, lon: 84.6333, ne: 'गोरखा' },
  Chitwan:  { lat: 27.5833, lon: 84.5000, ne: 'चितवन' },
  Kathmandu:{ lat: 27.7172, lon: 85.3240, ne: 'काठमाडौँ' },
  Sindhupalchok: { lat: 27.9500, lon: 85.6833, ne: 'सिन्धुपाल्चोक' },
};
