#!/usr/bin/env bash
# Codespaces / VS Code: make a working checkout without a local Node install.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example (optional keys still empty)."
fi

# Fill empty MinIO/PORT fields so they match the sidecar. Never overwrite a
# value the contributor already set.
node --input-type=module <<'JS'
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
if (!existsSync('.env')) process.exit(0);
const defaults = {
  MINIO_ENDPOINT: 'minio:9000',
  MINIO_PUBLIC_ENDPOINT: 'localhost:9000',
  MINIO_ROOT_USER: 'atlas',
  MINIO_ROOT_PASSWORD: 'atlas-devcontainer',
  MINIO_SECURE: 'false',
  MINIO_BUCKET: 'atlas',
  PORT: '3117',
};
const lines = readFileSync('.env', 'utf8').split('\n');
const seen = new Set();
const out = lines.map((line) => {
  const t = line.trim();
  if (!t || t.startsWith('#') || !t.includes('=')) return line;
  const eq = t.indexOf('=');
  const key = t.slice(0, eq).trim();
  const val = t.slice(eq + 1).trim();
  seen.add(key);
  if (key in defaults && val === '') return `${key}=${defaults[key]}`;
  return line;
});
for (const [key, val] of Object.entries(defaults)) {
  if (!seen.has(key)) out.push(`${key}=${val}`);
}
writeFileSync('.env', out.join('\n').replace(/\n*$/, '\n'));
JS

npm install
echo "Ready. Run: npm run dev   →  http://localhost:3117"
