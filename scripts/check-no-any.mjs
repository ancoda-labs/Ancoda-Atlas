#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const sourceFiles = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '--', '*.ts', '*.tsx', '*.mts', '*.cts'],
  { encoding: 'utf8' },
)
  .split('\n')
  .filter((file) => file && existsSync(file));

const explicitAny = /(?:\bas\s+any\b|:\s*any\b|<\s*any\s*>|\bany\s*\[\s*\])/;
const violations = [];

for (const file of sourceFiles) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    if (explicitAny.test(line)) {
      violations.push(`${file}:${index + 1}: ${line.trim()}`);
    }
  });
}

if (violations.length > 0) {
  console.error('Explicit `any` types are not allowed:');
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log(`No explicit any types found in ${sourceFiles.length} TypeScript source files.`);
