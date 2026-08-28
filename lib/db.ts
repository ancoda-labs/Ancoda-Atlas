// Postgres connection for the flood desk's community layer.
//
// The database is optional on purpose. Atlas's hazard monitoring — sweeps,
// gauges, reviewed relief content — is all file- and API-backed and must keep
// working on a box with no Postgres. Only the two features that need to
// remember something between requests (ground-report photos, news digests)
// depend on this module, and each one hides itself when DATABASE_URL is unset
// rather than failing the page around it.

import { Pool } from 'pg';
import type { PoolClient, QueryResultRow } from 'pg';
import { SCHEMA_SQL } from '@/lib/schema.mjs';
import { errorMessage } from './types';

interface AtlasDbGlobal {
  __atlasPgPool?: Pool;
  __atlasSchemaReady?: Promise<void>;
}

// Next.js hot-reloads server modules in dev; without a global handle every
// edit would leak another pool of idle connections.
const g = globalThis as unknown as AtlasDbGlobal;

export function isDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getPool(): Pool | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!g.__atlasPgPool) {
    g.__atlasPgPool = new Pool({
      connectionString: url,
      max: Number(process.env.DATABASE_POOL_MAX) || 8,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 8_000,
      // Managed Postgres commonly presents a certificate the container has no
      // root for. Opt in explicitly rather than defaulting to no verification.
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    });
    g.__atlasPgPool.on('error', (err: Error) => {
      console.error('[DB] Idle client error:', err.message);
    });
  }
  return g.__atlasPgPool;
}

/**
 * Apply the schema. Idempotent, and memoised per process so the dozens of
 * requests that arrive in the first second after a deploy share one round trip.
 */
export function ensureSchema(): Promise<void> {
  if (!g.__atlasSchemaReady) {
    g.__atlasSchemaReady = (async () => {
      const pool = getPool();
      if (!pool) return;
      await pool.query(SCHEMA_SQL);
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

/** Run a query against the pool, applying the schema first if needed. */
export async function query<T extends QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const pool = getPool();
  if (!pool) throw new Error('DATABASE_URL is not set');
  await ensureSchema();
  const result = await pool.query<T>(text, params);
  return result.rows;
}

/** Run several statements as one transaction. */
export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = getPool();
  if (!pool) throw new Error('DATABASE_URL is not set');
  await ensureSchema();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
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
