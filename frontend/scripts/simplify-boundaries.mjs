#!/usr/bin/env node
// One-off (and re-runnable) reduction of Nepal admin outlines for 3G.
//
// The dashboard map was fetching 17MB of province vertices plus 2.2MB of
// districts. mapshaper keep-shapes holds topology; we only drop vertices.
// Output overwrites public/data/*.geojson — keep NOTICE attribution.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = join(root, 'public', 'data');

function run(file, pct) {
  const input = join(data, file);
  if (!existsSync(input)) {
    console.error(`missing ${input}`);
    process.exit(1);
  }
  const tmp = join(data, `${file}.tmp.geojson`);
  const result = spawnSync(
    'npx',
    [
      '--yes',
      'mapshaper@0.6.113',
      '-i',
      input,
      '-simplify',
      `${pct}%`,
      'keep-shapes',
      'weighted',
      '-o',
      tmp,
      'precision=0.0001',
    ],
    { cwd: root, stdio: 'inherit' },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
  spawnSync('mv', [tmp, input], { stdio: 'inherit' });
}

run('nepal-provinces.geojson', '1.2');
run('nepal-districts.geojson', '8');
