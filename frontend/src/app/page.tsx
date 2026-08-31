import type { HazardSnapshot } from '@/types';
import { serverGet } from '@/lib/server-api';
import DashboardClient from '@/app/_components/DashboardClient';

export const dynamic = 'force-dynamic';

/**
 * The hazard snapshot, rendered into the first HTML.
 *
 * A reader on a slow connection gets the figures in the markup rather than
 * after a round trip. The client query then takes over, seeded with this.
 *
 * When the API has not swept yet — or cannot be reached — this falls back to
 * the empty skeleton below. Every counter is zero and every list empty, which
 * is the honest state: Atlas shows nothing rather than something invented.
 */
function emptySnapshot(): HazardSnapshot {
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
  const initialData = (await serverGet<HazardSnapshot>('/data')) ?? emptySnapshot();

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
