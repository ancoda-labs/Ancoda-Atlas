// Turso (libSQL) connection for the flood desk's community layer.
//
// The database is optional on purpose. Atlas's hazard monitoring — sweeps,
// gauges, reviewed relief content — is all file- and API-backed and must keep
// working on a box with no database at all. Only the features that need to
// remember something between requests (ground-report photos, rescue
// corrections, news digests) depend on this module, and each one hides itself
// when the connection is unconfigured rather than failing the page around it.
//
// Why libSQL rather than Postgres: this desk deploys to Netlify, where
// functions are short-lived and a connection pool has nothing to pool. Turso
// speaks HTTP, so a cold function makes one request and exits, and the same
// code runs against a local `file:` database with no server to start.

import { createClient } from '@libsql/client';
import type { Client, InArgs } from '@libsql/client';
import { SCHEMA_STATEMENTS } from '@/lib/schema.mjs';
import { errorMessage } from '@/types';

interface AtlasDbGlobal {
  __atlasLibsql?: Client;
  __atlasSchemaReady?: Promise<void>;
}

// Next.js hot-reloads server modules in dev; without a global handle every edit
// would leak another client.
const g = globalThis as unknown as AtlasDbGlobal;

/**
 * The database URL.
 *
 * TURSO_DATABASE_URL is the deployed setting. DATABASE_URL is still read so an
 * existing environment keeps working, and both accept a `file:` URL, which is
 * how the test and local paths run without a network.
 */
function databaseUrl(): string | null {
  return process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || null;
}

export function isDbConfigured(): boolean {
  return Boolean(databaseUrl());
}

export function getClient(): Client | null {
  const url = databaseUrl();
  if (!url) return null;
  if (!g.__atlasLibsql) {
    g.__atlasLibsql = createClient({
      url,
      // Only remote Turso needs a token; a local file: URL must not be sent one.
      authToken: url.startsWith('file:') ? undefined : process.env.TURSO_AUTH_TOKEN,
    });
  }
  return g.__atlasLibsql;
}

/**
 * Apply the schema. Idempotent, and memoised per process so the dozens of
 * requests that arrive in the first second after a deploy share one round trip.
 */
export function ensureSchema(): Promise<void> {
  if (!g.__atlasSchemaReady) {
    g.__atlasSchemaReady = (async () => {
      const client = getClient();
      if (!client) return;
      // batch() rather than one multi-statement string: libSQL executes one
      // statement per call, and a batch is a single round trip either way.
      await client.batch(SCHEMA_STATEMENTS, 'write');
      console.log('[DB] Schema ready');
    })().catch(err => {
      // Clear the memo so the next request retries rather than inheriting a
      // permanent failure from one bad moment during startup.
      g.__atlasSchemaReady = undefined;
      throw err;
    });
  }
  return g.__atlasSchemaReady;
}

/** Run a query, applying the schema first if needed. */
export async function query<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const client = getClient();
  if (!client) throw new Error('TURSO_DATABASE_URL is not set');
  await ensureSchema();
  const result = await client.execute({ sql: text, args: params as InArgs });
  return result.rows as unknown as T[];
}

/**
 * Run several statements atomically.
 *
 * The callback receives a `query` of the same shape as the module-level one, so
 * a caller reads the same whether or not it is in a transaction.
 */
export async function transaction<T>(
  fn: (q: <R>(text: string, params?: unknown[]) => Promise<R[]>) => Promise<T>,
): Promise<T> {
  const client = getClient();
  if (!client) throw new Error('TURSO_DATABASE_URL is not set');
  await ensureSchema();
  const tx = await client.transaction('write');
  try {
    const out = await fn(async <R,>(text: string, params: unknown[] = []) => {
      const result = await tx.execute({ sql: text, args: params as InArgs });
      return result.rows as unknown as R[];
    });
    await tx.commit();
    return out;
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  } finally {
    tx.close();
  }
}

/** True when the database is reachable. Used by the desk's capability probe. */
export async function dbHealthy(): Promise<boolean> {
  if (!isDbConfigured()) return false;
  try {
    await query('SELECT 1');
    return true;
  } catch (err) {
    console.error('[DB] Health check failed:', errorMessage(err));
    return false;
  }
}
