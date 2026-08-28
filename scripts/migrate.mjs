#!/usr/bin/env node
// Apply the flood desk's Postgres schema.
//
// Idempotent — safe to run on every deploy, and safe to run twice. The server
// also applies this lazily on first use, so this script exists for the case
// where you want the tables to exist before any traffic arrives, and for
// checking that DATABASE_URL actually points somewhere.

import '../src/apis/utils/env.mjs';
import pg from 'pg';
import { SCHEMA_SQL } from '../src/lib/schema.mjs';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: url,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

try {
  await client.connect();
  await client.query(SCHEMA_SQL);
  const { rows } = await client.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('flood_photos', 'flood_photo_reports', 'news_digests')
      ORDER BY table_name`,
  );
  console.log(`Schema applied. Tables present: ${rows.map(r => r.table_name).join(', ') || 'none'}`);
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
