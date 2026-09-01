import api from '@/config/axios';
import type { HazardSnapshot } from '@/types';

/** The synthesized hazard snapshot the landing dashboard renders. */
export async function fetchDashboardService(): Promise<HazardSnapshot> {
  const { data } = await api.get<HazardSnapshot>('/data');
  return data;
}

/**
 * BIPAD's national incident layer for the dashboard map.
 *
 * Fetched after first paint: the map is itself deferred, and this must not
 * compete with the hazard snapshot already in the HTML.
 */
export async function fetchBipadService() {
  const { data } = await api.get('/bipad');
  return data;
}
