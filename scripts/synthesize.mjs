#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { synthesize } from '../lib/synthesize.mjs';

const inputPath = 'runs/latest.json';
const outputPath = 'runs/dashboard.json';
const rawSweep = JSON.parse(await readFile(inputPath, 'utf8'));
const dashboard = await synthesize(rawSweep);

await writeFile(outputPath, `${JSON.stringify(dashboard, null, 2)}\n`);
console.log(`Wrote ${outputPath}`);
