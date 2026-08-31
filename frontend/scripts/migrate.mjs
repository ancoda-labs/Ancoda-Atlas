#!/usr/bin/env node
// Check that the flood desk's Supabase schema has been applied.
//
// This script does not apply anything. Atlas reaches Supabase over PostgREST,
// which executes queries and functions but not DDL, so there is no path from
// here to a CREATE TABLE. What it can do — and what actually goes wrong on a
// new deploy — is tell you whether the tables the desk needs are reachable with
// the key you configured, before a reader finds out for you.

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import '../src/apis/utils/env.mjs';
import { createClient } from '@supabase/supabase-js';

const MIGRATION = resolve(dirname(fileURLToPath(import.meta.url)), '../supabase/migrations/0001_flood_desk.sql');
const TABLES = ['flood_photos', 'flood_photo_reports', 'rescue_corrections', 'news_digests'];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are not both set.');
  console.error('Copy .env.example to .env and fill them in.');
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const missing = [];
for (const table of TABLES) {
  // head:true — presence and permission are the whole question; no rows needed.
  const { error } = await db.from(table).select('id', { head: true, count: 'exact' });
  if (error) {
    missing.push({ table, reason: error.message });
    console.log(`  ✗ ${table} — ${error.message}`);
  } else {
    console.log(`  ✓ ${table}`);
  }
}

// The recount function is as load-bearing as the tables: without it a flagged
// photo can never reach the takedown threshold.
const { error: rpcError } = await db.rpc('flood_photo_recount', {
  p_photo_id: '00000000-0000-0000-0000-000000000000',
  p_threshold: 3,
});
if (rpcError) {
  missing.push({ table: 'flood_photo_recount()', reason: rpcError.message });
  console.log(`  ✗ flood_photo_recount() — ${rpcError.message}`);
} else {
  console.log('  ✓ flood_photo_recount()');
}

if (!missing.length) {
  console.log(`\nSchema present on ${url}`);
  process.exit(0);
}

console.error(`\n${missing.length} object(s) missing or unreachable on ${url}.`);
console.error('Apply the migration, then run this again:\n');
console.error('  supabase db push');
console.error(`\nor paste ${MIGRATION} into the Supabase SQL editor.`);
console.error('\nIf the tables do exist, check that SUPABASE_SECRET_KEY is the secret key');
console.error('and not the publishable one — row-level security hides these tables from it.\n');

await readFile(MIGRATION, 'utf8').catch(() => {
  console.error(`Warning: ${MIGRATION} is missing from this checkout.`);
});
process.exit(1);
