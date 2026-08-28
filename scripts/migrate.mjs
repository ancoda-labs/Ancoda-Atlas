#!/usr/bin/env node
// Apply the flood desk's Turso (libSQL) schema.
//
// Idempotent — safe to run on every deploy, and safe to run twice. The server
// also applies this lazily on first use, so this script exists for the case
// where you want the tables to exist before any traffic arrives, and for
// checking that the connection settings actually point somewhere.

import '../src/apis/utils/env.mjs';
import { createClient } from '@libsql/client';
import { SCHEMA_STATEMENTS } from '../src/lib/schema.mjs';

const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('TURSO_DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const client = createClient({
  url,
  // A local file: database takes no token; sending one is an error.
  authToken: url.startsWith('file:') ? undefined : process.env.TURSO_AUTH_TOKEN,
});

try {
  await client.batch(SCHEMA_STATEMENTS, 'write');
  const { rows } = await client.execute(
    `SELECT name FROM sqlite_master
      WHERE type = 'table'
        AND name IN ('flood_photos', 'flood_photo_reports', 'rescue_corrections', 'news_digests')
      ORDER BY name`,
  );
  console.log(`Schema applied to ${url}`);
  console.log(`Tables present: ${rows.map(r => r.name).join(', ') || 'none'}`);
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exitCode = 1;
} finally {
  client.close();
}
