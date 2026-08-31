// Supabase connection for the flood desk's community layer.
//
// The database is optional on purpose. Atlas's hazard monitoring — sweeps,
// gauges, reviewed relief content — is all file- and API-backed and must keep
// working on a box with no database at all. Only the features that need to
// remember something between requests (ground-report photos, rescue
// corrections, news digests) depend on this module, and each one hides itself
// when the connection is unconfigured rather than failing the page around it.
//
// Why Supabase over PostgREST rather than a Postgres socket: this desk deploys
// to Netlify, where functions are short-lived and a connection pool has nothing
// to pool. PostgREST speaks HTTP, so a cold function makes one request and
// exits. The cost is that DDL cannot run from here — the schema lives in
// supabase/migrations/ and is applied once, out of band, rather than lazily on
// first use. See scripts/migrate.mjs.

import { createClient } from '@supabase/supabase-js';
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { errorMessage } from '@/types';

interface AtlasDbGlobal {
  __atlasSupabase?: SupabaseClient;
}

// Next.js hot-reloads server modules in dev; without a global handle every edit
// would leak another client.
const g = globalThis as unknown as AtlasDbGlobal;

function projectUrl(): string | null {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || null;
}

/**
 * The secret (service-role) key.
 *
 * Never the publishable key: every table here has row-level security on with no
 * policies, so the browser-facing key can read and write none of it. This key
 * must stay server-side, which is why it carries no NEXT_PUBLIC_ prefix.
 * SUPABASE_SERVICE_ROLE_KEY is still read so a project on the older key naming
 * keeps working.
 */
function secretKey(): string | null {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

export function isDbConfigured(): boolean {
  return Boolean(projectUrl() && secretKey());
}

export function getDb(): SupabaseClient | null {
  const url = projectUrl();
  const key = secretKey();
  if (!url || !key) return null;
  if (!g.__atlasSupabase) {
    g.__atlasSupabase = createClient(url, key, {
      // A service client has no user session to keep. Left on, the SDK would
      // try to persist and refresh one from a storage that does not exist in a
      // serverless function.
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return g.__atlasSupabase;
}

/** The client, or a thrown error — for callers past their own configuration check. */
export function requireDb(): SupabaseClient {
  const db = getDb();
  if (!db) throw new Error('SUPABASE_SECRET_KEY / NEXT_PUBLIC_SUPABASE_URL are not set');
  return db;
}

/**
 * Turn a PostgREST `{ data, error }` pair into a value or a throw.
 *
 * PostgREST reports failures in the body rather than by rejecting, so without
 * this every call site would have to remember to look — and a missing table or
 * a violated constraint would read as an empty result instead of an error.
 */
export function unwrap<T>(result: { data: T | null; error: PostgrestError | null }): T {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error('query returned no data');
  return result.data;
}

/**
 * Normalise a Postgres timestamptz to ISO-8601 with a `Z`.
 *
 * PostgREST returns `2026-08-28T09:40:00+00:00`, while everything on the JS
 * side of the desk produces `Date.toISOString()`. Both are the same instant but
 * not the same string, so anything that compares or keys on a timestamp has to
 * put the two through here first.
 */
export function isoTimestamp(value: string): string;
export function isoTimestamp(value: string | null | undefined): string | null;
export function isoTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

/** True when the database is reachable. Used by the desk's capability probe. */
export async function dbHealthy(): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  try {
    // Counts a table the schema owns rather than pinging the project root: an
    // unapplied migration is a database this desk cannot use, and should read
    // as unhealthy rather than as configured-and-fine.
    const { error } = await db.from('flood_photos').select('id', { head: true, count: 'exact' });
    if (error) throw new Error(error.message);
    return true;
  } catch (err) {
    console.error('[DB] Health check failed:', errorMessage(err));
    return false;
  }
}
