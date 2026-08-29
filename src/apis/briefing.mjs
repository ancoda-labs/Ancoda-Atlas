#!/usr/bin/env node

// Atlas Master Orchestrator — runs every Nepal hazard source in parallel
// Outputs structured JSON for the LLM layer to synthesize into a briefing.
//
// Scope: natural hazards only. Earthquakes, monsoon flood and landslide,
// wildfire, hazardous air, and the humanitarian response that follows them.

import './utils/env.mjs'; // Load API keys from .env
import { pathToFileURL } from 'node:url';

// === Geophysical hazard ===
import { briefing as seismic } from './sources/seismic.mjs';

// === Hydro-meteorological hazard ===
import { briefing as weather } from './sources/weather.mjs';

// === Wildfire and smoke ===
import { briefing as firms } from './sources/firms.mjs';
import { briefing as airquality } from './sources/airquality.mjs';

// === Humanitarian response ===
import { briefing as reliefweb } from './sources/reliefweb.mjs';

const SOURCE_TIMEOUT_MS = 30_000; // 30s max per individual source

export async function runSource(name, fn, ...args) {
  const start = Date.now();
  let timer;
  try {
    const dataPromise = fn(...args);
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Source ${name} timed out after ${SOURCE_TIMEOUT_MS / 1000}s`)), SOURCE_TIMEOUT_MS);
    });
    const data = await Promise.race([dataPromise, timeoutPromise]);
    return { name, status: 'ok', durationMs: Date.now() - start, data };
  } catch (e) {
    return { name, status: 'error', durationMs: Date.now() - start, error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

export async function fullBriefing() {
  console.error('[Atlas] Starting Nepal hazard sweep — 5 sources...');
  const start = Date.now();

  const allPromises = [
    runSource('Seismic', seismic),
    runSource('Weather', weather),
    runSource('FIRMS', firms),
    runSource('AirQuality', airquality),
    runSource('ReliefWeb', reliefweb),
  ];

  // Each runSource carries its own timeout, so allSettled resolves within the
  // per-source budget even if an upstream API hangs.
  const results = await Promise.allSettled(allPromises);

  const sources = results.map(r => r.status === 'fulfilled' ? r.value : { status: 'failed', error: r.reason?.message });
  const totalMs = Date.now() - start;

  const output = {
    atlas: {
      version: '4.0.0-nepal-hazard',
      focus: 'Nepal',
      timestamp: new Date().toISOString(),
      totalDurationMs: totalMs,
      sourcesQueried: sources.length,
      sourcesOk: sources.filter(s => s.status === 'ok').length,
      sourcesFailed: sources.filter(s => s.status !== 'ok').length,
      // How often this sweep repeats, so a reader can be told not just how old
      // the figures are but when they next move.
      refreshIntervalMinutes: parseInt(process.env.REFRESH_INTERVAL_MINUTES) || 15,
    },
    sources: Object.fromEntries(
      sources.filter(s => s.status === 'ok').map(s => [s.name, s.data])
    ),
    errors: sources.filter(s => s.status !== 'ok').map(s => ({ name: s.name, error: s.error })),
    timing: Object.fromEntries(
      sources.map(s => [s.name, { status: s.status, ms: s.durationMs }])
    ),
  };

  console.error(`[Atlas] Sweep complete in ${totalMs}ms — ${output.atlas.sourcesOk}/${sources.length} sources returned data`);
  return output;
}

// Run and output when executed directly
const entryHref = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;

if (entryHref && import.meta.url === entryHref) {
  const data = await fullBriefing();
  console.log(JSON.stringify(data, null, 2));
}
