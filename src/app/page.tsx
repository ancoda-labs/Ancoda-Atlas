import { join } from 'path';
import { readFileSync, existsSync } from 'fs';
import type { HazardSnapshot } from '@/types';
import { errorMessage } from '@/types';
import { sweeper } from '@/lib/sweeper';
import DashboardClient from '@/app/_components/DashboardClient';

export const dynamic = 'force-dynamic';

async function getInitialData(): Promise<HazardSnapshot> {
  // Kick the scheduler if nothing has started it. On a host where
  // instrumentation.ts does not run, this is what gets the first sweep going;
  // it returns immediately and the result reaches the open page over SSE.
  sweeper.ensureStarted();

  // Try memory cache first
  if (sweeper.currentData) {
    return sweeper.currentData;
  }

  // Fallback to the last synthesized payload on disk. runs/latest.json is the
  // raw sweep and is not in the shape this page renders.
  const dashboardPath = join(process.cwd(), 'runs', 'dashboard.json');
  if (existsSync(dashboardPath)) {
    try {
      return JSON.parse(readFileSync(dashboardPath, 'utf8')) as HazardSnapshot;
    } catch (err) {
      console.error('[Next.js SSR] Failed to parse dashboard.json:', errorMessage(err));
    }
  }

  // Absolute fallback skeleton if no sweep runs have completed yet
  return {
    meta: {
      timestamp: new Date().toISOString(),
      sourcesOk: 0,
      sourcesQueried: 5,
      totalDurationMs: 0,
    },
    health: [],
    seismic: {
      recent: [], significant: [], maxMagnitude: null, strongest: null, byProvince: {},
      totalEvents: 0, events24h: 0, events7d: 0, signals: [],
    },
    weather: { monsoonSeason: false, totalAlerts: 0, alerts: [], stations: [], signals: [] },
    fire: {
      status: 'unavailable', fireSeason: false, totalDetections: 0,
      nightDetections: 0, highConfidence: 0, regions: [], signals: [],
    },
    airQuality: { totalReadings: 0, stations: [], worst: null, kathmandu: null, signals: [] },
    relief: { disasters: [], reports: [], error: null },
    news: [],
    impact: { count: 0, topRegions: [], headline: null },
    newsFeed: [],
    ideas: [],
    ideasSource: 'disabled',
  };
}

export default async function DashboardPage() {
  const initialData = await getInitialData();
  
  return (
    <main suppressHydrationWarning>
      {/* Background Grid Elements */}
      <div className="bg-grid" id="bgGrid" suppressHydrationWarning />
      <div className="bg-radial" id="bgRadial" suppressHydrationWarning />
      <div className="scanline" id="scanline" suppressHydrationWarning />
      
      <DashboardClient initialData={initialData} />
    </main>
  );
}
