// Load .env file for API keys
//
// More than one candidate path on purpose. This module used to live at
// apis/utils/env.mjs, where the project root was '../..'; moving it to
// src/apis/utils/ made that resolve to src/ instead, so it loaded nothing —
// every key absent, every provider silently disabled, no error raised. The
// working directory goes first because npm scripts and `next` both set it to
// the project root no matter where this file ends up.
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const paths = [
  resolve(process.cwd(), '.env'),                // project root, however invoked
  resolve(__dirname, '..', '..', '..', '.env'),  // repo root from src/apis/utils
  resolve(__dirname, '..', '..', '.env'),        // legacy: apis/utils
  resolve(__dirname, '..', '.env'),              // legacy: apis/.env
];

function loadEnv(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    let loaded = 0;
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      // Strip surrounding quotes (single or double) to support special characters
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) { process.env[key] = val; loaded++; }
    }
    return loaded;
  } catch { return -1; }
}

for (const p of paths) {
  if (loadEnv(p) >= 0) break;
}
