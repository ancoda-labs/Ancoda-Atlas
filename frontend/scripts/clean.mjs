import { rm, access } from 'fs/promises';
import { join } from 'path';

const targets = [
  'runs/latest.json',
  'runs/dashboard.json',
  // The flood desk's restore snapshot. It was not listed here, so a `clean`
  // followed by a restart brought the same stale figures straight back —
  // which is exactly the confusion this script exists to clear.
  'runs/flood-desk.json',
  'runs/memory',
];

for (const target of targets) {
  const full = join(process.cwd(), target);
  try {
    await access(full);
    await rm(full, { recursive: true });
    console.log(`removed: ${target}`);
  } catch {
    // not found — skip silently
  }
}
